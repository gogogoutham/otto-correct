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
import {
	addMember,
	groupsOfMeanings,
	prefixMeaningsForWord,
	setPrefixMeaning,
	suggestGroupsForMeanings
} from '#lib/server/groups.js';
import { addAiExample, aiClient, AiError, applyPrefixSuggestion } from '#lib/server/ai.js';
import { ANTHROPIC_API_KEY } from '$app/env/private';
import { GRAMMAR_FIELDS, grammarFromForm, meaningFields } from '#lib/grammar.js';
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
	const id = wordId(params.id);
	const [page, tags, prefixMeanings] = await Promise.all([
		guard(() => getWordPage(db, uid, id)),
		listTags(db, uid),
		prefixMeaningsForWord(db, uid, id)
	]);
	const [groups, suggested] = await Promise.all([
		groupsOfMeanings(
			db,
			uid,
			page.meanings.map((m) => m.id)
		),
		suggestGroupsForMeanings(db, uid, page.meanings)
	]);
	return {
		...page,
		tags,
		prefixMeanings,
		groupsByMeaning: Object.fromEntries(groups),
		suggestedGroups: Object.fromEntries(suggested),
		ai: !!ANTHROPIC_API_KEY,
		added: Number(url.searchParams.get('added')) || 0
	};
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

	meaning: async ({ request, locals, params }) => {
		const uid = userId(locals);
		const form = await request.formData();
		const meaningId = int(form, 'meaningId');
		const page = await guard(() => getWordPage(db, uid, wordId(params.id)));
		const glosses = text(form, 'glosses')
			.split('\n')
			.map((g) => g.trim())
			.filter(Boolean);
		if (!glosses.length) return fail(400, { message: 'A meaning needs at least one translation.' });
		await guard(async () => {
			await updateMeaning(db, uid, meaningId, {
				glosses,
				contextLabel: text(form, 'contextLabel'),
				grammar: grammarFromForm(meaningFields(page.word.pos), form, 'm-')
			});
			await setMeaningTags(db, uid, meaningId, parseTagList(text(form, 'tags')));
		});
		return { saved: meaningId };
	},

	/** The prefix meaning a verb meaning uses: adds it to that prefix-meaning group. */
	prefixMeaning: async ({ request, locals }) => {
		const form = await request.formData();
		const group = text(form, 'groupId');
		await guard(() =>
			setPrefixMeaning(db, userId(locals), int(form, 'meaningId'), group ? Number(group) : null)
		);
	},

	/** Asks the AI which prefix meaning this verb meaning shows, and records it. */
	suggestPrefix: async ({ request, locals }) => {
		const client = aiClient(ANTHROPIC_API_KEY);
		if (!client) return fail(400, { message: 'AI suggestions are not set up.' });
		const form = await request.formData();
		const meaningId = int(form, 'meaningId');
		try {
			const label = await guard(() => applyPrefixSuggestion(db, client, userId(locals), meaningId));
			return { suggested: { meaningId, label } };
		} catch (e) {
			if (e instanceof AiError) return fail(502, { message: e.message });
			throw e;
		}
	},

	/** Adds a meaning to a contrast group whose label its translation matches. */
	joinGroup: async ({ request, locals }) => {
		const form = await request.formData();
		await guard(() => addMember(db, userId(locals), int(form, 'groupId'), int(form, 'meaningId')));
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

	/** Drafts an example sentence with AI, saved and labelled as such. */
	aiExample: async ({ request, locals }) => {
		const client = aiClient(ANTHROPIC_API_KEY);
		if (!client) return fail(400, { message: 'AI examples are not set up.' });
		const form = await request.formData();
		try {
			await guard(() => addAiExample(db, client, userId(locals), int(form, 'meaningId')));
		} catch (e) {
			if (e instanceof AiError) return fail(502, { message: e.message });
			throw e;
		}
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
