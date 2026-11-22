import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { createManualWord, listTags, parseTagList } from '#lib/server/collection.js';
import { text, userId } from '#lib/server/forms.js';
import { GRAMMAR_FIELDS, grammarFromForm, PARTS_OF_SPEECH, type Grammar } from '#lib/grammar.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => ({
	headword: url.searchParams.get('headword') ?? '',
	tags: await listTags(db, userId(locals))
});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const uid = userId(locals);
		const form = await request.formData();
		const headword = text(form, 'headword');
		const pos = PARTS_OF_SPEECH.find((p) => p === text(form, 'pos'));
		const gloss = text(form, 'gloss');
		if (!headword || !pos || !gloss)
			return fail(400, { message: 'Fill in the word, its part of speech and a translation.' });
		const grammar: Grammar = Object.fromEntries(
			Object.entries(grammarFromForm(GRAMMAR_FIELDS[pos], form)).filter(([, v]) => v !== undefined)
		);
		const wordId = await createManualWord(db, uid, {
			headword,
			pos,
			grammar,
			gloss,
			contextLabel: text(form, 'contextLabel'),
			exampleGerman: text(form, 'exampleGerman'),
			exampleEnglish: text(form, 'exampleEnglish'),
			status: text(form, 'status') === 'known' ? 'known' : 'studying',
			tags: parseTagList(text(form, 'tags'))
		});
		redirect(303, `/words/${wordId}?added=1`);
	}
};
