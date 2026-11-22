/**
 * Writes parsed dictionary entries into the shared `dict_*` tables.
 *
 * Used by the word-bank loader and by the on-demand fetch. Words and senses are
 * upserted in place (by source reference and sense position) so ids that the user's
 * collection points at survive a reload; forms and examples are replaced.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as table from '../db/schema.js';
import type { ParsedEntry } from './kaikki.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<PgQueryResultHKT, typeof table, any>;

export interface StoredEntry extends ParsedEntry {
	frequencyRank?: number | null;
	tatoeba?: { german: string; english: string }[];
}

const chunk = <T>(items: T[], size: number): T[][] =>
	Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
		items.slice(i * size, (i + 1) * size)
	);

/** Upserts entries; returns the dict_word id for each entry, in order. */
export async function storeEntries(
	db: Db,
	entries: StoredEntry[],
	options: { fetchedOnDemand: boolean; onProgress?: (done: number) => void }
): Promise<number[]> {
	const ids: number[] = [];
	for (const batch of chunk(entries, 500)) {
		await db.transaction(async (tx) => {
			const words = await tx
				.insert(table.dictWord)
				.values(
					batch.map((e) => ({
						headword: e.headword,
						pos: e.pos,
						sourceRef: e.sourceRef,
						grammar: e.grammar,
						frequencyRank: e.frequencyRank ?? null,
						fetchedOnDemand: options.fetchedOnDemand
					}))
				)
				.onConflictDoUpdate({
					target: table.dictWord.sourceRef,
					set: {
						headword: sql`excluded.headword`,
						pos: sql`excluded.pos`,
						grammar: sql`excluded.grammar`,
						frequencyRank: sql`excluded.frequency_rank`,
						fetchedOnDemand: sql`${table.dictWord.fetchedOnDemand} and excluded.fetched_on_demand`,
						updatedAt: sql`now()`
					}
				})
				.returning({ id: table.dictWord.id, sourceRef: table.dictWord.sourceRef });
			const idByRef = new Map(words.map((w) => [w.sourceRef, w.id]));
			const wordIds = batch.map((e) => idByRef.get(e.sourceRef)!);
			ids.push(...wordIds);

			// Senses: upsert by position, drop positions that no longer exist.
			const senseRows = batch.flatMap((e, i) =>
				e.senses.map((s, position) => ({
					dictWordId: wordIds[i],
					position,
					glosses: s.glosses,
					glossSearch: s.glosses.join(' ').toLowerCase(),
					details: s.details
				}))
			);
			const senses = senseRows.length
				? await tx
						.insert(table.dictSense)
						.values(senseRows)
						.onConflictDoUpdate({
							target: [table.dictSense.dictWordId, table.dictSense.position],
							set: {
								glosses: sql`excluded.glosses`,
								glossSearch: sql`excluded.gloss_search`,
								details: sql`excluded.details`
							}
						})
						.returning({
							id: table.dictSense.id,
							dictWordId: table.dictSense.dictWordId,
							position: table.dictSense.position
						})
				: [];
			await tx.execute(sql`
				delete from ${table.dictSense} s
				using (select unnest(${sql.param(wordIds)}::int[]) as id,
				              unnest(${sql.param(batch.map((e) => e.senses.length))}::int[]) as n) v
				where s.dict_word_id = v.id and s.position >= v.n`);
			const senseId = new Map(senses.map((s) => [`${s.dictWordId}:${s.position}`, s.id]));

			await tx.delete(table.dictForm).where(inArray(table.dictForm.dictWordId, wordIds));
			const formRows = batch.flatMap((e, i) =>
				e.forms.map((f) => ({ dictWordId: wordIds[i], form: f.form, tags: f.tags }))
			);
			for (const rows of chunk(formRows, 5000)) await tx.insert(table.dictForm).values(rows);

			await tx.delete(table.dictExample).where(inArray(table.dictExample.dictWordId, wordIds));
			const exampleRows = batch.flatMap((e, i) => [
				...e.senses.flatMap((s, position) =>
					s.examples.map((x) => ({
						dictWordId: wordIds[i],
						dictSenseId: senseId.get(`${wordIds[i]}:${position}`) ?? null,
						german: x.german,
						english: x.english,
						source: 'dictionary' as const
					}))
				),
				...(e.tatoeba ?? []).map((x) => ({
					dictWordId: wordIds[i],
					dictSenseId: null,
					german: x.german,
					english: x.english,
					source: 'tatoeba' as const
				}))
			]);
			for (const rows of chunk(exampleRows, 3000)) await tx.insert(table.dictExample).values(rows);
		});
		options.onProgress?.(ids.length);
	}
	return ids;
}

export async function getMeta(db: Db, key: string): Promise<string | null> {
	const [row] = await db
		.select({ value: table.dictMeta.value })
		.from(table.dictMeta)
		.where(eq(table.dictMeta.key, key));
	return row?.value ?? null;
}

export async function setMeta(db: Db, key: string, value: string): Promise<void> {
	await db
		.insert(table.dictMeta)
		.values({ key, value })
		.onConflictDoUpdate({ target: table.dictMeta.key, set: { value, updatedAt: sql`now()` } });
}

/** True when a verb with this headword is in the dictionary tables. */
export async function isKnownVerb(db: Db, headword: string): Promise<boolean> {
	const [row] = await db
		.select({ id: table.dictWord.id })
		.from(table.dictWord)
		.where(and(eq(table.dictWord.headword, headword), eq(table.dictWord.pos, 'verb')))
		.limit(1);
	return !!row;
}
