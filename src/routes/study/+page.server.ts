import { fail } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { listTags } from '#lib/server/collection.js';
import { cardActions } from '#lib/server/card-actions.js';
import { getCard } from '#lib/server/cards.js';
import { int, text, userId } from '#lib/server/forms.js';
import { loadStudyData, queueFor, recordReview } from '#lib/server/study.js';
import { parseSessionParams } from '#lib/session-params.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = userId(locals);
	const data = await loadStudyData(db, uid);
	const session = parseSessionParams(url.searchParams, data.settings.reviewOrder);
	const queue = queueFor(data, session.selection, session, session.direction);
	const next = data.cards.find((c) => c.id === queue[0]);
	return {
		session,
		left: queue.length,
		cardId: next?.id ?? null,
		card: next?.meaningId ? await getCard(db, uid, next.meaningId) : null,
		allTags: await listTags(db, uid)
	};
};

export const actions: Actions = {
	...cardActions,

	/** Flip, then "Next": logs the review. The card then drops out of today's queue. */
	reviewed: async ({ request, locals }) => {
		const form = await request.formData();
		const type = text(form, 'sessionType');
		if (type !== 'new' && type !== 'review' && type !== 'cram')
			return fail(400, { message: 'Unknown session type.' });
		await recordReview(
			db,
			userId(locals),
			int(form, 'cardId'),
			text(form, 'direction') === 'de_en' ? 'de_en' : 'en_de',
			type
		);
	}
};
