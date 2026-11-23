/**
 * Study sessions on top of the queue builder: loads cards and the review log, records
 * reviews, and counts what the home and review screens show.
 */
import { and, eq, sql } from 'drizzle-orm';
import * as table from './db/schema.js';
import type { Db } from './dictionary/store.js';
import {
	buildQueue,
	dayOf,
	histories,
	type Direction,
	type QueueCard,
	type QueueEvent,
	type QueueFilter,
	type ReviewOrder,
	type Selection,
	type SessionType
} from '#lib/queue.js';

export interface StudySettings {
	timeZone: string;
	dailyNewLimit: number;
	reviewOrder: ReviewOrder;
}

export async function getSettings(db: Db, userId: string): Promise<StudySettings> {
	const [u] = await db
		.select({
			timeZone: table.user.timeZone,
			dailyNewLimit: table.user.dailyNewLimit,
			reviewOrder: table.user.reviewOrder
		})
		.from(table.user)
		.where(eq(table.user.id, userId));
	return u;
}

export const isTimeZone = (tz: string) => {
	try {
		new Intl.DateTimeFormat('en', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
};

export async function updateSettings(
	db: Db,
	userId: string,
	settings: StudySettings
): Promise<void> {
	await db.update(table.user).set(settings).where(eq(table.user.id, userId));
}

export interface StudyData {
	cards: (QueueCard & { meaningId: number | null })[];
	events: QueueEvent[];
	settings: StudySettings;
}

/** Everything the queue builder needs, for one user. */
export async function loadStudyData(db: Db, userId: string): Promise<StudyData> {
	const [rows, events, settings] = await Promise.all([
		db
			.select({
				id: table.card.id,
				meaningId: table.card.meaningId,
				queuedAt: table.card.queuedAt,
				status: table.meaning.deckStatus,
				pos: table.word.pos,
				tags: sql<
					string[]
				>`coalesce(array_agg(${table.tag.name}) filter (where ${table.tag.name} is not null), '{}')`
			})
			.from(table.card)
			.innerJoin(table.meaning, eq(table.meaning.id, table.card.meaningId))
			.innerJoin(table.word, eq(table.word.id, table.meaning.wordId))
			.leftJoin(table.meaningTag, eq(table.meaningTag.meaningId, table.meaning.id))
			.leftJoin(table.tag, eq(table.tag.id, table.meaningTag.tagId))
			.where(eq(table.card.userId, userId))
			.groupBy(table.card.id, table.meaning.id, table.word.id),
		db
			.select({
				cardId: table.reviewEvent.cardId,
				at: table.reviewEvent.reviewedAt,
				sessionType: table.reviewEvent.sessionType
			})
			.from(table.reviewEvent)
			.where(eq(table.reviewEvent.userId, userId)),
		getSettings(db, userId)
	]);
	return {
		cards: rows.map((r) => ({ ...r, kind: 'meaning' as const })),
		events,
		settings
	};
}

export function queueFor(
	data: StudyData,
	selection: Selection,
	filter: QueueFilter,
	direction: Direction,
	now = new Date()
): number[] {
	return buildQueue({
		cards: data.cards,
		events: data.events,
		selection,
		filter,
		direction,
		now,
		timeZone: data.settings.timeZone,
		dailyNewLimit: data.settings.dailyNewLimit
	});
}

/** Logs one review. Never overwrites anything: first-seen dates come from this log. */
export async function recordReview(
	db: Db,
	userId: string,
	cardId: number,
	direction: Direction,
	sessionType: SessionType
): Promise<void> {
	const [c] = await db
		.select({ id: table.card.id })
		.from(table.card)
		.where(and(eq(table.card.id, cardId), eq(table.card.userId, userId)));
	if (!c) return;
	const now = new Date();
	await db.transaction(async (tx) => {
		await tx
			.insert(table.reviewEvent)
			.values({ userId, cardId, direction, sessionType, reviewedAt: now });
		await tx.update(table.card).set({ lastReviewedAt: now }).where(eq(table.card.id, cardId));
	});
}

export interface HomeCounts {
	newToday: number;
	neverRevisited: number;
	studying: number;
	known: number;
	reviewedToday: number;
}

export function homeCounts(data: StudyData, now = new Date()): HomeCounts {
	const tz = data.settings.timeZone;
	const today = dayOf(now, tz);
	const history = histories(data.events, tz, today);
	const filter = { tags: [], pos: null };
	return {
		newToday: queueFor(data, { type: 'new' }, filter, 'en_de', now).length,
		neverRevisited: queueFor(
			data,
			{ type: 'review', anchor: { kind: 'never_revisited' }, order: 'oldest_first' },
			filter,
			'en_de',
			now
		).length,
		studying: data.cards.filter((c) => c.status === 'studying').length,
		known: data.cards.filter((c) => c.status === 'known').length,
		reviewedToday: [...history.values()].filter((h) => h.today.size > 0).length
	};
}
