import { db } from '#lib/server/db/index.js';
import { listTags } from '#lib/server/collection.js';
import { cardActions } from '#lib/server/card-actions.js';
import { getCard, parseDirection, practiceQueue } from '#lib/server/cards.js';
import { userId } from '#lib/server/forms.js';
import { PARTS_OF_SPEECH } from '#lib/grammar.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = userId(locals);
	const params = url.searchParams;
	const tags = params.getAll('tag').filter(Boolean);
	const pos = PARTS_OF_SPEECH.find((p) => p === params.get('pos')) ?? null;
	const direction = parseDirection(params.get('dir'));
	const [queue, allTags] = await Promise.all([
		practiceQueue(db, uid, { tags, pos }),
		listTags(db, uid)
	]);
	const index = Math.min(Math.max(Number(params.get('i')) || 0, 0), Math.max(queue.length - 1, 0));
	return {
		filter: { tags, pos, direction },
		allTags,
		total: queue.length,
		index,
		card: queue.length ? await getCard(db, uid, queue[index]) : null
	};
};

export const actions: Actions = cardActions;
