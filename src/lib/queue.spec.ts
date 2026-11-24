import { describe, expect, it } from 'vitest';
import {
	addDays,
	buildQueue,
	dayOf,
	previousMonth,
	previousWeek,
	type QueueCard,
	type QueueEvent,
	type QueueInput,
	type Selection
} from './queue.js';

const TZ = 'Europe/Berlin';
// Wednesday 2026-11-18, 10:00 in Berlin.
const NOW = new Date('2026-11-18T09:00:00Z');
const at = (iso: string) => new Date(iso);

const card = (id: number, over: Partial<QueueCard> = {}): QueueCard => ({
	id,
	kind: 'meaning',
	status: 'studying',
	queuedAt: at(`2026-10-01T00:00:${String(id).padStart(2, '0')}Z`),
	tags: [],
	pos: 'noun',
	...over
});
const ev = (
	cardId: number,
	iso: string,
	sessionType: QueueEvent['sessionType'] = 'new'
): QueueEvent => ({
	cardId,
	at: at(iso),
	sessionType
});

const queue = (over: Partial<QueueInput> & { selection: Selection }) =>
	buildQueue({
		cards: [],
		events: [],
		filter: { tags: [], pos: null },
		direction: 'en_de',
		now: NOW,
		timeZone: TZ,
		dailyNewLimit: 6,
		...over
	});

