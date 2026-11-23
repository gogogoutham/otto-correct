/**
 * The user's collection: words, meanings, examples, tags and cards.
 *
 * Every function takes the database and the user id, so they can run in tests against
 * any database and can never touch another user's rows.
 */
import { and, asc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import * as table from './db/schema.js';
import type { Db } from './dictionary/store.js';
import { fetchEntries } from './dictionary/lookup.js';
import { storeEntries } from './dictionary/store.js';

export type DeckStatus = (typeof table.deckStatus.enumValues)[number];
export type PartOfSpeech = (typeof table.partOfSpeech.enumValues)[number];
export type Grammar = Record<string, unknown>;

const MAX_COPIED_EXAMPLES = 3;
/** Sense tags worth keeping as a meaning's register / usage label. */
const REGISTER_TAGS = new Set([
	'informal',
	'colloquial',
	'formal',
	'slang',
	'vulgar',
	'derogatory',
	'humorous',
	'archaic',
	'dated',
	'rare',
	'regional',
	'Austria',
	'Switzerland',
	'Southern-Germany',
	'Northern-Germany',
	'figuratively',
	'literary',
	'poetic',
	'technical'
]);

export class NotFoundError extends Error {}

const CASES = ['accusative', 'dative', 'genitive'];

/**
 * Meaning-level grammar from a dictionary sense's details. For prepositions the gloss
 * often names the case ("[with dative] in, inside"), which says how this meaning is used.
 */
export function meaningGrammarFromSense(
	details: Record<string, unknown>,
	glosses: string[] = [],
	pos?: PartOfSpeech
): Grammar {
	const tags = (details.tags as string[] | undefined) ?? [];
	const g: Grammar = {};
	if (details.objectCases) g.objectCases = details.objectCases;
	if (details.prepositionalObjects) g.prepositionalObjects = details.prepositionalObjects;
	if (details.governs) g.governs = details.governs;
	const note = /^\[with ([a-z]+)(?: or ([a-z]+))?\]/.exec(glosses[0] ?? '');
	if (pos === 'preposition' && !g.governs && note) {
		const cases = [note[1], note[2]].filter((c) => c && CASES.includes(c));
		if (cases.length) g.governs = cases;
	}
	if (tags.includes('reflexive')) g.reflexive = true;
	const register = tags.filter((t) => REGISTER_TAGS.has(t));
	if (register.length) g.register = register;
	return g;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export function parseTagList(input: string): string[] {
	return [
		...new Set(
			input
				.split(',')
				.map((t) => t.trim().toLowerCase())
				.filter(Boolean)
		)
	];
}

async function tagIds(db: Db, userId: string, names: string[]): Promise<number[]> {
	if (!names.length) return [];
	await db
		.insert(table.tag)
		.values(names.map((name) => ({ userId, name })))
		.onConflictDoNothing();
	const rows = await db
		.select({ id: table.tag.id })
		.from(table.tag)
		.where(and(eq(table.tag.userId, userId), inArray(table.tag.name, names)));
	return rows.map((r) => r.id);
}

/** Replaces a meaning's tags. */
export async function setMeaningTags(db: Db, userId: string, meaningId: number, names: string[]) {
	await ownMeaning(db, userId, meaningId);
	const ids = await tagIds(db, userId, names);
	await db.delete(table.meaningTag).where(eq(table.meaningTag.meaningId, meaningId));
	if (ids.length)
		await db.insert(table.meaningTag).values(ids.map((tagId) => ({ meaningId, tagId })));
}

export async function listTags(db: Db, userId: string): Promise<string[]> {
	const rows = await db
		.select({ name: table.tag.name })
		.from(table.tag)
		.where(eq(table.tag.userId, userId))
		.orderBy(asc(table.tag.name));
	return rows.map((r) => r.name);
}

// ---------------------------------------------------------------------------
// Adding words
// ---------------------------------------------------------------------------

export interface SenseSelection {
	dictSenseId: number;
	status: Exclude<DeckStatus, 'not_in_deck'>;
}

/**
 * Adds meanings of a dictionary word to the collection: creates the Word if new, one
 * Meaning per selected sense (with its examples and tags), and one Card per Meaning.
 * Senses already in the collection are left as they are. Returns the word id.
 */
export async function addFromDictionary(
	db: Db,
	userId: string,
	dictWordId: number,
	selections: SenseSelection[],
	tagNames: string[] = []
): Promise<number> {
	const [dw] = await db.select().from(table.dictWord).where(eq(table.dictWord.id, dictWordId));
	if (!dw) throw new NotFoundError('Dictionary word not found');

	return db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: table.word.id })
			.from(table.word)
			.where(and(eq(table.word.userId, userId), eq(table.word.dictWordId, dictWordId)));
		const wordId =
			existing?.id ??
			(
				await tx
					.insert(table.word)
					.values({
						userId,
						headword: dw.headword,
						pos: dw.pos,
						dictWordId,
						grammar: dw.grammar,
						sourceSyncedAt: new Date()
					})
					.returning({ id: table.word.id })
			)[0].id;

		const senseIds = selections.map((s) => s.dictSenseId);
		if (!senseIds.length) return wordId;
		const senses = await tx
			.select()
			.from(table.dictSense)
			.where(and(eq(table.dictSense.dictWordId, dictWordId), inArray(table.dictSense.id, senseIds)))
			.orderBy(asc(table.dictSense.position));
		const already = new Set(
			(
				await tx
					.select({ id: table.meaning.dictSenseId })
					.from(table.meaning)
					.where(and(eq(table.meaning.wordId, wordId), isNotNull(table.meaning.dictSenseId)))
			).map((r) => r.id)
		);
		const statusFor = new Map(selections.map((s) => [s.dictSenseId, s.status]));
		const examples = await tx
			.select()
			.from(table.dictExample)
			.where(eq(table.dictExample.dictWordId, dictWordId))
			.orderBy(asc(table.dictExample.id));
		// Tatoeba sentences aren't tied to a sense; share them out to meanings that lack examples.
		const looseExamples = examples.filter((e) => e.dictSenseId === null);
		const ids = await tagIds(tx, userId, tagNames);

		for (const sense of senses) {
			if (already.has(sense.id)) continue;
			const status = statusFor.get(sense.id)!;
			const [m] = await tx
				.insert(table.meaning)
				.values({
					userId,
					wordId,
					dictSenseId: sense.id,
					glosses: sense.glosses,
					grammar: meaningGrammarFromSense(
						sense.details as Record<string, unknown>,
						sense.glosses,
						dw.pos
					),
					deckStatus: status
				})
				.returning({ id: table.meaning.id });

			let own = examples.filter((e) => e.dictSenseId === sense.id).slice(0, MAX_COPIED_EXAMPLES);
			if (!own.length) own = looseExamples.splice(0, 2);
			if (own.length)
				await tx.insert(table.example).values(
					own.map((e, position) => ({
						userId,
						meaningId: m.id,
						german: e.german,
						english: e.english,
						source: e.source,
						position
					}))
				);
			if (ids.length)
				await tx.insert(table.meaningTag).values(ids.map((tagId) => ({ meaningId: m.id, tagId })));
			await tx.insert(table.card).values({
				userId,
				meaningId: m.id,
				queuedAt: status === 'studying' ? new Date() : null
			});
		}
		await tx.update(table.word).set({ updatedAt: new Date() }).where(eq(table.word.id, wordId));
		return wordId;
	});
}

