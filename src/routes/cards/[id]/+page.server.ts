import { error } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { NotFoundError } from '#lib/server/collection.js';
import { cardActions } from '#lib/server/card-actions.js';
import { getCard, parseDirection } from '#lib/server/cards.js';
import { userId } from '#lib/server/forms.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Card not found');
	try {
		return {
			card: await getCard(db, userId(locals), id),
			direction: parseDirection(url.searchParams.get('dir'))
		};
	} catch (e) {
		if (e instanceof NotFoundError) error(404, 'Card not found');
		throw e;
	}
};

export const actions: Actions = cardActions;
