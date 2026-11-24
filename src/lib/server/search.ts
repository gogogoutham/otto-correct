/**
 * One search box over the user's collection and the shared dictionary.
 *
 * German matching folds case and umlauts (ä = ae, ß = ss, so "Mueller" finds "Müller"),
 * matches inflected forms ("fuhr" finds "fahren"), prefixes and near-misses (trigrams).
 * English matching looks for the term as a whole word in the glosses.
 */
import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import * as table from './db/schema.js';
import type { Db } from './dictionary/store.js';
import { lookupGerman, SourceUnavailableError } from './dictionary/lookup.js';
import type { Grammar, PartOfSpeech } from '#lib/grammar.js';

const DICTIONARY_LIMIT = 15;
const COLLECTION_LIMIT = 20;

export interface CollectionHit {
	id: number;
	headword: string;
	pos: PartOfSpeech;
	grammar: Grammar;
	meanings: { glosses: string[]; deckStatus: string }[];
}

export interface DictionarySense {
	id: number;
	glosses: string[];
	details: Record<string, unknown>;
	example: { german: string; english: string | null } | null;
	inCollection: boolean;
}

export interface DictionaryHit {
	id: number;
	headword: string;
	pos: PartOfSpeech;
	grammar: Grammar;
	/** The collection word made from this entry, if any. */
	wordId: number | null;
	/** How the query matched: the headword, an inflected form, or an English gloss. */
	match: 'headword' | 'form' | 'similar' | 'english';
	senses: DictionarySense[];
}

export interface SearchResults {
	collection: CollectionHit[];
	dictionary: DictionaryHit[];
	/** True when no entry matches the term exactly, so the source is worth asking. */
	tryRemote: boolean;
}

