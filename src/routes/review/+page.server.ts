import { db } from '#lib/server/db/index.js';
import { listTags } from '#lib/server/collection.js';
import { userId } from '#lib/server/forms.js';
import { loadStudyData, queueFor } from '#lib/server/study.js';
import {
	dayOf,
	isDay,
	previousMonth,
	previousWeek,
	type Anchor,
	type ReviewOrder
} from '#lib/queue.js';
import { parseSessionParams, sessionQuery, type SessionParams } from '#lib/session-params.js';
import type { PageServerLoad } from './$types';

export interface Choice {
	label: string;
	detail?: string;
	count: number;
	/** The query string of the study session. */
	query: string;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const uid = userId(locals);
	const [data, allTags] = await Promise.all([loadStudyData(db, uid), listTags(db, uid)]);
	// Filters, direction and order come from this page's own URL.
	const base = parseSessionParams(url.searchParams, data.settings.reviewOrder);
	const o = url.searchParams.get('order');
	const order: ReviewOrder =
		o === 'shuffled' || o === 'oldest_first' ? o : data.settings.reviewOrder;
	const now = new Date();
	const today = dayOf(now, data.settings.timeZone);

	const choice = (label: string, p: SessionParams, detail?: string): Choice => ({
		label,
		detail,
		count: queueFor(data, p.selection, p, p.direction, now).length,
		query: sessionQuery(p)
	});
	const review = (anchor: Anchor): SessionParams => ({
		...base,
		selection: { type: 'review', anchor, order }
	});

	const week = previousWeek(today);
	const month = previousMonth(today);
	const from = url.searchParams.get('from');
	const to = url.searchParams.get('to');
	const custom =
		isDay(from) && isDay(to) ? (from <= to ? { from, to } : { from: to, to: from }) : null;

	return {
		today,
		order,
		direction: base.direction,
		tags: base.tags,
		pos: base.pos,
		allTags,
		custom,
		reviews: [
			choice('Last 7 days', review({ kind: 'last7' }), 'First seen this past week'),
			choice('Last 30 days', review({ kind: 'last30' }), 'First seen this past month'),
			choice(
				'Never revisited',
				review({ kind: 'never_revisited' }),
				'Seen once as a new card, never since'
			),
			choice('Previous week', review({ kind: 'range', ...week }), `${week.from} to ${week.to}`),
			choice('Previous month', review({ kind: 'range', ...month }), `${month.from} to ${month.to}`)
		],
		customChoice: custom
			? choice(
					'Custom range',
					review({ kind: 'range', ...custom }),
					`${custom.from} to ${custom.to}`
				)
			: null,
		cram: [
			choice(
				'Cram',
				{ ...base, selection: { type: 'cram', includeKnown: false, order } },
				'Every card you are studying'
			),
			choice(
				'Cram with known cards',
				{ ...base, selection: { type: 'cram', includeKnown: true, order } },
				'Studying and known cards'
			)
		]
	};
};
