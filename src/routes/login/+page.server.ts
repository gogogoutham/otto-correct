import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from '$app/env/private';
import { db } from '#lib/server/db/index.js';
import * as table from '#lib/server/db/schema.js';
import {
	bootstrapFirstUser,
	createSession,
	setSessionCookie,
	verifyPassword
} from '#lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types';

/** Only allow same-site relative redirects after login. */
function safeNext(next: string | null): string {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const rawUsername = form.get('username');
		const rawPassword = form.get('password');
		const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
		const password = typeof rawPassword === 'string' ? rawPassword : '';

		if (!username || !password) {
			return fail(400, { username, message: 'Enter your username and password.' });
		}

		const [existing] = await db
			.select({ id: table.user.id, passwordHash: table.user.passwordHash })
			.from(table.user)
			.where(eq(table.user.username, username));

		let userId: string | null = null;
		if (existing) {
			if (await verifyPassword(existing.passwordHash, password)) userId = existing.id;
		} else {
			userId = await bootstrapFirstUser(username, password, {
				username: ADMIN_USERNAME,
				password: ADMIN_PASSWORD
			});
		}

		if (!userId) {
			return fail(400, { username, message: 'Wrong username or password.' });
		}

		const { token, expiresAt } = await createSession(userId);
		setSessionCookie(cookies, token, expiresAt);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
