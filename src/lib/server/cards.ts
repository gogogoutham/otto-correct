/**
 * Everything one card shows: the front in either direction and the back, built from the
 * meaning, its word, the grammar rules, other meanings and homographs.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import * as table from './db/schema.js';
import type { Db } from './dictionary/store.js';
import { getWordPage, wordIdOfMeaning } from './collection.js';
import { buildCardBack, cleanGloss, type CardBack } from '#lib/card-back.js';
import type { Grammar, PartOfSpeech } from '#lib/grammar.js';

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

export interface PracticeFilter {
	tags: string[];
	pos: PartOfSpeech | null;
}

/**
 * The meanings a practice run walks through: studying meanings, oldest queued first,
 * matching any selected tag and the part of speech. Scheduling replaces this in M5.
 */
export async function practiceQueue(
	db: Db,
	userId: string,
	filter: PracticeFilter
): Promise<number[]> {
	const conditions = [eq(table.meaning.userId, userId), eq(table.meaning.deckStatus, 'studying')];
	if (filter.pos) conditions.push(eq(table.word.pos, filter.pos));
	if (filter.tags.length)
		conditions.push(
			inArray(
				table.meaning.id,
				db
					.select({ id: table.meaningTag.meaningId })
					.from(table.meaningTag)
					.innerJoin(table.tag, eq(table.tag.id, table.meaningTag.tagId))
					.where(and(eq(table.tag.userId, userId), inArray(table.tag.name, filter.tags)))
			)
		);
	const rows = await db
		.select({ id: table.meaning.id })
		.from(table.meaning)
		.innerJoin(table.word, eq(table.word.id, table.meaning.wordId))
		.leftJoin(table.card, eq(table.card.meaningId, table.meaning.id))
		.where(and(...conditions))
		.orderBy(sql`${table.card.queuedAt} nulls last`, asc(table.meaning.id));
	return rows.map((r) => r.id);
}
