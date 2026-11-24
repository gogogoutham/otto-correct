import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import * as table from '#lib/server/db/schema.js';
import { db } from '#lib/server/db/index.js';
import { listTags } from '#lib/server/collection.js';
import { cardActions } from '#lib/server/card-actions.js';
import { getCard } from '#lib/server/cards.js';
import { getGroup } from '#lib/server/groups.js';
import { int, text, userId } from '#lib/server/forms.js';
import { loadStudyData, queueFor, recordReview } from '#lib/server/study.js';
import { parseSessionParams } from '#lib/session-params.js';
import type { Actions, PageServerLoad } from './$types';

const isFlagged = async (cardId: number) =>
	(
		await db
			.select({ flagged: table.card.flagged })
			.from(table.card)
			.where(eq(table.card.id, cardId))
	)[0]?.flagged ?? false;

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
		group: next?.groupId ? await getGroup(db, uid, next.groupId) : null,
		flagged: next ? await isFlagged(next.id) : false,
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
