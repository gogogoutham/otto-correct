/**
 * The queue builder: given the cards, the review log and a selection, returns the cards
 * to study, in order. Pure and swappable: it holds every scheduling rule and nothing else.
 *
 * Rules (requirements, "Review schedule"):
 * - New cards: unreviewed studying cards, oldest queued first (FIFO), up to the daily
 *   limit. Missed days don't pile up: the limit is per day, minus cards already started
 *   today. A day starts at midnight in the user's time zone.
 * - Review: cards seen at least once, by first-seen date (the first review event), in a
 *   window: last 7 days, last 30 days, never revisited, or a custom date range.
 * - Cram: every studying card (and known ones if asked), ignoring the schedule.
 * - Pausing and resuming: cards already reviewed today (cram: crammed today) are skipped.
 * - Order: oldest first-seen first, or shuffled (stable for the day, so resuming keeps it).
 * - Filters: any of the selected tags, and a part of speech. Group cards only in
 *   English → German sessions.
 */

export type DeckStatus = 'studying' | 'known' | 'not_in_deck';
export type SessionType = 'new' | 'review' | 'cram';
export type Direction = 'en_de' | 'de_en';
export type ReviewOrder = 'oldest_first' | 'shuffled';

export interface QueueCard {
	id: number;
	kind: 'meaning' | 'group';
	status: DeckStatus;
	/** When the card joined the new-card queue; null if it never did (added as known). */
	queuedAt: Date | null;
	tags: string[];
	pos: string | null;
}

export interface QueueEvent {
	cardId: number;
	at: Date;
	sessionType: SessionType;
}

/** A calendar day in the user's time zone, as YYYY-MM-DD. */
export type Day = string;

export type Anchor =
	| { kind: 'last7' }
	| { kind: 'last30' }
	| { kind: 'never_revisited' }
	| { kind: 'range'; from: Day; to: Day };

export type Selection =
	| { type: 'new' }
	| { type: 'review'; anchor: Anchor; order: ReviewOrder }
	| { type: 'cram'; includeKnown: boolean; order: ReviewOrder };

export interface QueueFilter {
	/** Match any; empty means no tag filter. */
	tags: string[];
	pos: string | null;
}

export interface QueueInput {
	cards: QueueCard[];
	events: QueueEvent[];
	selection: Selection;
	filter: QueueFilter;
	direction: Direction;
	now: Date;
	timeZone: string;
	dailyNewLimit: number;
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** The calendar day an instant falls on in a time zone. */
export function dayOf(at: Date, timeZone: string): Day {
	let f = dayFormats.get(timeZone);
	if (!f) {
		f = new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});
		dayFormats.set(timeZone, f);
	}
	return f.format(at);
}

export function addDays(day: Day, n: number): Day {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Monday to Sunday of the calendar week before the one containing `today`. */
export function previousWeek(today: Day): { from: Day; to: Day } {
	const [y, m, d] = today.split('-').map(Number);
	const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
	const thisMonday = addDays(today, -weekday);
	return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
}

/** First to last day of the calendar month before the one containing `today`. */
export function previousMonth(today: Day): { from: Day; to: Day } {
	const [y, m] = today.split('-').map(Number);
	const first = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
	const last = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
	return { from: first, to: last };
}

export const isDay = (s: string | null | undefined): s is Day =>
	!!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// ---------------------------------------------------------------------------
// History per card
// ---------------------------------------------------------------------------

export interface CardHistory {
	firstSeen: Date;
	firstSeenDay: Day;
	reviews: number;
	/** The first event was in a new-card session. */
	firstWasNew: boolean;
	/** Session types of today's events. */
	today: Set<SessionType>;
}

export function histories(
	events: QueueEvent[],
	timeZone: string,
	today: Day
): Map<number, CardHistory> {
	const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
	const out = new Map<number, CardHistory>();
	for (const e of sorted) {
		const day = dayOf(e.at, timeZone);
		let h = out.get(e.cardId);
		if (!h) {
			h = {
				firstSeen: e.at,
				firstSeenDay: day,
				reviews: 0,
				firstWasNew: e.sessionType === 'new',
				today: new Set()
			};
			out.set(e.cardId, h);
		}
		h.reviews++;
		if (day === today) h.today.add(e.sessionType);
	}
	return out;
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

function matchesFilter(card: QueueCard, filter: QueueFilter, direction: Direction): boolean {
	if (card.kind === 'group' && direction !== 'en_de') return false;
	if (filter.pos && card.pos !== filter.pos) return false;
	if (filter.tags.length && !card.tags.some((t) => filter.tags.includes(t))) return false;
	return true;
}

export function inAnchor(h: CardHistory, anchor: Anchor, today: Day): boolean {
	switch (anchor.kind) {
		case 'last7':
			return h.firstSeenDay >= addDays(today, -6);
		case 'last30':
			return h.firstSeenDay >= addDays(today, -29);
		case 'never_revisited':
			return h.reviews === 1 && h.firstWasNew;
		case 'range':
			return h.firstSeenDay >= anchor.from && h.firstSeenDay <= anchor.to;
	}
}

/** A stable pseudo-random order for one day, so a paused shuffled session resumes the same. */
function shuffleKey(cardId: number, seed: string): number {
	let h = 2166136261;
	for (const c of `${seed}:${cardId}`) {
		h ^= c.charCodeAt(0);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** How many new cards are still on offer today, before filters. */
export function newCardsLeftToday(
	history: Map<number, CardHistory>,
	today: Day,
	dailyNewLimit: number
): number {
	let startedToday = 0;
	for (const h of history.values()) if (h.firstWasNew && h.firstSeenDay === today) startedToday++;
	return Math.max(0, dailyNewLimit - startedToday);
}

export function buildQueue(input: QueueInput): number[] {
	const today = dayOf(input.now, input.timeZone);
	const history = histories(input.events, input.timeZone, today);
	const cards = input.cards.filter((c) => matchesFilter(c, input.filter, input.direction));
	const sel = input.selection;

	if (sel.type === 'new') {
		const left = newCardsLeftToday(history, today, input.dailyNewLimit);
		return cards
			.filter((c) => c.status === 'studying' && c.queuedAt && !history.has(c.id))
			.sort((a, b) => a.queuedAt!.getTime() - b.queuedAt!.getTime() || a.id - b.id)
			.slice(0, left)
			.map((c) => c.id);
	}

	const order = (picked: QueueCard[]) => {
		const firstSeen = (c: QueueCard) => history.get(c.id)?.firstSeen.getTime() ?? Infinity;
		const queued = (c: QueueCard) => c.queuedAt?.getTime() ?? Infinity;
		return picked
			.sort((a, b) =>
				sel.order === 'shuffled'
					? shuffleKey(a.id, today) - shuffleKey(b.id, today)
					: firstSeen(a) - firstSeen(b) || queued(a) - queued(b) || a.id - b.id
			)
			.map((c) => c.id);
	};

	if (sel.type === 'review') {
		return order(
			cards.filter((c) => {
				const h = history.get(c.id);
				return c.status === 'studying' && h && inAnchor(h, sel.anchor, today) && h.today.size === 0;
			})
		);
	}

	// Cram.
	return order(
		cards.filter(
			(c) =>
				(c.status === 'studying' || (sel.includeKnown && c.status === 'known')) &&
				!history.get(c.id)?.today.has('cram')
		)
	);
}
