/**
 * Groups against a real Postgres with migrations and the word bank loaded (as in CI).
 * Skipped without DATABASE_URL. Uses its own throwaway user.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as table from './db/schema.js';
import type { Db } from './dictionary/store.js';
import { addFromDictionary, setDeckStatus, setMeaningTags } from './collection.js';
import { getCard } from './cards.js';
import {
	addMember,
	getGroup,
	listGroups,
	loadStarterSet,
	prefixMeaningsForWord,
	searchGroups,
	setPrefixMeaning
} from './groups.js';
import { STARTER_GROUPS } from './groups/starter.js';
import { loadStudyData, queueFor } from './study.js';

const url = process.env.DATABASE_URL;

describe.skipIf(!url)('groups (database)', () => {
	const client = postgres(url ?? '', { prepare: false, max: 2, onnotice: () => {} });
	const db = drizzle(client, { schema: table }) as unknown as Db;
	let userId = '';
	let bankLoaded = false;

	beforeAll(async () => {
		const [u] = await db
			.insert(table.user)
			.values({ username: `test-${randomUUID()}`, passwordHash: 'x' })
			.returning({ id: table.user.id });
		userId = u.id;
		const [w] = await db
			.select({ id: table.dictWord.id })
			.from(table.dictWord)
			.where(eq(table.dictWord.headword, 'wohnen'))
			.limit(1);
		bankLoaded = !!w;
	});

	afterAll(async () => {
		await db.delete(table.user).where(eq(table.user.id, userId));
		await client.end();
	});

	const groupByLabel = async (label: string) =>
		(await listGroups(db, userId)).find((g) => g.label === label)!;

	/** Adds a word-bank verb's first sense to the collection with the given status. */
	const addVerb = async (headword: string, status: 'studying' | 'known' | 'not_in_deck') => {
		const [s] = await db
			.select({ wordId: table.dictWord.id, senseId: table.dictSense.id })
			.from(table.dictWord)
			.innerJoin(table.dictSense, eq(table.dictSense.dictWordId, table.dictWord.id))
			.where(and(eq(table.dictWord.headword, headword), eq(table.dictWord.pos, 'verb')))
			.orderBy(table.dictWord.id, table.dictSense.position)
			.limit(1);
		return addFromDictionary(db, userId, s.wordId, [{ dictSenseId: s.senseId, status }]);
	};

	it('loads the starter set greyed out, and only once', async (ctx) => {
		if (!bankLoaded) ctx.skip();
		const first = await loadStarterSet(db, userId);
		expect(first.groups).toBeGreaterThanOrEqual(STARTER_GROUPS.length);
		expect(first.members).toBeGreaterThan(80);

		const groups = await listGroups(db, userId);
		expect(groups.filter((g) => g.kind === 'contrast')).toHaveLength(STARTER_GROUPS.length);
		expect(groups.every((g) => g.inDeck === 0 && !g.qualified)).toBe(true);
		const studying = await db
			.select({ id: table.meaning.id })
			.from(table.meaning)
			.where(and(eq(table.meaning.userId, userId), eq(table.meaning.deckStatus, 'studying')));
		expect(studying).toEqual([]);

		const to = await getGroup(db, userId, (await groupByLabel('to (a place)')).id);
		expect(to.members.map((m) => m.display)).toEqual([
			'nach + Dat',
			'zu + Dat',
			'in + Akk',
			'an + Akk',
			'auf + Akk'
		]);
		expect(to.related.map((r) => r.title).sort()).toEqual(['at / in (a place)', 'from (a place)']);
		// "legen" borrows the source's "to lie down" sense, but not its reflexive marker.
		const put = await getGroup(db, userId, (await groupByLabel('to put')).id);
		expect(put.members[0]).toMatchObject({ display: 'legen', glosses: ['to lay, to put (flat)'] });

		const again = await loadStarterSet(db, userId);
		expect(again).toMatchObject({ groups: 0, members: 0 });
	});

	it('gives a group a card once two members are in the deck', async (ctx) => {
		if (!bankLoaded) ctx.skip();
		const g = await groupByLabel('to know');
		const view = await getGroup(db, userId, g.id);
		await setDeckStatus(db, userId, view.members[0].meaningId, 'studying');
		expect((await getGroup(db, userId, g.id)).qualifiedAt).toBeNull();

		// A known member counts too.
		await setDeckStatus(db, userId, view.members[1].meaningId, 'known');
		const qualified = await getGroup(db, userId, g.id);
		expect(qualified.qualifiedAt).not.toBeNull();
		expect(qualified.cardId).not.toBeNull();

		const data = await loadStudyData(db, userId);
		const none = { tags: [], pos: null };
		expect(queueFor(data, { type: 'new' }, none, 'en_de')).toContain(qualified.cardId);
		expect(queueFor(data, { type: 'new' }, none, 'de_en')).not.toContain(qualified.cardId);

		// Filters reach a group card through its in-deck members.
		await setMeaningTags(db, userId, view.members[0].meaningId, ['verbs-a1']);
		const tagged = await loadStudyData(db, userId);
		const cram = { type: 'cram', includeKnown: false, order: 'oldest_first' } as const;
		expect(queueFor(tagged, cram, { tags: ['verbs-a1'], pos: null }, 'en_de')).toContain(
			qualified.cardId
		);
		expect(queueFor(tagged, cram, { tags: [], pos: 'verb' }, 'en_de')).toContain(qualified.cardId);
		expect(queueFor(tagged, cram, { tags: [], pos: 'noun' }, 'en_de')).not.toContain(
			qualified.cardId
		);
	});

	it('builds verb families from base verbs, counting distinct verbs', async (ctx) => {
		if (!bankLoaded) ctx.skip();
		await addVerb('ankommen', 'studying');
		await addVerb('mitkommen', 'not_in_deck');
		const family = await groupByLabel('kommen');
		expect(family.kind).toBe('verb_family');
		expect(family.qualified).toBe(false);

		const view = await getGroup(db, userId, family.id);
		const mit = view.members.find((m) => m.headword === 'mitkommen')!;
		expect(mit.prefixType).toBe('separable');
		await setDeckStatus(db, userId, mit.meaningId, 'studying');
		expect((await groupByLabel('kommen')).qualified).toBe(true);
	});

	it('sets the prefix meaning a verb uses, one per prefix', async (ctx) => {
		if (!bankLoaded) ctx.skip();
		const [ankommen] = await db
			.select({ id: table.word.id })
			.from(table.word)
			.where(and(eq(table.word.userId, userId), eq(table.word.headword, 'ankommen')));
		const info = (await prefixMeaningsForWord(db, userId, ankommen.id))!;
		expect(info.prefix).toBe('an');
		const [begin, toward] = ['beginning', 'toward, at'].map(
			(l) => info.options.find((o) => o.label === l)!.id
		);
		const [m] = await db
			.select({ id: table.meaning.id })
			.from(table.meaning)
			.where(eq(table.meaning.wordId, ankommen.id));
		await setPrefixMeaning(db, userId, m.id, begin);
		await setPrefixMeaning(db, userId, m.id, toward);
		const memberships = await db
			.select({ groupId: table.groupMember.groupId })
			.from(table.groupMember)
			.where(
				and(
					eq(table.groupMember.meaningId, m.id),
					inArray(table.groupMember.groupId, [begin, toward])
				)
			);
		expect(memberships).toEqual([{ groupId: toward }]);
	});

	it('finds groups by English idea or base verb, and links them from card backs', async (ctx) => {
		if (!bankLoaded) ctx.skip();
		expect((await searchGroups(db, userId, 'know')).map((g) => g.title)).toEqual(['to know']);
		expect((await searchGroups(db, userId, 'to know')).map((g) => g.title)).toEqual(['to know']);
		expect((await searchGroups(db, userId, 'kommen')).map((g) => g.kind)).toEqual(['verb_family']);

		const g = await getGroup(db, userId, (await groupByLabel('to know')).id);
		const card = await getCard(db, userId, g.members[0].meaningId);
		expect(card.groups.map((x) => x.title)).toContain('to know');
	});

	it("refuses another user's meaning as a member", async (ctx) => {
		if (!bankLoaded) ctx.skip();
		const [other] = await db
			.insert(table.user)
			.values({ username: `test-${randomUUID()}`, passwordHash: 'x' })
			.returning({ id: table.user.id });
		try {
			const g = await groupByLabel('to know');
			const [mine] = await db
				.select({ id: table.meaning.id })
				.from(table.meaning)
				.where(eq(table.meaning.userId, userId))
				.limit(1);
			await expect(addMember(db, other.id, g.id, mine.id)).rejects.toThrow('not found');
		} finally {
			await db.delete(table.user).where(eq(table.user.id, other.id));
		}
	});
});
