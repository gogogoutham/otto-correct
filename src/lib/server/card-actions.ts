/** Form actions shared by every page that shows a card. */
import { fail, type RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from './db/index.js';
import * as table from './db/schema.js';
import { addFromDictionary, setDeckStatus, setFlag } from './collection.js';
import { int, text, userId } from './forms.js';

export const cardActions = {
	/** Adds a meaning shown as "not yet encountered" on a card back. */
	addToDeck: async ({ request, locals }: RequestEvent) => {
		const uid = userId(locals);
		const form = await request.formData();
		if (text(form, 'meaningId')) {
			await setDeckStatus(db, uid, int(form, 'meaningId'), 'studying');
			return;
		}
		const [w] = await db
			.select({ dictWordId: table.word.dictWordId })
			.from(table.word)
			.where(and(eq(table.word.id, int(form, 'wordId')), eq(table.word.userId, uid)));
		if (!w?.dictWordId) return fail(404, { message: 'Word not found.' });
		await addFromDictionary(db, uid, w.dictWordId, [
			{ dictSenseId: int(form, 'senseId'), status: 'studying' }
		]);
	},

	flag: async ({ request, locals }: RequestEvent) => {
		const form = await request.formData();
		const flagged = text(form, 'flagged') === 'true';
		const uid = userId(locals);
		// Group cards have no meaning: they are flagged by card.
		if (text(form, 'cardId'))
			await db
				.update(table.card)
				.set({ flagged })
				.where(and(eq(table.card.id, int(form, 'cardId')), eq(table.card.userId, uid)));
		else await setFlag(db, uid, int(form, 'meaningId'), flagged);
	},

	/** Marks the current meaning known: it leaves all scheduled sessions. */
	known: async ({ request, locals }: RequestEvent) => {
		const form = await request.formData();
		await setDeckStatus(db, userId(locals), int(form, 'meaningId'), 'known');
	}
};
