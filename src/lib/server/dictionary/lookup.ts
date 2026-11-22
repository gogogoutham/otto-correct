/**
 * Finds German words in the shared dictionary, fetching them from kaikki.org on demand
 * when they aren't in the word bank yet. Fetched words are saved, so each is fetched once.
 */
import { inArray, or, sql } from 'drizzle-orm';
import * as table from '../db/schema.js';
import {
	formOfTargets,
	isFormOfOnly,
	kaikkiWordPath,
	occurrenceCounter,
	parseEntry,
	type KaikkiEntry,
	type ParsedEntry,
	type VerbGrammar
} from './kaikki.js';
import { isKnownVerb, storeEntries, type Db } from './store.js';

const KAIKKI_BASE = 'https://kaikki.org/dictionary/German/meaning/';
const FETCH_TIMEOUT_MS = 6000;

export type DictWord = typeof table.dictWord.$inferSelect;

export class SourceUnavailableError extends Error {
	constructor(cause: unknown) {
		super('The dictionary source could not be reached', { cause });
	}
}

/** Words in the dictionary tables whose headword or an inflected form matches `term`. */
export async function findInDictionary(db: Db, term: string): Promise<DictWord[]> {
	const t = term.trim();
	if (!t) return [];
	const byForm = db
		.selectDistinct({ id: table.dictForm.dictWordId })
		.from(table.dictForm)
		.where(sql`lower(${table.dictForm.form}) = lower(${t})`);
	return db
		.select()
		.from(table.dictWord)
		.where(
			or(sql`lower(${table.dictWord.headword}) = lower(${t})`, inArray(table.dictWord.id, byForm))
		)
		.orderBy(sql`${table.dictWord.frequencyRank} nulls last`, table.dictWord.id);
}

/** Raw kaikki.org entries for one exact spelling; [] when the source has no such page. */
export async function fetchKaikki(
	word: string,
	fetchImpl: typeof fetch = fetch
): Promise<KaikkiEntry[]> {
	let res: Response;
	try {
		res = await fetchImpl(`${KAIKKI_BASE}${kaikkiWordPath(word)}.jsonl`, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
		});
	} catch (e) {
		throw new SourceUnavailableError(e);
	}
	if (res.status === 404) return [];
	if (!res.ok) throw new SourceUnavailableError(new Error(`HTTP ${res.status}`));
	return (await res.text())
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line) as KaikkiEntry)
		.filter((e) => e.lang_code === 'de');
}

/**
 * Parses a word's entries from the source. An inflected form ("fuhr") is followed to
 * its lemma ("fahren"), one hop only.
 */
export async function fetchEntries(
	word: string,
	fetchImpl: typeof fetch = fetch
): Promise<ParsedEntry[]> {
	const spellings = unique([word, capitalize(word), word.toLocaleLowerCase('de')]);
	const raw: KaikkiEntry[] = [];
	for (const spelling of spellings) raw.push(...(await fetchKaikki(spelling, fetchImpl)));

	const lemmas = unique(raw.filter(isFormOfOnly).flatMap(formOfTargets)).filter(
		(lemma) => !spellings.includes(lemma)
	);
	for (const lemma of lemmas.slice(0, 3)) raw.push(...(await fetchKaikki(lemma, fetchImpl)));

	const parsed: ParsedEntry[] = [];
	const seen = new Set<string>();
	const occurrenceBySpelling = new Map<string, ReturnType<typeof occurrenceCounter>>();
	for (const entry of raw) {
		let occurrence = occurrenceBySpelling.get(entry.word);
		if (!occurrence) occurrenceBySpelling.set(entry.word, (occurrence = occurrenceCounter()));
		const p = parseEntry(entry, occurrence(entry));
		if (p && !seen.has(p.sourceRef)) {
			seen.add(p.sourceRef);
			parsed.push(p);
		}
	}
	return parsed;
}

/**
 * Looks a German word up: the word bank first, then the source. Throws
 * SourceUnavailableError only when the word isn't stored and the source can't be reached.
 */
export async function lookupGerman(
	db: Db,
	term: string,
	fetchImpl: typeof fetch = fetch
): Promise<DictWord[]> {
	const stored = await findInDictionary(db, term);
	if (stored.length) return stored;

	const entries = await fetchEntries(term.trim(), fetchImpl);
	if (!entries.length) return [];

	// Never overwrite a word that's already stored (it may carry Tatoeba examples).
	const refs = entries.map((e) => e.sourceRef);
	const existing = await db
		.select({ id: table.dictWord.id, sourceRef: table.dictWord.sourceRef })
		.from(table.dictWord)
		.where(inArray(table.dictWord.sourceRef, refs));
	const existingRefs = new Set(existing.map((e) => e.sourceRef));
	const fresh = entries.filter((e) => !existingRefs.has(e.sourceRef));

	for (const e of fresh) {
		const g = e.grammar as VerbGrammar;
		if (e.pos === 'verb' && g.baseVerb && !(await isKnownVerb(db, g.baseVerb))) {
			delete g.prefix;
			delete g.prefixType;
			delete g.baseVerb;
		}
	}
	const ids = [
		...existing.map((e) => e.id),
		...(fresh.length ? await storeEntries(db, fresh, { fetchedOnDemand: true }) : [])
	];
	return db
		.select()
		.from(table.dictWord)
		.where(inArray(table.dictWord.id, ids))
		.orderBy(sql`${table.dictWord.frequencyRank} nulls last`, table.dictWord.id);
}

const unique = <T>(values: T[]) => [...new Set(values)];
const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase('de') + s.slice(1);