export interface ManualWordInput {
	headword: string;
	pos: PartOfSpeech;
	grammar: Grammar;
	gloss: string;
	contextLabel?: string;
	exampleGerman?: string;
	exampleEnglish?: string;
	status: Exclude<DeckStatus, 'not_in_deck'>;
	tags: string[];
}

/** Creates a word that isn't in the dictionary, with its first meaning. All fields count as manual. */
export async function createManualWord(
	db: Db,
	userId: string,
	input: ManualWordInput
): Promise<number> {
	return db.transaction(async (tx) => {
		const [w] = await tx
			.insert(table.word)
			.values({
				userId,
				headword: input.headword,
				pos: input.pos,
				grammar: input.grammar,
				manualFields: Object.keys(input.grammar)
			})
			.returning({ id: table.word.id });
		await insertMeaning(tx, userId, w.id, {
			gloss: input.gloss,
			contextLabel: input.contextLabel,
			exampleGerman: input.exampleGerman,
			exampleEnglish: input.exampleEnglish,
			status: input.status,
			tags: input.tags
		});
		return w.id;
	});
}

export interface ManualMeaningInput {
	gloss: string;
	contextLabel?: string;
	exampleGerman?: string;
	exampleEnglish?: string;
	status: Exclude<DeckStatus, 'not_in_deck'>;
	tags: string[];
}

