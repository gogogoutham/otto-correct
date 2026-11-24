import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { text, userId } from '#lib/server/forms.js';
import { createGroup, listGroups, loadStarterSet } from '#lib/server/groups.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	groups: await listGroups(db, userId(locals))
});

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const label = text(form, 'label');
		if (!label) return fail(400, { message: 'The group needs a name, e.g. "to (a place)".' });
		const id = await createGroup(db, userId(locals), { kind: 'contrast', label });
		redirect(303, `/groups/${id}`);
	},

	starter: async ({ locals }) => {
		const result = await loadStarterSet(db, userId(locals));
		return { starter: result };
	}
};
