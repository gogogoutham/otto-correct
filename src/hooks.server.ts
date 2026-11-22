import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE } from '#lib/server/session-token.js';
import { clearSessionCookie, setSessionCookie, validateSessionToken } from '#lib/server/auth.js';

const PUBLIC_PATHS = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = null;

	if (token) {
		const result = await validateSessionToken(token);
		if (result) {
			event.locals.user = result.user;
			setSessionCookie(event.cookies, token, result.expiresAt);
		} else {
			clearSessionCookie(event.cookies);
		}
	}

	if (!event.locals.user && !PUBLIC_PATHS.includes(event.url.pathname)) {
		const next = event.url.pathname + event.url.search;
		redirect(303, next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`);
	}

	return resolve(event);
};