/** Adds a hand-written meaning to an existing word. */
export async function addManualMeaning(
	db: Db,
	userId: string,
	wordId: number,
	input: ManualMeaningInput
): Promise<number> {
	await ownWord(db, userId, wordId);
	return db.transaction((tx) => insertMeaning(tx, userId, wordId, input));
}

async function insertMeaning(
	db: Db,
	userId: string,
	wordId: number,
	input: ManualMeaningInput
): Promise<number> {
	const [m] = await db
		.insert(table.meaning)
		.values({
			userId,
			wordId,
			glosses: splitGlosses(input.gloss),
			contextLabel: input.contextLabel || null,
			deckStatus: input.status,
			manualFields: ['glosses']
		})
		.returning({ id: table.meaning.id });
	if (input.exampleGerman)
		await db.insert(table.example).values({
			userId,
			meaningId: m.id,
			german: input.exampleGerman,
			english: input.exampleEnglish || null,
			source: 'manual'
		});
	const ids = await tagIds(db, userId, input.tags);
	if (ids.length)
		await db.insert(table.meaningTag).values(ids.map((tagId) => ({ meaningId: m.id, tagId })));
	await db.insert(table.card).values({
		userId,
		meaningId: m.id,
		queuedAt: input.status === 'studying' ? new Date() : null
	});
	return m.id;
}

const splitGlosses = (gloss: string) =>
	gloss
		.split(';')
		.map((g) => g.trim())
		.filter(Boolean);

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

async function ownWord(db: Db, userId: string, wordId: number) {
	const [w] = await db
		.select()
		.from(table.word)
		.where(and(eq(table.word.id, wordId), eq(table.word.userId, userId)));
	if (!w) throw new NotFoundError('Word not found');
	return w;
}

async function ownMeaning(db: Db, userId: string, meaningId: number) {
	const [m] = await db
		.select()
		.from(table.meaning)
		.where(and(eq(table.meaning.id, meaningId), eq(table.meaning.userId, userId)));
	if (!m) throw new NotFoundError('Meaning not found');
	return m;
}

const sameValue = (a: unknown, b: unknown) =>
	JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Applies edits to a word's grammar. Fields whose value changes are marked manual, so a
 * later re-sync from the source leaves them alone. `undefined` removes a field.
 */
export async function updateWordGrammar(
	db: Db,
	userId: string,
	wordId: number,
	changes: Grammar,
	headword?: string
): Promise<void> {
	const w = await ownWord(db, userId, wordId);
	const grammar = { ...(w.grammar as Grammar) };
	const manual = new Set(w.manualFields);
	for (const [key, value] of Object.entries(changes)) {
		if (sameValue(grammar[key], value)) continue;
		if (value === undefined) delete grammar[key];
		else grammar[key] = value;
		manual.add(key);
	}
	const set: Partial<typeof table.word.$inferInsert> = { grammar, manualFields: [...manual] };
	if (headword && headword !== w.headword) {
		set.headword = headword;
		manual.add('headword');
		set.manualFields = [...manual];
	}
	await db.update(table.word).set(set).where(eq(table.word.id, wordId));
}

export interface MeaningEdit {
	glosses?: string[];
	contextLabel?: string | null;
	grammar?: Grammar;
}

/** Edits a meaning; changed fields are marked manual. */
export async function updateMeaning(
	db: Db,
	userId: string,
	meaningId: number,
	edit: MeaningEdit
): Promise<void> {
	const m = await ownMeaning(db, userId, meaningId);
	const manual = new Set(m.manualFields);
	const set: Partial<typeof table.meaning.$inferInsert> = {};
	if (edit.glosses && !sameValue(edit.glosses, m.glosses)) {
		set.glosses = edit.glosses;
		manual.add('glosses');
	}
	if (edit.contextLabel !== undefined && (edit.contextLabel || null) !== m.contextLabel) {
		set.contextLabel = edit.contextLabel || null;
	}
	if (edit.grammar) {
		const grammar = { ...(m.grammar as Grammar) };
		for (const [key, value] of Object.entries(edit.grammar)) {
			if (sameValue(grammar[key], value)) continue;
			if (value === undefined) delete grammar[key];
			else grammar[key] = value;
			manual.add(key);
		}
		set.grammar = grammar;
	}
	set.manualFields = [...manual];
	await db.update(table.meaning).set(set).where(eq(table.meaning.id, meaningId));
}

