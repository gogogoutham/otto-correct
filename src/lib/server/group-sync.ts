/**
 * Keeps derived group state current after the collection changes: verb families follow
 * each verb's base verb, and a group qualifies (and gets its card) once two members are
 * in the deck. Cheap enough to run after every change for one learner's collection.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import * as table from './db/schema.js';
import type { Db } from './dictionary/store.js';

/** A group card needs this many in-deck members (verb families: prefixed verbs). */
export const QUALIFYING_MEMBERS = 2;

export async function refreshGroups(db: Db, userId: string, now = new Date()): Promise<void> {
	await syncVerbFamilies(db, userId);
	await qualifyGroups(db, userId, now);
}

/**
 * One verb-family group per base verb that two or more collection verbs name. Every meaning of a
 * prefixed verb is a member; members are added, never removed, so edits by hand stick.
 */
export async function syncVerbFamilies(db: Db, userId: string): Promise<void> {
	const verbs = await db
		.select({
			meaningId: table.meaning.id,
			wordId: table.meaning.wordId,
			base: sql<string>`${table.word.grammar}->>'baseVerb'`
		})
		.from(table.meaning)
		.innerJoin(table.word, eq(table.word.id, table.meaning.wordId))
		.where(
			and(
				eq(table.meaning.userId, userId),
				eq(table.word.pos, 'verb'),
				sql`coalesce(${table.word.grammar}->>'baseVerb', '') <> ''`
			)
		);
	// A family needs at least two prefixed verbs to be worth a page and a card.
	const wordsByBase = new Map<string, Set<number>>();
	for (const v of verbs)
		wordsByBase.set(v.base, (wordsByBase.get(v.base) ?? new Set()).add(v.wordId));
	const bases = [...wordsByBase].filter(([, words]) => words.size >= 2).map(([base]) => base);
	if (!bases.length) return;
	await db
		.insert(table.group)
		.values(bases.map((label) => ({ userId, kind: 'verb_family' as const, label })))
		.onConflictDoNothing();
	const families = await db
		.select({ id: table.group.id, label: table.group.label })
		.from(table.group)
		.where(
			and(
				eq(table.group.userId, userId),
				eq(table.group.kind, 'verb_family'),
				inArray(table.group.label, bases)
			)
		);
	const idByBase = new Map(families.map((f) => [f.label, f.id]));
	await db
		.insert(table.groupMember)
		.values(
			verbs
				.filter((v) => idByBase.has(v.base))
				.map((v) => ({ groupId: idByBase.get(v.base)!, meaningId: v.meaningId }))
		)
		.onConflictDoNothing();
}

/**
 * Marks groups that now have enough in-deck members as qualified and gives each a card,
 * queued from that moment. A group that qualified stays qualified.
 */
export async function qualifyGroups(db: Db, userId: string, now = new Date()): Promise<number[]> {
	// Verb families count distinct prefixed verbs; other groups count member meanings.
	const ready = await db
		.select({ id: table.group.id })
		.from(table.group)
		.innerJoin(table.groupMember, eq(table.groupMember.groupId, table.group.id))
		.innerJoin(table.meaning, eq(table.meaning.id, table.groupMember.meaningId))
		.where(
			and(
				eq(table.group.userId, userId),
				isNull(table.group.qualifiedAt),
				inArray(table.meaning.deckStatus, ['studying', 'known'])
			)
		)
		.groupBy(table.group.id, table.group.kind)
		.having(
			sql`count(distinct case when ${table.group.kind} = 'verb_family' then ${table.meaning.wordId} else ${table.meaning.id} end) >= ${QUALIFYING_MEMBERS}`
		);
	const ids = ready.map((r) => r.id);
	if (!ids.length) return [];
	await db.transaction(async (tx) => {
		await tx.update(table.group).set({ qualifiedAt: now }).where(inArray(table.group.id, ids));
		await tx
			.insert(table.card)
			.values(ids.map((groupId) => ({ userId, groupId, queuedAt: now })))
			.onConflictDoNothing();
	});
	return ids;
}
