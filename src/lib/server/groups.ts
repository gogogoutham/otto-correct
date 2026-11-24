/**
 * Groups: contrast groups, prefix meanings and verb families. A group is a list of member
 * meanings, each with a one-line rule and an example; it gets a card of its own once two
 * members are in the deck (see group-sync.ts).
 */
import { and, asc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import * as table from './db/schema.js';
import type { Db } from './dictionary/store.js';
import {
	addFromDictionary,
	createManualWord,
	NotFoundError,
	ownMeaning,
	type DeckStatus,
	type Grammar
} from './collection.js';
import { refreshGroups } from './group-sync.js';
import {
	PREFIX_NOTES,
	STARTER_GROUPS,
	STARTER_PREFIX_MEANINGS,
	type StarterMember
} from './groups/starter.js';
import { posLabel, type PartOfSpeech } from '#lib/grammar.js';

export type GroupKind = (typeof table.groupKind.enumValues)[number];
export type PrefixType = (typeof table.prefixType.enumValues)[number];

// ---------------------------------------------------------------------------
// The starter set
// ---------------------------------------------------------------------------

export interface StarterResult {
	groups: number;
	members: number;
	/** Members the word bank doesn't have, as "headword (pos)". */
	missing: string[];
}

/**
 * Loads the starter contrast groups and prefix meanings into the user's collection.
 * Members become meanings with status "not in deck" (or reuse the user's own meaning for
 * that sense). Groups already loaded are skipped, so running it twice adds nothing.
 */
export async function loadStarterSet(db: Db, userId: string): Promise<StarterResult> {
	const existing = new Map(
		(
			await db
				.select({ id: table.group.id, seedKey: table.group.seedKey })
				.from(table.group)
				.where(and(eq(table.group.userId, userId), isNotNull(table.group.seedKey)))
		).map((g) => [g.seedKey!, g.id])
	);
	const prefixes = new Map(
		(await db.select().from(table.prefix)).map((p) => [p.prefix, p.id] as const)
	);
	const result: StarterResult = { groups: 0, members: 0, missing: [] };

	const create = async (
		key: string,
		kind: GroupKind,
		label: string,
		members: StarterMember[],
		extra: { note?: string; prefixId?: number | null } = {}
	) => {
		if (existing.has(key)) return;
		const resolved: { meaningId: number; m: StarterMember }[] = [];
		for (const m of members) {
			const meaningId = await resolveMember(db, userId, m);
			if (meaningId) resolved.push({ meaningId, m });
			else result.missing.push(`${m.de} (${m.pos})`);
		}
		const [g] = await db
			.insert(table.group)
			.values({
				userId,
				kind,
				label,
				note: extra.note ?? null,
				prefixId: extra.prefixId ?? null,
				seedKey: key
			})
			.returning({ id: table.group.id });
		existing.set(key, g.id);
		if (resolved.length)
			await db
				.insert(table.groupMember)
				.values(
					resolved.map(({ meaningId, m }, position) => ({
						groupId: g.id,
						meaningId,
						rule: m.rule ?? null,
						example: m.example ?? null,
						position
					}))
				)
				.onConflictDoNothing();
		result.groups++;
		result.members += resolved.length;
	};

	for (const g of STARTER_GROUPS)
		await create(g.key, 'contrast', g.label, g.members, { note: g.note });
	for (const p of STARTER_PREFIX_MEANINGS)
		await create(p.key, 'prefix_meaning', p.label, p.verbs, {
			note: p.note,
			prefixId: prefixes.get(p.prefix)
		});

	// Related groups, both ways.
	const relations = STARTER_GROUPS.flatMap((g) =>
		(g.related ?? []).flatMap((r) => {
			const a = existing.get(g.key);
			const b = existing.get(r);
			return a && b ? [{ groupId: a, relatedGroupId: b }] : [];
		})
	);
	if (relations.length)
		await db.insert(table.groupRelation).values(relations).onConflictDoNothing();

	await refreshGroups(db, userId);
	return result;
}

/** Finds or creates the meaning a starter member stands for. Null if the word bank lacks it. */
async function resolveMember(db: Db, userId: string, m: StarterMember): Promise<number | null> {
	if (m.manual) {
		const [own] = await db
			.select({ id: table.meaning.id })
			.from(table.meaning)
			.innerJoin(table.word, eq(table.word.id, table.meaning.wordId))
			.where(
				and(eq(table.word.userId, userId), eq(table.word.headword, m.de), eq(table.word.pos, m.pos))
			)
			.limit(1);
		if (own) return own.id;
		const wordId = await createManualWord(db, userId, {
			headword: m.de,
			pos: m.pos,
			grammar: {},
			gloss: m.gloss ?? m.de,
			exampleGerman: m.example,
			status: 'not_in_deck',
			tags: []
		});
		const [created] = await db
			.select({ id: table.meaning.id })
			.from(table.meaning)
			.where(eq(table.meaning.wordId, wordId));
		return created.id;
	}

	const conditions = [eq(table.dictWord.headword, m.de), eq(table.dictWord.pos, m.pos)];
	if (m.prefixType)
		conditions.push(sql`${table.dictWord.grammar}->>'prefixType' = ${m.prefixType}`);
	const senses = await db
		.select({
			dictWordId: table.dictWord.id,
			senseId: table.dictSense.id,
			glosses: table.dictSense.glosses
		})
		.from(table.dictWord)
		.innerJoin(table.dictSense, eq(table.dictSense.dictWordId, table.dictWord.id))
		.where(and(...conditions))
		.orderBy(
			sql`${table.dictWord.frequencyRank} nulls last`,
			asc(table.dictWord.id),
			asc(table.dictSense.position)
		);
	if (!senses.length) return null;
	const pattern = m.sense ? new RegExp(m.sense, 'i') : null;
	const pick = (pattern && senses.find((s) => s.glosses.some((g) => pattern.test(g)))) ?? senses[0];

	const [own] = await db
		.select({ id: table.meaning.id })
		.from(table.meaning)
		.where(and(eq(table.meaning.userId, userId), eq(table.meaning.dictSenseId, pick.senseId)));
	if (own) return own.id;

	const wordId = await addFromDictionary(db, userId, pick.dictWordId, [
		{ dictSenseId: pick.senseId, status: 'not_in_deck' }
	]);
	const [created] = await db
		.select({ id: table.meaning.id, grammar: table.meaning.grammar })
		.from(table.meaning)
		.where(and(eq(table.meaning.wordId, wordId), eq(table.meaning.dictSenseId, pick.senseId)));
	const manual: string[] = [];
	const set: Partial<typeof table.meaning.$inferInsert> = {};
	if (m.gloss) {
		set.glosses = [m.gloss];
		manual.push('glosses');
	}
	const grammar = { ...(created.grammar as Grammar) };
	if (m.governs) {
		grammar.governs = m.governs;
		manual.push('governs');
	}
	// A gloss written for a sense the source lacks (legen = "to lay"): the borrowed
	// sense's reflexive marker ("sich legen" = to lie down) doesn't apply.
	if (m.gloss && !m.sense && grammar.reflexive) {
		delete grammar.reflexive;
		manual.push('reflexive');
	}
	if (manual.some((f) => f !== 'glosses')) set.grammar = grammar;
	if (manual.length)
		await db
			.update(table.meaning)
			.set({ ...set, manualFields: manual })
			.where(eq(table.meaning.id, created.id));
	return created.id;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface GroupSummary {
	id: number;
	kind: GroupKind;
	label: string;
	/** "ver-" for prefix-meaning groups. */
	prefix: string | null;
	members: number;
	inDeck: number;
	qualified: boolean;
}

/** The group's name as shown: "ver-: doing something wrong", "kommen family". */
export const groupTitle = (g: { kind: GroupKind; label: string; prefix?: string | null }) =>
	g.kind === 'prefix_meaning' && g.prefix
		? `${g.prefix}-: ${g.label}`
		: g.kind === 'verb_family'
			? `${g.label} family`
			: g.label;

export async function listGroups(db: Db, userId: string): Promise<GroupSummary[]> {
	const rows = await db
		.select({
			id: table.group.id,
			kind: table.group.kind,
			label: table.group.label,
			prefix: table.prefix.prefix,
			qualifiedAt: table.group.qualifiedAt,
			members: sql<number>`count(${table.groupMember.id})::int`,
			inDeck: sql<number>`count(*) filter (where ${table.meaning.deckStatus} in ('studying', 'known'))::int`
		})
		.from(table.group)
		.leftJoin(table.prefix, eq(table.prefix.id, table.group.prefixId))
		.leftJoin(table.groupMember, eq(table.groupMember.groupId, table.group.id))
		.leftJoin(table.meaning, eq(table.meaning.id, table.groupMember.meaningId))
		.where(eq(table.group.userId, userId))
		.groupBy(table.group.id, table.prefix.prefix)
		.orderBy(asc(table.group.kind), asc(table.prefix.prefix), asc(table.group.label));
	return rows.map((r) => ({
		id: r.id,
		kind: r.kind,
		label: r.label,
		prefix: r.prefix,
		members: r.members,
		inDeck: r.inDeck,
		qualified: !!r.qualifiedAt
	}));
}

export interface GroupMemberView {
	id: number;
	meaningId: number;
	wordId: number;
	headword: string;
	/** Headword with article, or with its case: "in + Akk". */
	display: string;
	pos: PartOfSpeech;
	posLabel: string;
	glosses: string[];
	deckStatus: DeckStatus;
	rule: string | null;
	example: string | null;
	/** Verbs: separable or inseparable. */
	prefixType: string | null;
}

export interface GroupView {
	id: number;
	kind: GroupKind;
	label: string;
	title: string;
	note: string | null;
	prefix: { id: number; prefix: string; type: PrefixType } | null;
	qualifiedAt: Date | null;
	cardId: number | null;
	members: GroupMemberView[];
	related: { id: number; title: string }[];
}

const ARTICLE: Record<string, string> = { m: 'der', f: 'die', n: 'das' };
const CASE_ABBR: Record<string, string> = {
	accusative: 'Akk',
	dative: 'Dat',
	genitive: 'Gen'
};

/** How a member is named in a group table: "die Bank", "in + Akk", "sich verlaufen". */
export function memberDisplay(
	headword: string,
	pos: PartOfSpeech,
	wordGrammar: Grammar,
	meaningGrammar: Grammar
): string {
	if (pos === 'noun') {
		const genders = (wordGrammar.genders as string[] | undefined) ?? [];
		const article = genders.map((g) => ARTICLE[g] ?? g).join('/');
		return article ? `${article} ${headword}` : headword;
	}
	if (pos === 'preposition') {
		const cases = (meaningGrammar.governs as string[] | undefined) ?? [];
		return cases.length === 1 ? `${headword} + ${CASE_ABBR[cases[0]] ?? cases[0]}` : headword;
	}
	if (pos === 'verb' && meaningGrammar.reflexive === true) return `sich ${headword}`;
	return headword;
}

export async function getGroup(db: Db, userId: string, groupId: number): Promise<GroupView> {
	const [g] = await db
		.select({
			group: table.group,
			prefix: table.prefix,
			cardId: table.card.id
		})
		.from(table.group)
		.leftJoin(table.prefix, eq(table.prefix.id, table.group.prefixId))
		.leftJoin(table.card, eq(table.card.groupId, table.group.id))
		.where(and(eq(table.group.id, groupId), eq(table.group.userId, userId)));
	if (!g) throw new NotFoundError('Group not found');

	const [members, related] = await Promise.all([
		db
			.select({
				id: table.groupMember.id,
				meaningId: table.meaning.id,
				wordId: table.word.id,
				headword: table.word.headword,
				pos: table.word.pos,
				wordGrammar: table.word.grammar,
				meaningGrammar: table.meaning.grammar,
				glosses: table.meaning.glosses,
				deckStatus: table.meaning.deckStatus,
				rule: table.groupMember.rule,
				example: table.groupMember.example
			})
			.from(table.groupMember)
			.innerJoin(table.meaning, eq(table.meaning.id, table.groupMember.meaningId))
			.innerJoin(table.word, eq(table.word.id, table.meaning.wordId))
			.where(eq(table.groupMember.groupId, groupId))
			.orderBy(asc(table.groupMember.position), asc(table.word.headword), asc(table.meaning.id)),
		db
			.select({
				id: table.group.id,
				kind: table.group.kind,
				label: table.group.label,
				prefix: table.prefix.prefix
			})
			.from(table.groupRelation)
			.innerJoin(table.group, eq(table.group.id, table.groupRelation.relatedGroupId))
			.leftJoin(table.prefix, eq(table.prefix.id, table.group.prefixId))
			.where(eq(table.groupRelation.groupId, groupId))
			.orderBy(asc(table.group.label))
	]);

	const view = {
		id: g.group.id,
		kind: g.group.kind,
		label: g.group.label,
		note: g.group.note,
		prefix: g.prefix ? { id: g.prefix.id, prefix: g.prefix.prefix, type: g.prefix.type } : null
	};
	return {
		...view,
		title: groupTitle({ ...view, prefix: view.prefix?.prefix }),
		qualifiedAt: g.group.qualifiedAt,
		cardId: g.cardId,
		members: members.map((m) => {
			const wg = m.wordGrammar as Grammar;
			const mg = m.meaningGrammar as Grammar;
			return {
				id: m.id,
				meaningId: m.meaningId,
				wordId: m.wordId,
				headword: m.headword,
				display: memberDisplay(m.headword, m.pos, wg, mg),
				pos: m.pos,
				posLabel: posLabel(m.pos, wg),
				glosses: m.glosses,
				deckStatus: m.deckStatus,
				rule: m.rule,
				example: m.example,
				prefixType: m.pos === 'verb' ? ((wg.prefixType as string | undefined) ?? null) : null
			};
		}),
		related: related.map((r) => ({ id: r.id, title: groupTitle(r) }))
	};
}

/** The groups each meaning belongs to, for "other ways to say …" links on card backs. */
export async function groupsOfMeanings(
	db: Db,
	userId: string,
	meaningIds: number[]
): Promise<Map<number, { id: number; kind: GroupKind; title: string }[]>> {
	const out = new Map<number, { id: number; kind: GroupKind; title: string }[]>();
	if (!meaningIds.length) return out;
	const rows = await db
		.select({
			meaningId: table.groupMember.meaningId,
			id: table.group.id,
			kind: table.group.kind,
			label: table.group.label,
			prefix: table.prefix.prefix
		})
		.from(table.groupMember)
		.innerJoin(table.group, eq(table.group.id, table.groupMember.groupId))
		.leftJoin(table.prefix, eq(table.prefix.id, table.group.prefixId))
		.where(and(eq(table.group.userId, userId), inArray(table.groupMember.meaningId, meaningIds)))
		.orderBy(asc(table.group.kind), asc(table.group.label));
	for (const r of rows) {
		const list = out.get(r.meaningId) ?? [];
		list.push({ id: r.id, kind: r.kind, title: groupTitle(r) });
		out.set(r.meaningId, list);
	}
	return out;
}

/** Groups whose label matches an English search term, for the top of search results. */
export async function searchGroups(
	db: Db,
	userId: string,
	term: string
): Promise<{ id: number; kind: GroupKind; title: string }[]> {
	const t = term.trim().toLowerCase().replace(/^to /, '');
	if (t.length < 2) return [];
	const rows = await db
		.select({
			id: table.group.id,
			kind: table.group.kind,
			label: table.group.label,
			prefix: table.prefix.prefix
		})
		.from(table.group)
		.leftJoin(table.prefix, eq(table.prefix.id, table.group.prefixId))
		.where(
			and(
				eq(table.group.userId, userId),
				or(
					// "to know", "know" → "to know"; "at" → "at / in (a place)".
					sql`${table.group.label} ~* ${`(^|[ /(])(to )?${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[ /)])`}`,
					// The base verb of a family: "kommen".
					and(eq(table.group.kind, 'verb_family'), sql`lower(${table.group.label}) = ${t}`)
				)
			)
		)
		.orderBy(asc(table.group.kind), asc(table.group.label))
		.limit(5);
	return rows.map((r) => ({ id: r.id, kind: r.kind, title: groupTitle(r) }));
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

async function ownGroup(db: Db, userId: string, groupId: number) {
	const [g] = await db
		.select()
		.from(table.group)
		.where(and(eq(table.group.id, groupId), eq(table.group.userId, userId)));
	if (!g) throw new NotFoundError('Group not found');
	return g;
}

export async function createGroup(
	db: Db,
	userId: string,
	input: { kind: GroupKind; label: string; note?: string | null; prefixId?: number | null }
): Promise<number> {
	const [g] = await db
		.insert(table.group)
		.values({
			userId,
			kind: input.kind,
			label: input.label,
			note: input.note || null,
			prefixId: input.kind === 'prefix_meaning' ? (input.prefixId ?? null) : null
		})
		.returning({ id: table.group.id });
	return g.id;
}

export async function updateGroup(
	db: Db,
	userId: string,
	groupId: number,
	input: { label: string; note: string | null }
): Promise<void> {
	await ownGroup(db, userId, groupId);
	await db
		.update(table.group)
		.set({ label: input.label, note: input.note || null })
		.where(eq(table.group.id, groupId));
}

/** Deletes the group and its card. Member meanings stay in the collection. */
export async function deleteGroup(db: Db, userId: string, groupId: number): Promise<void> {
	await ownGroup(db, userId, groupId);
	await db.delete(table.group).where(eq(table.group.id, groupId));
}

export async function addMember(
	db: Db,
	userId: string,
	groupId: number,
	meaningId: number,
	input: { rule?: string | null; example?: string | null } = {}
): Promise<void> {
	await ownGroup(db, userId, groupId);
	await ownMeaning(db, userId, meaningId);
	const [{ next }] = await db
		.select({ next: sql<number>`coalesce(max(${table.groupMember.position}) + 1, 0)::int` })
		.from(table.groupMember)
		.where(eq(table.groupMember.groupId, groupId));
	await db
		.insert(table.groupMember)
		.values({
			groupId,
			meaningId,
			rule: input.rule || null,
			example: input.example || null,
			position: next
		})
		.onConflictDoNothing();
	await refreshGroups(db, userId);
}

async function ownMember(db: Db, userId: string, memberId: number) {
	const [m] = await db
		.select({ member: table.groupMember })
		.from(table.groupMember)
		.innerJoin(table.group, eq(table.group.id, table.groupMember.groupId))
		.where(and(eq(table.groupMember.id, memberId), eq(table.group.userId, userId)));
	if (!m) throw new NotFoundError('Member not found');
	return m.member;
}

export async function updateMember(
	db: Db,
	userId: string,
	memberId: number,
	input: { rule: string | null; example: string | null }
): Promise<void> {
	await ownMember(db, userId, memberId);
	await db
		.update(table.groupMember)
		.set({ rule: input.rule || null, example: input.example || null })
		.where(eq(table.groupMember.id, memberId));
}

export async function removeMember(db: Db, userId: string, memberId: number): Promise<void> {
	await ownMember(db, userId, memberId);
	await db.delete(table.groupMember).where(eq(table.groupMember.id, memberId));
}

/** Moves a member one place up or down. */
export async function moveMember(
	db: Db,
	userId: string,
	memberId: number,
	direction: -1 | 1
): Promise<void> {
	const member = await ownMember(db, userId, memberId);
	const siblings = await db
		.select({ id: table.groupMember.id })
		.from(table.groupMember)
		.where(eq(table.groupMember.groupId, member.groupId))
		.orderBy(asc(table.groupMember.position), asc(table.groupMember.id));
	const ids = siblings.map((s) => s.id);
	const i = ids.indexOf(memberId);
	const j = i + direction;
	if (j < 0 || j >= ids.length) return;
	[ids[i], ids[j]] = [ids[j], ids[i]];
	await db.transaction(async (tx) => {
		for (const [position, id] of ids.entries())
			await tx.update(table.groupMember).set({ position }).where(eq(table.groupMember.id, id));
	});
}

/** Links two groups both ways ("to (a place)" ↔ "from (a place)"), or unlinks them. */
export async function setRelated(
	db: Db,
	userId: string,
	groupId: number,
	otherId: number,
	related: boolean
): Promise<void> {
	if (groupId === otherId) return;
	await ownGroup(db, userId, groupId);
	await ownGroup(db, userId, otherId);
	const pairs = [
		{ groupId, relatedGroupId: otherId },
		{ groupId: otherId, relatedGroupId: groupId }
	];
	if (related) await db.insert(table.groupRelation).values(pairs).onConflictDoNothing();
	else
		await db
			.delete(table.groupRelation)
			.where(
				or(
					and(
						eq(table.groupRelation.groupId, groupId),
						eq(table.groupRelation.relatedGroupId, otherId)
					),
					and(
						eq(table.groupRelation.groupId, otherId),
						eq(table.groupRelation.relatedGroupId, groupId)
					)
				)
			);
}

// ---------------------------------------------------------------------------
// Prefixes
// ---------------------------------------------------------------------------

export async function listPrefixes(db: Db, userId: string) {
	const rows = await db
		.select({
			prefix: table.prefix.prefix,
			type: table.prefix.type,
			verbs: sql<number>`(select count(*) from word w where w.prefix_id = ${table.prefix.id} and w.user_id = ${userId})::int`,
			meanings: sql<number>`(select count(*) from "group" g where g.prefix_id = ${table.prefix.id} and g.user_id = ${userId})::int`
		})
		.from(table.prefix)
		.orderBy(asc(table.prefix.type), asc(table.prefix.prefix));
	return rows;
}

export interface PrefixView {
	id: number;
	prefix: string;
	type: PrefixType;
	note: string | null;
	meanings: GroupView[];
	/** Collection verbs with this prefix that aren't in any of its meaning groups. */
	otherVerbs: { wordId: number; headword: string; gloss: string | null; deckStatus: DeckStatus }[];
}

export async function getPrefix(db: Db, userId: string, prefix: string): Promise<PrefixView> {
	const [p] = await db.select().from(table.prefix).where(eq(table.prefix.prefix, prefix));
	if (!p) throw new NotFoundError('Prefix not found');
	const groupIds = (
		await db
			.select({ id: table.group.id })
			.from(table.group)
			.where(and(eq(table.group.userId, userId), eq(table.group.prefixId, p.id)))
			.orderBy(asc(table.group.label))
	).map((g) => g.id);
	const meanings = await Promise.all(groupIds.map((id) => getGroup(db, userId, id)));
	const grouped = new Set(meanings.flatMap((g) => g.members.map((m) => m.wordId)));
	const verbs = await db
		.select({
			wordId: table.word.id,
			headword: table.word.headword,
			gloss: sql<
				string | null
			>`(select m.glosses[1] from meaning m where m.word_id = "word"."id" order by m.id limit 1)`,
			deckStatus: sql<DeckStatus>`coalesce((select m.deck_status from meaning m where m.word_id = "word"."id" order by case m.deck_status when 'studying' then 0 when 'known' then 1 else 2 end limit 1), 'not_in_deck')`
		})
		.from(table.word)
		.where(and(eq(table.word.userId, userId), eq(table.word.prefixId, p.id)))
		.orderBy(asc(table.word.headword));
	return {
		id: p.id,
		prefix: p.prefix,
		type: p.type,
		note: PREFIX_NOTES[p.prefix] ?? null,
		meanings,
		otherVerbs: verbs.filter((v) => !grouped.has(v.wordId))
	};
}

/** The prefix-meaning groups a verb's prefix offers, and which ones each meaning is in. */
export async function prefixMeaningsForWord(db: Db, userId: string, wordId: number) {
	const [w] = await db
		.select({ prefixId: table.word.prefixId, prefix: table.prefix.prefix })
		.from(table.word)
		.leftJoin(table.prefix, eq(table.prefix.id, table.word.prefixId))
		.where(and(eq(table.word.id, wordId), eq(table.word.userId, userId)));
	if (!w?.prefixId) return null;
	const options = await db
		.select({ id: table.group.id, label: table.group.label })
		.from(table.group)
		.where(
			and(
				eq(table.group.userId, userId),
				eq(table.group.prefixId, w.prefixId),
				eq(table.group.kind, 'prefix_meaning')
			)
		)
		.orderBy(asc(table.group.label));
	const chosen = options.length
		? await db
				.select({ meaningId: table.groupMember.meaningId, groupId: table.groupMember.groupId })
				.from(table.groupMember)
				.innerJoin(table.meaning, eq(table.meaning.id, table.groupMember.meaningId))
				.where(
					and(
						eq(table.meaning.wordId, wordId),
						inArray(
							table.groupMember.groupId,
							options.map((o) => o.id)
						)
					)
				)
		: [];
	return {
		prefixId: w.prefixId,
		prefix: w.prefix!,
		options,
		byMeaning: Object.fromEntries(chosen.map((c) => [c.meaningId, c.groupId])) as Record<
			number,
			number
		>
	};
}

/** Sets the prefix meaning a verb meaning uses (one per prefix), or clears it with null. */
export async function setPrefixMeaning(
	db: Db,
	userId: string,
	meaningId: number,
	groupId: number | null
): Promise<void> {
	const m = await ownMeaning(db, userId, meaningId);
	const info = await prefixMeaningsForWord(db, userId, m.wordId);
	if (!info) return;
	const optionIds = info.options.map((o) => o.id);
	if (groupId !== null && !optionIds.includes(groupId)) throw new NotFoundError('Group not found');
	if (optionIds.length)
		await db
			.delete(table.groupMember)
			.where(
				and(
					eq(table.groupMember.meaningId, meaningId),
					inArray(table.groupMember.groupId, optionIds)
				)
			);
	if (groupId !== null) await addMember(db, userId, groupId, meaningId);
}

/** Collection meanings matching a search, to add as group members. */
export async function findMeanings(db: Db, userId: string, query: string) {
	const q = query.trim();
	if (!q) return [];
	return db
		.select({
			meaningId: table.meaning.id,
			headword: table.word.headword,
			pos: table.word.pos,
			gloss: sql<string>`${table.meaning.glosses}[1]`,
			deckStatus: table.meaning.deckStatus
		})
		.from(table.meaning)
		.innerJoin(table.word, eq(table.word.id, table.meaning.wordId))
		.where(
			and(
				eq(table.meaning.userId, userId),
				or(
					sql`de_fold(${table.word.headword}) = de_fold(${q})`,
					sql`de_fold(${table.word.headword}) like de_fold(${q}) || '%'`,
					sql`lower(array_to_string(${table.meaning.glosses}, ' ')) like ${`%${q.toLowerCase()}%`}`
				)
			)
		)
		.orderBy(asc(table.word.headword), asc(table.meaning.id))
		.limit(20);
}