export async function addExample(
	db: Db,
	userId: string,
	meaningId: number,
	german: string,
	english: string | null
): Promise<void> {
	await ownMeaning(db, userId, meaningId);
	const [{ n }] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(table.example)
		.where(eq(table.example.meaningId, meaningId));
	await db
		.insert(table.example)
		.values({ userId, meaningId, german, english, source: 'manual', position: n });
}

export async function deleteExample(db: Db, userId: string, exampleId: number): Promise<void> {
	await db
		.delete(table.example)
		.where(and(eq(table.example.id, exampleId), eq(table.example.userId, userId)));
}

/**
 * Changes a meaning's deck status. Known → studying puts the card at the end of the
 * new-card queue; not in deck keeps history, tags and group memberships.
 */
export async function setDeckStatus(
	db: Db,
	userId: string,
	meaningId: number,
	status: DeckStatus
): Promise<void> {
	const m = await ownMeaning(db, userId, meaningId);
	if (m.deckStatus === status) return;
	await db.transaction(async (tx) => {
		await tx
			.update(table.meaning)
			.set({ deckStatus: status })
			.where(eq(table.meaning.id, meaningId));
		const [c] = await tx.select().from(table.card).where(eq(table.card.meaningId, meaningId));
		if (!c) {
			await tx.insert(table.card).values({
				userId,
				meaningId,
				queuedAt: status === 'studying' ? new Date() : null
			});
		} else if (status === 'studying' && (m.deckStatus === 'known' || !c.queuedAt)) {
			await tx.update(table.card).set({ queuedAt: new Date() }).where(eq(table.card.id, c.id));
		}
	});
}

// ---------------------------------------------------------------------------
// Re-sync from the source
// ---------------------------------------------------------------------------

/**
 * Refreshes a word from the source: re-fetches its dictionary entry (falling back to the
 * stored copy if the source is down), then copies every grammar field not marked manual.
 * Returns whether the source was reached.
 */