describe('days', () => {
	it('uses the user’s time zone for the day boundary', () => {
		// 23:30 UTC on the 17th is already the 18th in Berlin, still the 17th in New York.
		expect(dayOf(at('2026-11-17T23:30:00Z'), 'Europe/Berlin')).toBe('2026-11-18');
		expect(dayOf(at('2026-11-17T23:30:00Z'), 'America/New_York')).toBe('2026-11-17');
	});

	it('finds the previous calendar week (Mon–Sun) and month', () => {
		expect(previousWeek('2026-11-18')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
		expect(previousWeek('2026-11-16')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
		expect(previousWeek('2026-11-22')).toEqual({ from: '2026-11-09', to: '2026-11-15' });
		expect(previousMonth('2026-11-18')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
		expect(previousMonth('2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});
});

describe('new cards', () => {
	const cards = Array.from({ length: 10 }, (_, i) => card(i + 1));

	it('offers unreviewed cards oldest-queued first, up to the daily limit', () => {
		const shuffled = [...cards].reverse();
		expect(queue({ cards: shuffled, selection: { type: 'new' } })).toEqual([1, 2, 3, 4, 5, 6]);
	});

	it('counts cards already started today against the limit', () => {
		const events = [ev(1, '2026-11-18T07:00:00Z'), ev(2, '2026-11-18T07:01:00Z')];
		expect(queue({ cards, events, selection: { type: 'new' } })).toEqual([3, 4, 5, 6]);
	});

	it('does not pile up missed days: yesterday’s cards don’t add to today', () => {
		// Nothing studied for three days: still just the daily limit.
		const events = [ev(1, '2026-11-14T08:00:00Z')];
		expect(queue({ cards, events, selection: { type: 'new' } })).toEqual([2, 3, 4, 5, 6, 7]);
	});

	it('starts a new day at midnight in the user’s time zone', () => {
		// 23:30 UTC on the 17th is 00:30 on the 18th in Berlin: it counts for today.
		const events = [ev(1, '2026-11-17T23:30:00Z')];
		expect(queue({ cards, events, selection: { type: 'new' } })).toHaveLength(5);
		// 22:30 UTC on the 17th is 23:30 on the 17th in Berlin: yesterday.
		const before = [ev(1, '2026-11-17T22:30:00Z')];
		expect(queue({ cards, events: before, selection: { type: 'new' } })).toHaveLength(6);
	});

	it('skips known, not-in-deck and never-queued cards', () => {
		const mixed = [
			card(1, { status: 'known' }),
			card(2, { status: 'not_in_deck' }),
			card(3, { queuedAt: null }),
			card(4)
		];
		expect(queue({ cards: mixed, selection: { type: 'new' } })).toEqual([4]);
	});

	it('uses the user’s limit', () => {
		expect(queue({ cards, selection: { type: 'new' }, dailyNewLimit: 2 })).toEqual([1, 2]);
	});
});

describe('review', () => {
	const cards = [card(1), card(2), card(3), card(4), card(5)];
	const events = [
		ev(1, '2026-11-17T08:00:00Z'), // yesterday
		ev(2, '2026-11-12T08:00:00Z'), // 6 days ago: inside 7 days
		ev(3, '2026-11-11T08:00:00Z'), // 7 days ago: outside 7 days, inside 30
		ev(3, '2026-11-15T08:00:00Z', 'review'), // revisited
		ev(4, '2026-10-01T08:00:00Z') // 48 days ago
	];
	const review = (anchor: Extract<Selection, { type: 'review' }>['anchor']) =>
		queue({ cards, events, selection: { type: 'review', anchor, order: 'oldest_first' } });

	it('covers only cards seen at least once', () => {
		expect(review({ kind: 'last30' })).not.toContain(5);
	});

	it('windows by first-seen date, oldest first', () => {
		expect(review({ kind: 'last7' })).toEqual([2, 1]);
		expect(review({ kind: 'last30' })).toEqual([3, 2, 1]);
	});

	it('reviewing a card never moves it into a later window', () => {
		// Card 3 was reviewed 3 days ago, but first seen 7 days ago.
		expect(review({ kind: 'last7' })).not.toContain(3);
	});

	it('finds cards never revisited, whatever the date', () => {
		expect(review({ kind: 'never_revisited' })).toEqual([4, 2, 1]);
	});

	it('counts a cram review as a revisit', () => {
		const crammed = [...events, ev(4, '2026-11-01T08:00:00Z', 'cram')];
		expect(
			queue({
				cards,
				events: crammed,
				selection: { type: 'review', anchor: { kind: 'never_revisited' }, order: 'oldest_first' }
			})
		).toEqual([2, 1]);
	});

	it('takes a custom date range, inclusive', () => {
		expect(review({ kind: 'range', from: '2026-11-11', to: '2026-11-12' })).toEqual([3, 2]);
		expect(review({ kind: 'range', ...previousWeek('2026-11-18') })).toEqual([3, 2]);
		expect(review({ kind: 'range', ...previousMonth('2026-11-18') })).toEqual([4]);
	});

	it('resumes by skipping cards already reviewed today', () => {
		const today = [...events, ev(2, '2026-11-18T08:00:00Z', 'review')];
		expect(
			queue({
				cards,
				events: today,
				selection: { type: 'review', anchor: { kind: 'last7' }, order: 'oldest_first' }
			})
		).toEqual([1]);
	});

	it('leaves out known meanings', () => {
		const known = cards.map((c) => (c.id === 1 ? { ...c, status: 'known' as const } : c));
		expect(
			queue({
				cards: known,
				events,
				selection: { type: 'review', anchor: { kind: 'last7' }, order: 'oldest_first' }
			})
		).toEqual([2]);
	});

	it('shuffles the same way all day, so a paused session resumes in order', () => {
		const many = Array.from({ length: 20 }, (_, i) => card(i + 1));
		const seen = many.map((c) => ev(c.id, '2026-11-10T08:00:00Z'));
		const sel: Selection = { type: 'review', anchor: { kind: 'last30' }, order: 'shuffled' };
		const a = queue({ cards: many, events: seen, selection: sel });
		const b = queue({
			cards: many,
			events: seen,
			selection: sel,
			now: new Date('2026-11-18T20:00:00Z')
		});
		expect(a).toEqual(b);
		expect(a).not.toEqual([...a].sort((x, y) => x - y));
		expect([...a].sort((x, y) => x - y)).toEqual(many.map((c) => c.id));
	});
});

describe('cram', () => {
	const cards = [
		card(1),
		card(2, { status: 'known' }),
		card(3, { status: 'not_in_deck' }),
		card(4)
	];

	it('takes every studying card, ignoring the schedule', () => {
		expect(
			queue({ cards, selection: { type: 'cram', includeKnown: false, order: 'oldest_first' } })
		).toEqual([1, 4]);
	});

	it('includes known cards only when asked', () => {
		expect(
			queue({ cards, selection: { type: 'cram', includeKnown: true, order: 'oldest_first' } })
		).toEqual([1, 2, 4]);
	});

	it('resumes by skipping cards crammed today', () => {
		expect(
			queue({
				cards,
				events: [ev(1, '2026-11-18T08:00:00Z', 'cram')],
				selection: { type: 'cram', includeKnown: false, order: 'oldest_first' }
			})
		).toEqual([4]);
	});
});

describe('filters', () => {
	const cards = [
		card(1, { tags: ['body'], pos: 'noun' }),
		card(2, { tags: ['travel'], pos: 'verb' }),
		card(3, { tags: ['body', 'travel'], pos: 'verb' }),
		card(4, { kind: 'group', tags: ['body'], pos: null })
	];
	const cram: Selection = { type: 'cram', includeKnown: false, order: 'oldest_first' };

	it('matches any selected tag', () => {
		expect(queue({ cards, selection: cram, filter: { tags: ['body'], pos: null } })).toEqual([
			1, 3, 4
		]);
		expect(
			queue({ cards, selection: cram, filter: { tags: ['body', 'travel'], pos: null } })
		).toEqual([1, 2, 3, 4]);
	});

	it('filters by part of speech', () => {
		expect(queue({ cards, selection: cram, filter: { tags: [], pos: 'verb' } })).toEqual([2, 3]);
	});

	it('shows group cards only English → German', () => {
		expect(queue({ cards, selection: cram, direction: 'de_en' })).toEqual([1, 2, 3]);
	});
});
