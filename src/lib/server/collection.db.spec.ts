/**
 * Collection and search against a real Postgres with migrations applied. Runs when
 * DATABASE_URL is set (as in CI); skipped otherwise. Uses its own throwaway user.
 */
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as table from './db/schema.js';
import {
	addFromDictionary,
	createManualWord,
	getWordPage,
	resyncWord,
	setDeckStatus,
	updateWordGrammar
} from './collection.js';
import { fakeKaikki } from './dictionary/fixtures/fake-kaikki.js';
import { lookupGerman } from './dictionary/lookup.js';
import type { Db } from './dictionary/store.js';
import { search } from './search.js';
import { getCard } from './cards.js';
import { homeCounts, loadStudyData, queueFor, recordReview } from './study.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('collection (database)', () => {
	const client = postgres(url ?? '', { prepare: false, max: 2, onnotice: () => {} });
	const db = drizzle(client, { schema: table }) as unknown as Db;
	let userId = '';
	let fahren = 0;
	let bankIds: number[] = [];

	beforeAll(async () => {
		const [u] = await db
			.insert(table.user)
			.values({ username: `test-${randomUUID()}`, passwordHash: 'x' })
			.returning({ id: table.user.id });
		userId = u.id;
		// Make sure the fixture words are in the dictionary tables, word bank or not.
		fahren = (await lookupGerman(db, 'fahren', fakeKaikki)).find((w) => w.pos === 'verb')!.id;
		bankIds = (await lookupGerman(db, 'Bank', fakeKaikki))
			.filter((w) => w.headword === 'Bank')
			.map((w) => w.id);
		await lookupGerman(db, 'übersetzen', fakeKaikki);
	});

	afterAll(async () => {
		await db.delete(table.user).where(eq(table.user.id, userId));
		await client.end();
	});

	const senseIds = async (dictWordId: number) =>
		(
			await db
				.select({ id: table.dictSense.id })
				.from(table.dictSense)
				.where(eq(table.dictSense.dictWordId, dictWordId))
				.orderBy(table.dictSense.position)
		).map((s) => s.id);

	describe('search', () => {
		it('finds a verb from an inflected form', async () => {
			const r = await search(db, userId, 'fuhr');
			const hit = r.dictionary.find((d) => d.id === fahren);
			expect(hit?.match).toBe('form');
			expect(r.tryRemote).toBe(false);
		});

		it('matches umlauts typed as ue or as a plain vowel', async () => {
			for (const q of ['uebersetzen', 'ubersetzen', 'ÜBERSETZEN']) {
				const r = await search(db, userId, q);
				expect(r.dictionary[0]?.headword, q).toBe('übersetzen');
			}
		});

		it('searches English glosses as whole words', async () => {
			const r = await search(db, userId, 'bench');
			expect(r.dictionary.map((d) => d.id)).toContain(bankIds[0]);
			expect(r.dictionary.find((d) => d.id === bankIds[0])?.match).toBe('english');
		});

		it('asks for the source only when nothing matches exactly', async () => {
			expect((await search(db, userId, 'Qwertzuiopwort')).tryRemote).toBe(true);
			expect((await search(db, userId, 'two words')).tryRemote).toBe(false);
		});
	});

	describe('adding', () => {
		it('adds two meanings with tags, one card each, queued when studying', async () => {
			const [s1, s2] = await senseIds(fahren);
			const wordId = await addFromDictionary(
				db,
				userId,
				fahren,
				[
					{ dictSenseId: s1, status: 'studying' },
					{ dictSenseId: s2, status: 'known' }
				],
				['travel', 'a1']
			);
			const page = await getWordPage(db, userId, wordId);
			expect(page.meanings.map((m) => m.deckStatus)).toEqual(['studying', 'known']);
			expect(page.meanings[0].tags).toEqual(['a1', 'travel']);
			expect(page.meanings[0].examples.length).toBeGreaterThan(0);
			expect(page.sourceSenses.map((s) => s.id)).not.toContain(s1);

			const cards = await db
				.select({ queuedAt: table.card.queuedAt })
				.from(table.card)
				.where(eq(table.card.userId, userId));
			expect(cards.map((c) => c.queuedAt !== null).sort()).toEqual([false, true]);

			// Adding the same sense again changes nothing.
			expect(
				await addFromDictionary(db, userId, fahren, [{ dictSenseId: s1, status: 'studying' }])
			).toBe(wordId);
			expect((await getWordPage(db, userId, wordId)).meanings).toHaveLength(2);

			// The search shows the word in the collection.
			const r = await search(db, userId, 'fuhr');
			expect(r.collection.map((c) => c.id)).toEqual([wordId]);
			expect(r.dictionary.find((d) => d.id === fahren)?.wordId).toBe(wordId);
		});

		it('re-queues a known meaning moved back to studying', async () => {
			const [m] = await db
				.select({ id: table.meaning.id })
				.from(table.meaning)
				.where(and(eq(table.meaning.userId, userId), eq(table.meaning.deckStatus, 'known')));
			await setDeckStatus(db, userId, m.id, 'studying');
			const [c] = await db.select().from(table.card).where(eq(table.card.meaningId, m.id));
			expect(c.queuedAt).not.toBeNull();
		});
	});

	describe('editing', () => {
		it('keeps hand-edited fields through a re-sync and restores the rest', async () => {
			const [{ id: wordId }] = await db
				.select({ id: table.word.id })
				.from(table.word)
				.where(and(eq(table.word.userId, userId), eq(table.word.dictWordId, fahren)));
			const before = (await getWordPage(db, userId, wordId)).word.grammar as Record<
				string,
				unknown
			>;

			await updateWordGrammar(db, userId, wordId, { preterite: 'fuhr (edited)' });
			await db
				.update(table.word)
				.set({ grammar: { ...before, preterite: 'fuhr (edited)', pastParticiple: 'broken' } })
				.where(eq(table.word.id, wordId));

			expect(await resyncWord(db, userId, wordId, fakeKaikki)).toEqual({ refreshed: true });
			const after = await getWordPage(db, userId, wordId);
			const g = after.word.grammar as Record<string, unknown>;
			expect(g.preterite).toBe('fuhr (edited)');
			expect(g.pastParticiple).toBe(before.pastParticiple);
			expect(after.word.manualFields).toEqual(['preterite']);
		});

		it('links homographs in the collection and the dictionary', async () => {
			const [bench] = await senseIds(bankIds[0]);
			const bankWord = await addFromDictionary(db, userId, bankIds[0], [
				{ dictSenseId: bench, status: 'studying' }
			]);
			const manual = await createManualWord(db, userId, {
				headword: 'bank',
				pos: 'expression',
				grammar: {},
				gloss: 'made-up homograph',
				status: 'studying',
				tags: []
			});
			const page = await getWordPage(db, userId, bankWord);
			expect(page.homographs.collection.map((h) => h.id)).toEqual([manual]);
			expect(page.homographs.dictionary.map((h) => h.id)).toContain(bankIds[1]);
			expect(page.homographs.dictionary.map((h) => h.id)).not.toContain(bankIds[0]);
			// Each homograph carries its own first gloss.
			const other = page.homographs.dictionary.find((h) => h.id === bankIds[1]);
			expect(other?.firstGloss).toMatch(/bank/);
			expect(page.homographs.collection[0].firstGloss).toBe('made-up homograph');
		});

		it("never shows another user's words", async () => {
			const [other] = await db
				.insert(table.user)
				.values({ username: `test-${randomUUID()}`, passwordHash: 'x' })
				.returning({ id: table.user.id });
			try {
				expect((await search(db, other.id, 'fuhr')).collection).toEqual([]);
			} finally {
				await db.delete(table.user).where(eq(table.user.id, other.id));
			}
		});
	});

	describe('cards', () => {
		it('builds a card with other meanings, unseen senses and homographs', async () => {
			const [{ id: meaningId }] = await db
				.select({ id: table.meaning.id })
				.from(table.meaning)
				.innerJoin(table.word, eq(table.word.id, table.meaning.wordId))
				.where(and(eq(table.meaning.userId, userId), eq(table.word.dictWordId, bankIds[0])));
			const card = await getCard(db, userId, meaningId);
			expect(card.back.title).toBe('die Bank');
			expect(card.back.lines).toContainEqual({ label: 'Plural', value: 'die Bänke' });
			expect(card.homographs.map((h) => h.title)).toEqual(['bank', 'die Bank']);
			expect(card.others.every((o) => o.status === 'not_in_deck')).toBe(true);
		});

		it('loads studying cards with tags and filters them by tag and part of speech', async () => {
			const data = await loadStudyData(db, userId);
			const cram = { type: 'cram', includeKnown: false, order: 'oldest_first' } as const;
			const all = queueFor(data, cram, { tags: [], pos: null }, 'en_de');
			const travel = queueFor(data, cram, { tags: ['travel'], pos: null }, 'en_de');
			const nouns = queueFor(data, cram, { tags: [], pos: 'noun' }, 'en_de');
			expect(travel.length).toBe(2);
			expect(all.length).toBeGreaterThan(travel.length);
			expect(nouns).toHaveLength(1);
		});
	});

	describe('study sessions', () => {
		it('logs reviews, which move a card from new to review and out of today', async () => {
			const before = await loadStudyData(db, userId);
			const fresh = queueFor(before, { type: 'new' }, { tags: [], pos: null }, 'en_de');
			expect(fresh.length).toBeGreaterThan(0);
			const cardId = fresh[0];
			expect(homeCounts(before).newToday).toBe(fresh.length);

			await recordReview(db, userId, cardId, 'en_de', 'new');
			const after = await loadStudyData(db, userId);
			expect(after.events.filter((e) => e.cardId === cardId)).toHaveLength(1);
			expect(queueFor(after, { type: 'new' }, { tags: [], pos: null }, 'en_de')).not.toContain(
				cardId
			);
			const counts = homeCounts(after);
			expect(counts.reviewedToday).toBe(1);
			// Seen once in a new session: it counts as never revisited, but not before tomorrow.
			const tomorrow = new Date(Date.now() + 36 * 3600_000);
			const never = { kind: 'never_revisited' } as const;
			const review = { type: 'review', anchor: never, order: 'oldest_first' } as const;
			const filter = { tags: [], pos: null };
			expect(queueFor(after, review, filter, 'en_de')).not.toContain(cardId);
			expect(queueFor(after, review, filter, 'en_de', tomorrow)).toContain(cardId);

			const [card] = await db
				.select({ last: table.card.lastReviewedAt })
				.from(table.card)
				.where(eq(table.card.id, cardId));
			expect(card.last).not.toBeNull();
		});

		it("ignores reviews of another user's card", async () => {
			const [other] = await db
				.insert(table.user)
				.values({ username: `test-${randomUUID()}`, passwordHash: 'x' })
				.returning({ id: table.user.id });
			try {
				const [{ id: cardId }] = await db
					.select({ id: table.card.id })
					.from(table.card)
					.where(eq(table.card.userId, userId))
					.limit(1);
				await recordReview(db, other.id, cardId, 'en_de', 'cram');
				expect((await loadStudyData(db, other.id)).events).toEqual([]);
			} finally {
				await db.delete(table.user).where(eq(table.user.id, other.id));
			}
		});

		it('reads settings, starting from the defaults', async () => {
			const data = await loadStudyData(db, userId);
			expect(data.settings).toEqual({
				timeZone: 'UTC',
				dailyNewLimit: 6,
				reviewOrder: 'oldest_first'
			});
		});
	});
});
