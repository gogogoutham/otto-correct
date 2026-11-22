import { describe, expect, it } from 'vitest';
import {
	SESSION_RENEW_WITHIN_MS,
	SESSION_TTL_MS,
	checkSessionExpiry,
	generateSessionToken,
	sessionIdFromToken
} from './session-token';

describe('session tokens', () => {
	it('generates distinct, URL-safe tokens', () => {
		const a = generateSessionToken();
		const b = generateSessionToken();
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it('stores a stable hash, never the token itself', () => {
		const token = generateSessionToken();
		expect(sessionIdFromToken(token)).toBe(sessionIdFromToken(token));
		expect(sessionIdFromToken(token)).not.toContain(token);
		expect(sessionIdFromToken(token)).toMatch(/^[0-9a-f]{64}$/);
	});
});

describe('checkSessionExpiry', () => {
	const now = new Date('2026-11-22T12:00:00Z');
	const at = (ms: number) => new Date(now.getTime() + ms);

	it('keeps a fresh session', () => {
		expect(checkSessionExpiry(at(SESSION_TTL_MS), now)).toBe('valid');
	});

	it('renews a session close to expiry', () => {
		expect(checkSessionExpiry(at(SESSION_RENEW_WITHIN_MS - 1), now)).toBe('renew');
	});

	it('rejects an expired session', () => {
		expect(checkSessionExpiry(at(0), now)).toBe('expired');
		expect(checkSessionExpiry(at(-1), now)).toBe('expired');
	});
});
