import { fail } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { text, userId } from '#lib/server/forms.js';
import { getSettings, isTimeZone, updateSettings } from '#lib/server/study.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	settings: await getSettings(db, userId(locals))
});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const timeZone = text(form, 'timeZone');
		const limit = Number(text(form, 'dailyNewLimit'));
		const order = text(form, 'reviewOrder');
		if (!isTimeZone(timeZone)) return fail(400, { message: `Unknown time zone "${timeZone}".` });
		if (!Number.isInteger(limit) || limit < 0 || limit > 100)
			return fail(400, { message: 'The daily limit must be a whole number from 0 to 100.' });
		if (order !== 'oldest_first' && order !== 'shuffled')
			return fail(400, { message: 'Unknown review order.' });
		await updateSettings(db, userId(locals), {
			timeZone,
			dailyNewLimit: limit,
			reviewOrder: order
		});
		return { saved: true };
	}
};
