import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { addFromDictionary, listTags, parseTagList } from '#lib/server/collection.js';
import { int, senseSelections, text, userId } from '#lib/server/forms.js';
import { search, searchRemote } from '#lib/server/search.js';
import { getGroup, searchGroups } from '#lib/server/groups.js';
import * as table from '#lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const uid = userId(locals);
	const q = (url.searchParams.get('q') ?? '').trim();
	const prefixTerm = q.toLowerCase().replace(/-$/, '');
	const [results, tags, groupHits, prefix] = await Promise.all([
		search(db, uid, q),
		listTags(db, uid),
		searchGroups(db, uid, q),
		q
			? db
					.select({ prefix: table.prefix.prefix, type: table.prefix.type })
					.from(table.prefix)
					.where(eq(table.prefix.prefix, prefixTerm))
			: []
	]);
	// "ver-" is clearly a prefix; a bare "ver" only offers it next to the results.
	if (prefix.length && q.endsWith('-')) redirect(303, `/prefixes/${prefix[0].prefix}`);
	const groups = await Promise.all(groupHits.map((g) => getGroup(db, uid, g.id)));
	return {
		q,
		results,
		tags,
		groups,
		prefix: prefix[0] ?? null,
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
