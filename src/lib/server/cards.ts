/**
 * Everything one card shows: the front in either direction and the back, built from the
 * meaning, its word, the grammar rules, other meanings and homographs.
 */
import type { Db } from './dictionary/store.js';
import { getWordPage, wordIdOfMeaning } from './collection.js';
import { buildCardBack, cleanGloss, type CardBack } from '#lib/card-back.js';
import { posLabel, type Grammar, type PartOfSpeech } from '#lib/grammar.js';

export type Direction = 'en_de' | 'de_en';
export const parseDirection = (v: string | null): Direction => (v === 'de_en' ? 'de_en' : 'en_de');

export interface OtherMeaning {
	/** A collection meaning, or a source sense not yet added. */
	meaningId: number | null;
	senseId: number | null;
	gloss: string;
	status: 'studying' | 'known' | 'not_in_deck';
}

export interface Homograph {
	title: string;
	pos: PartOfSpeech;
	gloss: string | null;
	/** Set when it's in the collection; otherwise it opens the dictionary search. */
	wordId: number | null;
}

export interface CardView {
	meaningId: number;
	wordId: number;
	headword: string;
	pos: PartOfSpeech;
	/** The part of speech as shown, e.g. "postposition". */
	posLabel: string;
	flagged: boolean;
	deckStatus: string;
	glosses: string[];
	contextLabel: string | null;
	back: CardBack;
	examples: { german: string; english: string | null; source: string }[];
	others: OtherMeaning[];
	homographs: Homograph[];
}

export async function getCard(db: Db, userId: string, meaningId: number): Promise<CardView> {
	const page = await getWordPage(db, userId, await wordIdOfMeaning(db, userId, meaningId));
	const m = page.meanings.find((x) => x.id === meaningId)!;
	const word = {
		headword: page.word.headword,
		pos: page.word.pos,
		grammar: page.word.grammar as Grammar
	};
	const title = (h: { headword: string; pos: PartOfSpeech; grammar: unknown }) =>
		buildCardBack({ headword: h.headword, pos: h.pos, grammar: h.grammar as Grammar }).title;

	return {
		meaningId,
		wordId: page.word.id,
		headword: page.word.headword,
		pos: page.word.pos,
		posLabel: posLabel(page.word.pos, word.grammar),
		flagged: m.flagged ?? false,
		deckStatus: m.deckStatus,
		glosses: m.glosses.map(cleanGloss),
		contextLabel: m.contextLabel,
		back: buildCardBack(word, m.grammar as Grammar),
		examples: m.examples.map((e) => ({ german: e.german, english: e.english, source: e.source })),
		others: [
			...page.meanings
				.filter((x) => x.id !== meaningId)
				.map((x) => ({
					meaningId: x.id,
					senseId: null,
					gloss: x.glosses.map(cleanGloss).join('; '),
					status: x.deckStatus
				})),
			...page.sourceSenses.map((s) => ({
				meaningId: null,
				senseId: s.id,
				gloss: s.glosses.map(cleanGloss).join('; '),
				status: 'not_in_deck' as const
			}))
		],
		homographs: [
			...page.homographs.collection.map((h) => ({
				title: title(h),
				pos: h.pos,
				gloss: h.firstGloss ? cleanGloss(h.firstGloss) : null,
				wordId: h.id
			})),
			...page.homographs.dictionary.map((h) => ({
				title: title(h),
				pos: h.pos,
				gloss: h.firstGloss ? cleanGloss(h.firstGloss) : null,
				wordId: null
			}))
		]
	};
}
