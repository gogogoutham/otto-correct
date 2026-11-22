import { error, fail } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import {
	addExample,
	addFromDictionary,
	addManualMeaning,
	deleteExample,
	getWordPage,
	listTags,
	NotFoundError,
	parseTagList,
	resyncWord,
	setDeckStatus,
	setMeaningTags,
	updateMeaning,
	updateWordGrammar,
	type DeckStatus
} from '#lib/server/collection.js';
import { int, senseSelections, text, userId } from '#lib/server/forms.js';
import { GRAMMAR_FIELDS, grammarFromForm, MEANING_FIELDS } from '#lib/grammar.js';
import type { Actions, PageServerLoad } from './$types';

const wordId = (id: string) => {
	const n = Number(id);
	if (!Number.isInteger(n) || n <= 0) error(404, 'Word not found');
	return n;
};

/** Turns a missing word or meaning into a 404 rather than a 500. */
async function guard<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (e) {
		if (e instanceof NotFoundError) error(404, e.message);
		throw e;
	}
}

const STATUSES: DeckStatus[] = ['studying', 'known', 'not_in_deck'];
const NEW_STATUSES = ['studying', 'known'] as const;

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const uid = userId(locals);
	const [page, tags] = await Promise.all([
		guard(() => getWordPage(db, uid, wordId(params.id))),
		listTags(db, uid)
	]);
	return { ...page, tags, added: Number(url.searchParams.get('added')) || 0 };
};

export const actions: Actions = {
	grammar: async ({ request, locals, params }) => {
		const uid = userId(locals);
		const id = wordId(params.id);
		const form = await request.formData();
		const page = await guard(() => getWordPage(db, uid, id));
		const headword = text(form, 'headword');
		if (!headword) return fail(400, { message: 'The word needs a spelling.' });
		await updateWordGrammar(
			db,
			uid,
			id,
			grammarFromForm(GRAMMAR_FIELDS[page.word.pos], form),
			headword
		);
		return { saved: 'word' };
	},

	meaning: async ({ request, locals }) => {
		const uid = userId(locals);
		const form = await request.formData();
		const meaningId = int(form, 'meaningId');
		const glosses = text(form, 'glosses')
			.split(/[;\n]/)
			.map((g) => g.trim())
			.filter(Boolean);
		if (!glosses.length) return fail(400, { message: 'A meaning needs at least one translation.' });
		await guard(async () => {
			await updateMeaning(db, uid, meaningId, {
				glosses,
				contextLabel: text(form, 'contextLabel'),
				grammar: grammarFromForm(MEANING_FIELDS, form, 'm-')
			});
			await setMeaningTags(db, uid, meaningId, parseTagList(text(form, 'tags')));
		});
		return { saved: meaningId };
	},

	status: async ({ request, locals }) => {
		const uid = userId(locals);
		const form = await request.formData();
		const status = text(form, 'status') as DeckStatus;
		if (!STATUSES.includes(status)) return fail(400, { message: 'Unknown status.' });
		await guard(() => setDeckStatus(db, uid, int(form, 'meaningId'), status));
	},

	addExample: async ({ request, locals }) => {
		const uid = userId(locals);
		const form = await request.formData();
		const german = text(form, 'german');
		if (!german) return fail(400, { message: 'Write the German sentence.' });
		await guard(() =>
			addExample(db, uid, int(form, 'meaningId'), german, text(form, 'english') || null)
		);
	},

	deleteExample: async ({ request, locals }) => {
		const form = await request.formData();
		await deleteExample(db, userId(locals), int(form, 'exampleId'));
	},

	addSenses: async ({ request, locals, params }) => {
		const uid = userId(locals);
		const form = await request.formData();
		const selections = senseSelections(form);
		if (!selections.length) return fail(400, { message: 'Pick at least one meaning.' });
		const page = await guard(() => getWordPage(db, uid, wordId(params.id)));
		if (!page.word.dictWordId) return fail(400, { message: 'This word has no dictionary entry.' });
		await addFromDictionary(
			db,
			uid,
			page.word.dictWordId,
			selections,
			parseTagList(text(form, 'tags'))
		);
	},

	addMeaning: async ({ request, locals, params }) => {
		const uid = userId(locals);
		const form = await request.formData();
		const gloss = text(form, 'gloss');
		if (!gloss) return fail(400, { message: 'Write the translation.' });
		const status = text(form, 'status');
		await guard(() =>
			addManualMeaning(db, uid, wordId(params.id), {
				gloss,
				contextLabel: text(form, 'contextLabel'),
				exampleGerman: text(form, 'exampleGerman'),
				exampleEnglish: text(form, 'exampleEnglish'),
				status: NEW_STATUSES.find((s) => s === status) ?? 'studying',
				tags: parseTagList(text(form, 'tags'))
			})
		);
	},

	resync: async ({ locals, params }) => {
		const { refreshed } = await guard(() => resyncWord(db, userId(locals), wordId(params.id)));
		return { resynced: refreshed ? 'source' : 'offline' };
	}
};
