/** Small helpers for reading form posts. */
import { error } from '@sveltejs/kit';
import { NotFoundError, type SenseSelection } from './collection.js';

export const text = (form: FormData, name: string): string => {
	const v = form.get(name);
	return typeof v === 'string' ? v.trim() : '';
};

export const int = (form: FormData, name: string): number => {
	const n = Number(text(form, name));
	if (!Number.isInteger(n) || n <= 0) error(400, `Bad ${name}`);
	return n;
};

/** The `sense-<id>` radio choices of the add form. */
export function senseSelections(form: FormData): SenseSelection[] {
	const out: SenseSelection[] = [];
	for (const [key, value] of form.entries()) {
		const m = /^sense-(\d+)$/.exec(key);
		if (m && (value === 'studying' || value === 'known'))
			out.push({ dictSenseId: Number(m[1]), status: value });
	}
	return out;
}

export function userId(locals: App.Locals): string {
	if (!locals.user) error(401, 'Not logged in');
	return locals.user.id;
}

/** A positive integer route parameter, or a 404. */
export function idParam(id: string, what = 'Page'): number {
	const n = Number(id);
	if (!Number.isInteger(n) || n <= 0) error(404, `${what} not found`);
	return n;
}

/** Turns a missing row (NotFoundError) into a 404 rather than a 500. */
export async function guard<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (e) {
		if (e instanceof NotFoundError) error(404, e.message);
		throw e;
	}
}
