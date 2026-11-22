import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Sessions used within this window of expiry are extended. */
export const SESSION_RENEW_WITHIN_MS = 15 * 24 * 60 * 60 * 1000;

export function generateSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

/** Only the hash is stored, so a leaked database row can't be replayed as a cookie. */
export function sessionIdFromToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export type SessionCheck = 'valid' | 'renew' | 'expired';

export function checkSessionExpiry(expiresAt: Date, now: Date = new Date()): SessionCheck {
	const remaining = expiresAt.getTime() - now.getTime();
	if (remaining <= 0) return 'expired';
	if (remaining < SESSION_RENEW_WITHIN_MS) return 'renew';
	return 'valid';
}