export async function resyncWord(
	db: Db,
	userId: string,
	wordId: number,
	fetchImpl: typeof fetch = fetch
): Promise<{ refreshed: boolean }> {
	const w = await ownWord(db, userId, wordId);
	if (!w.dictWordId) throw new NotFoundError('This word was created by hand and has no source');
	const [dw] = await db.select().from(table.dictWord).where(eq(table.dictWord.id, w.dictWordId));

	let refreshed = false;
	try {
		const fresh = (await fetchEntries(dw.headword, fetchImpl)).find(
			(e) => e.sourceRef === dw.sourceRef
		);
		if (fresh) {
			await storeEntries(db, [{ ...fresh, frequencyRank: dw.frequencyRank }], {
				fetchedOnDemand: dw.fetchedOnDemand
			});
			refreshed = true;
		}
	} catch {
		// Source unreachable: re-apply the stored copy.
	}
	const [current] = await db.select().from(table.dictWord).where(eq(table.dictWord.id, dw.id));
	const manual = new Set(w.manualFields);
	const kept = Object.fromEntries(
		Object.entries(w.grammar as Grammar).filter(([key]) => manual.has(key))
	);
	const fromSource = Object.fromEntries(
		Object.entries(current.grammar as Grammar).filter(([key]) => !manual.has(key))
	);
	await db
		.update(table.word)
		.set({
			grammar: { ...fromSource, ...kept },
			headword: manual.has('headword') ? w.headword : current.headword,
			sourceSyncedAt: new Date()
		})
		.where(eq(table.word.id, wordId));
	return { refreshed };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function getWordPage(db: Db, userId: string, wordId: number) {
	const w = await ownWord(db, userId, wordId);

	const meanings = await db
		.select({
			id: table.meaning.id,
			dictSenseId: table.meaning.dictSenseId,
			glosses: table.meaning.glosses,
			contextLabel: table.meaning.contextLabel,
			grammar: table.meaning.grammar,
			manualFields: table.meaning.manualFields,
			deckStatus: table.meaning.deckStatus,
			addedAt: table.meaning.addedAt,
			lastReviewedAt: table.card.lastReviewedAt,
			flagged: table.card.flagged
		})
		.from(table.meaning)
		.leftJoin(table.card, eq(table.card.meaningId, table.meaning.id))
		.where(eq(table.meaning.wordId, wordId))
		.orderBy(asc(table.meaning.id));
	const meaningIds = meanings.map((m) => m.id);

	const examples = meaningIds.length
		? await db
				.select()
				.from(table.example)
				.where(inArray(table.example.meaningId, meaningIds))
				.orderBy(asc(table.example.position), asc(table.example.id))
		: [];
	const tags = meaningIds.length
		? await db
				.select({ meaningId: table.meaningTag.meaningId, name: table.tag.name })
				.from(table.meaningTag)
				.innerJoin(table.tag, eq(table.tag.id, table.meaningTag.tagId))
				.where(inArray(table.meaningTag.meaningId, meaningIds))
				.orderBy(asc(table.tag.name))
		: [];

	// Source senses not yet in the collection, shown greyed out with "add to deck".
	const addedSenses = new Set(meanings.map((m) => m.dictSenseId).filter((id) => id !== null));
	const sourceSenses = w.dictWordId
		? (
				await db
					.select()
					.from(table.dictSense)
					.where(eq(table.dictSense.dictWordId, w.dictWordId))
					.orderBy(asc(table.dictSense.position))
			).filter((s) => !addedSenses.has(s.id))
		: [];

	// Homographs: same spelling, in the collection or the dictionary.
	const collectionHomographs = await db
		.select({
			id: table.word.id,
			headword: table.word.headword,
			pos: table.word.pos,
			grammar: table.word.grammar,
			// Column names are written out: drizzle leaves them unqualified inside a subquery.
			firstGloss: sql<
				string | null
			>`(select glosses[1] from meaning m where m.word_id = "word"."id" order by m.id limit 1)`
		})
		.from(table.word)
		.where(
			and(
				eq(table.word.userId, userId),
				ne(table.word.id, wordId),
				sql`de_fold(${table.word.headword}) = de_fold(${w.headword})`
			)
		);
	const dictionaryHomographs = await db
		.select({
			id: table.dictWord.id,
			headword: table.dictWord.headword,
			pos: table.dictWord.pos,
			grammar: table.dictWord.grammar,
			firstGloss: sql<
				string | null
			>`(select glosses[1] from dict_sense s where s.dict_word_id = "dict_word"."id" order by s.position limit 1)`
		})
		.from(table.dictWord)
		.where(
			and(
				sql`de_fold(${table.dictWord.headword}) = de_fold(${w.headword})`,
				w.dictWordId ? ne(table.dictWord.id, w.dictWordId) : sql`true`
			)
		);
	const inCollection = new Set(
		(
			await db
				.select({ dictWordId: table.word.dictWordId })
				.from(table.word)
				.where(and(eq(table.word.userId, userId), isNotNull(table.word.dictWordId)))
		).map((r) => r.dictWordId)
	);

	return {
		word: w,
		meanings: meanings.map((m) => ({
			...m,
			examples: examples.filter((e) => e.meaningId === m.id),
			tags: tags.filter((t) => t.meaningId === m.id).map((t) => t.name)
		})),
		sourceSenses,
		homographs: {
			collection: collectionHomographs,
			dictionary: dictionaryHomographs.filter((d) => !inCollection.has(d.id))
		}
	};
}

/** Flags or unflags a meaning's card. Flagged cards can be searched for; scheduling ignores it. */
export async function setFlag(
	db: Db,
	userId: string,
	meaningId: number,
	flagged: boolean
): Promise<void> {
	await db
		.update(table.card)
		.set({ flagged })
		.where(and(eq(table.card.meaningId, meaningId), eq(table.card.userId, userId)));
}

/** The word a meaning belongs to. */
export async function wordIdOfMeaning(db: Db, userId: string, meaningId: number): Promise<number> {
	return (await ownMeaning(db, userId, meaningId)).wordId;
}