const GLOSS_SEPARATOR = String.raw`\s*[,;]\s*`;
const TRAILING_NOTE = String.raw`\s*\(.*\)$`;
/** Raw `execute` results are row arrays; the driver-agnostic Db type doesn't say so. */
const rowsOf = <T>(result: unknown) => result as T[];
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Looks like a single German word (letters, maybe a hyphen or apostrophe). */
const singleWord = (s: string) => /^[\p{L}][\p{L}'-]*$/u.test(s);

export async function search(db: Db, userId: string, query: string): Promise<SearchResults> {
	const term = query.trim().replace(/\s+/g, ' ');
	if (!term) return { collection: [], dictionary: [], tryRemote: false };
	const lower = term.toLocaleLowerCase('de');
	const like = `${escapeLike(lower)}%`;
	const englishWord = `\\m${escapeRegex(lower)}\\M`;

	const collection = await searchCollection(db, userId, term, like, englishWord);

	const rows = rowsOf<{ id: number; rank: number; sim: number }>(
		await db.execute(sql`
		with q as (select de_fold(${term}) as f),
		candidates as (
			select w.id, 0 as rank from dict_word w, q where de_fold(w.headword) = q.f
			union all
			-- Umlauts typed as plain vowels: "uber" finds "über".
			select w.id, 0.5 from dict_word w
				where de_plain(w.headword) = de_plain(${term})
			union all
			select f.dict_word_id, 1 from dict_form f, q where de_fold(f.form) = q.f
			union all
			select w.id, 2 from dict_word w, q
				where de_fold(w.headword) like ${like} and length(q.f) >= 2
			union all
			select w.id, 3 from dict_word w, q where de_fold(w.headword) % q.f
			union all
			select s.dict_word_id,
				-- 1.5 when one comma-separated part of a gloss is the term itself ("dog, hound").
				case when exists (
					select from unnest(s.glosses) g,
						regexp_split_to_table(lower(g), ${GLOSS_SEPARATOR}) part
					where regexp_replace(part, ${TRAILING_NOTE}, '') in (${lower}, ${'to ' + lower})
				) then 1.5 else 2.5 end
			from dict_sense s where s.gloss_search ~ ${englishWord}
		)
		select c.id, min(c.rank)::float as rank,
		       similarity(de_fold(w.headword), (select f from q))::float as sim
		from candidates c join dict_word w on w.id = c.id
		group by c.id, w.headword, w.frequency_rank
		order by rank, w.frequency_rank nulls last, sim desc, c.id
		limit ${DICTIONARY_LIMIT}`)
	);
	const dictionary = await dictionaryHits(
		db,
		userId,
		rows.map((r) => r.id),
		new Map(rows.map((r) => [r.id, matchKind(r.rank)]))
	);

	// Exact German matches (or an English gloss that is exactly the term) need no fetch.
	const exact = rows.some((r) => r.rank <= 1.5);
	return { collection, dictionary, tryRemote: !exact && singleWord(term) };
}

const matchKind = (rank: number): DictionaryHit['match'] =>
	rank === 0 || rank === 0.5 || rank === 2
		? 'headword'
		: rank === 1
			? 'form'
			: rank === 3
				? 'similar'
				: 'english';

async function searchCollection(
	db: Db,
	userId: string,
	term: string,
	like: string,
	englishWord: string
): Promise<CollectionHit[]> {
	const words = rowsOf<{ id: number }>(
		await db.execute(sql`
		select w.id,
		       min(case when de_fold(w.headword) = de_fold(${term}) then 0
		                when de_fold(w.headword) like ${like} then 1
		                when de_fold(w.headword) % de_fold(${term}) then 2
		                else 3 end) as rank
		from word w left join meaning m on m.word_id = w.id
		where w.user_id = ${userId}
		  and (de_fold(w.headword) like ${like}
		       or de_fold(w.headword) % de_fold(${term})
		       or lower(array_to_string(m.glosses, ' ')) ~ ${englishWord}
		       or w.dict_word_id in (select dict_word_id from dict_form
		                             where de_fold(form) = de_fold(${term})))
		group by w.id, w.headword
		order by rank, w.headword
		limit ${COLLECTION_LIMIT}`)
	);
	const ids = words.map((w) => w.id);
	if (!ids.length) return [];
	const [wordRows, meaningRows] = await Promise.all([
		db
			.select({
				id: table.word.id,
				headword: table.word.headword,
				pos: table.word.pos,
				grammar: table.word.grammar
			})
			.from(table.word)
			.where(inArray(table.word.id, ids)),
		db
			.select({
				wordId: table.meaning.wordId,
				glosses: table.meaning.glosses,
				deckStatus: table.meaning.deckStatus
			})
			.from(table.meaning)
			.where(inArray(table.meaning.wordId, ids))
			.orderBy(asc(table.meaning.id))
	]);
	const byId = new Map(wordRows.map((w) => [w.id, w]));
	return ids.map((id) => {
		const w = byId.get(id)!;
		return {
			...w,
			grammar: w.grammar as Grammar,
			meanings: meaningRows.filter((m) => m.wordId === id)
		};
	});
}

/** Loads dictionary entries for display, in the given order, with their senses. */
export async function dictionaryHits(
	db: Db,
	userId: string,
	ids: number[],
	match: Map<number, DictionaryHit['match']> = new Map()
): Promise<DictionaryHit[]> {
	if (!ids.length) return [];
	const [words, senses, examples, owned, ownedSenses] = await Promise.all([
		db.select().from(table.dictWord).where(inArray(table.dictWord.id, ids)),
		db
			.select()
			.from(table.dictSense)
			.where(inArray(table.dictSense.dictWordId, ids))
			.orderBy(asc(table.dictSense.position)),
		db
			.selectDistinctOn([table.dictExample.dictSenseId], {
				senseId: table.dictExample.dictSenseId,
				german: table.dictExample.german,
				english: table.dictExample.english
			})
			.from(table.dictExample)
			.where(
				and(inArray(table.dictExample.dictWordId, ids), isNotNull(table.dictExample.dictSenseId))
			)
			.orderBy(table.dictExample.dictSenseId, asc(table.dictExample.id)),
		db
			.select({ id: table.word.id, dictWordId: table.word.dictWordId })
			.from(table.word)
			.where(and(eq(table.word.userId, userId), inArray(table.word.dictWordId, ids))),
		db
			.select({ senseId: table.meaning.dictSenseId })
			.from(table.meaning)
			.innerJoin(table.dictSense, eq(table.dictSense.id, table.meaning.dictSenseId))
			// A starter-set meaning not yet in the deck can still be added from here.
			.where(
				and(
					eq(table.meaning.userId, userId),
					inArray(table.dictSense.dictWordId, ids),
					ne(table.meaning.deckStatus, 'not_in_deck')
				)
			)
	]);
	const byId = new Map(words.map((w) => [w.id, w]));
	const exampleBySense = new Map(examples.map((e) => [e.senseId, e]));
	const wordIdByDict = new Map(owned.map((o) => [o.dictWordId, o.id]));
	const ownedSenseIds = new Set(ownedSenses.map((s) => s.senseId));
	return ids
		.filter((id) => byId.has(id))
		.map((id) => {
			const w = byId.get(id)!;
			return {
				id,
				headword: w.headword,
				pos: w.pos,
				grammar: w.grammar as Grammar,
				wordId: wordIdByDict.get(id) ?? null,
				match: match.get(id) ?? 'headword',
				senses: senses
					.filter((s) => s.dictWordId === id)
					.map((s) => {
						const ex = exampleBySense.get(s.id);
						return {
							id: s.id,
							glosses: s.glosses,
							details: s.details as Record<string, unknown>,
							example: ex ? { german: ex.german, english: ex.english } : null,
							inCollection: ownedSenseIds.has(s.id)
						};
					})
			};
		});
}

/**
 * Asks the source (kaikki.org) for a word that isn't in the word bank. Found entries are
 * saved, so the next search finds them locally.
 */
export async function searchRemote(
	db: Db,
	userId: string,
	query: string,
	fetchImpl: typeof fetch = fetch
): Promise<{ hits: DictionaryHit[]; unavailable: boolean }> {
	try {
		const words = await lookupGerman(db, query, fetchImpl);
		return {
			hits: await dictionaryHits(
				db,
				userId,
				words.map((w) => w.id)
			),
			unavailable: false
		};
	} catch (e) {
		if (e instanceof SourceUnavailableError) return { hits: [], unavailable: true };
		throw e;
	}
}
