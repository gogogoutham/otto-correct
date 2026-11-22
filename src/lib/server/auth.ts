import { hash, verify } from '@node-rs/argon2';
import { count, eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/env';
import { db } from './db';
import * as table from './db/schema';
import {
	SESSION_COOKIE,
	SESSION_TTL_MS,
	checkSessionExpiry,
	generateSessionToken,
	sessionIdFromToken
} from './session-token';

// OWASP-recommended minimums for argon2id.
const HASH_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (password: string) => hash(password, HASH_OPTIONS);
export const verifyPassword = (passwordHash: string, password: string) =>
	verify(passwordHash, password);

export type SessionUser = Pick<table.User, 'id' | 'username' | 'timeZone'>;

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
	const token = generateSessionToken();
	const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
	await db.insert(table.session).values({ id: sessionIdFromToken(token), userId, expiresAt });
	return { token, expiresAt };
}

export async function validateSessionToken(
	token: string
): Promise<{ user: SessionUser; expiresAt: Date } | null> {
	const id = sessionIdFromToken(token);
	const [row] = await db
		.select({
			user: { id: table.user.id, username: table.user.username, timeZone: table.user.timeZone },
			expiresAt: table.session.expiresAt
		})
		.from(table.session)
		.innerJoin(table.user, eq(table.session.userId, table.user.id))
		.where(eq(table.session.id, id));
	if (!row) return null;

	const status = checkSessionExpiry(row.expiresAt);
	if (status === 'expired') {
		await db.delete(table.session).where(eq(table.session.id, id));
		return null;
	}
	if (status === 'renew') {
		const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
		await db.update(table.session).set({ expiresAt }).where(eq(table.session.id, id));
		return { user: row.user, expiresAt };
	}
	return row;
}

export async function invalidateSession(token: string): Promise<void> {
	await db.delete(table.session).where(eq(table.session.id, sessionIdFromToken(token)));
}

export function setSessionCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		expires: expiresAt
	});
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

/**
 * Creates the first account from ADMIN_USERNAME / ADMIN_PASSWORD, but only while no
 * account exists and only when the submitted credentials match. Returns the new user's id.
 */
export async function bootstrapFirstUser(
	username: string,
	password: string,
	admin: { username?: string; password?: string }
): Promise<string | null> {
	if (!admin.username || !admin.password) return null;
	if (username !== admin.username || password !== admin.password) return null;

	const [{ users }] = await db.select({ users: count() }).from(table.user);
	if (users > 0) return null;

	const [created] = await db
		.insert(table.user)
		.values({ username, passwordHash: await hashPassword(password) })
		.onConflictDoNothing()
		.returning({ id: table.user.id });
	return created?.id ?? null;
}
