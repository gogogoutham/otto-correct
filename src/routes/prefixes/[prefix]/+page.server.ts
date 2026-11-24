import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { cardActions } from '#lib/server/card-actions.js';
import { guard, text, userId } from '#lib/server/forms.js';
import { createGroup, getPrefix } from '#lib/server/groups.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => ({
	prefix: await guard(() => getPrefix(db, userId(locals), params.prefix))
});

export const actions: Actions = {
	addToDeck: cardActions.addToDeck,

	/** A new prefix meaning, e.g. "ver-: doing something wrong". */
	meaning: async ({ request, locals, params }) => {
		const uid = userId(locals);
		const p = await guard(() => getPrefix(db, uid, params.prefix));
		const label = text(await request.formData(), 'label');
		if (!label) return fail(400, { message: 'Name the meaning, e.g. "doing something wrong".' });
		const id = await createGroup(db, uid, { kind: 'prefix_meaning', label, prefixId: p.id });
		redirect(303, `/groups/${id}`);
	}
};
