import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { addFromDictionary, listTags, parseTagList } from '#lib/server/collection.js';
import { int, senseSelections, text, userId } from '#lib/server/forms.js';
import { search, searchRemote } from '#lib/server/search.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const uid = userId(locals);
	const q = (url.searchParams.get('q') ?? '').trim();
	const [results, tags] = await Promise.all([search(db, uid, q), listTags(db, uid)]);
	return {
		q,
		results,
		tags,
		// Streams in after the page renders: the source can take a few seconds.
		remote: results.tryRemote ? searchRemote(db, uid, q) : null
	};
};

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const uid = userId(locals);
		const form = await request.formData();
		const selections = senseSelections(form);
		if (!selections.length) return fail(400, { message: 'Pick at least one meaning.' });
		const wordId = await addFromDictionary(
			db,
			uid,
			int(form, 'dictWordId'),
			selections,
			parseTagList(text(form, 'tags'))
		);
		redirect(303, `/words/${wordId}?added=${selections.length}`);
	}
};
