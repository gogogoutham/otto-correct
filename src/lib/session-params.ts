/**
 * A study session's settings, carried in the URL so a session can be paused, linked to
 * and resumed: type, review window, order, direction and filters.
 */
import { PARTS_OF_SPEECH, type PartOfSpeech } from './grammar.js';
import { isDay, type Anchor, type Direction, type ReviewOrder, type Selection } from './queue.js';

export interface SessionParams {
	selection: Selection;
	direction: Direction;
	tags: string[];
	pos: PartOfSpeech | null;
}

export function parseSessionParams(
	params: URLSearchParams,
	defaultOrder: ReviewOrder
): SessionParams {
	const type = params.get('type');
	const order: ReviewOrder =
		params.get('order') === 'shuffled'
			? 'shuffled'
			: params.get('order') === 'oldest_first'
				? 'oldest_first'
				: defaultOrder;
	let selection: Selection;
	if (type === 'review') selection = { type: 'review', anchor: parseAnchor(params), order };
	else if (type === 'cram')
		selection = { type: 'cram', includeKnown: params.get('known') === '1', order };
	else selection = { type: 'new' };
	return {
		selection,
		direction: params.get('dir') === 'de_en' ? 'de_en' : 'en_de',
		tags: params.getAll('tag').filter(Boolean),
		pos: PARTS_OF_SPEECH.find((p) => p === params.get('pos')) ?? null
	};
}

function parseAnchor(params: URLSearchParams): Anchor {
	const a = params.get('anchor');
	if (a === 'last30') return { kind: 'last30' };
	if (a === 'never') return { kind: 'never_revisited' };
	const from = params.get('from');
	const to = params.get('to');
	if (a === 'range' && isDay(from) && isDay(to))
		return from <= to ? { kind: 'range', from, to } : { kind: 'range', from: to, to: from };
	return { kind: 'last7' };
}

export function anchorParams(anchor: Anchor): Record<string, string> {
	switch (anchor.kind) {
		case 'last7':
			return { anchor: 'last7' };
		case 'last30':
			return { anchor: 'last30' };
		case 'never_revisited':
			return { anchor: 'never' };
		case 'range':
			return { anchor: 'range', from: anchor.from, to: anchor.to };
	}
}

/** The query string for a session. */
export function sessionQuery(p: SessionParams): string {
	const q: [string, string][] = [['type', p.selection.type]];
	if (p.selection.type === 'review')
		q.push(...Object.entries(anchorParams(p.selection.anchor)), ['order', p.selection.order]);
	if (p.selection.type === 'cram') {
		q.push(['order', p.selection.order]);
		if (p.selection.includeKnown) q.push(['known', '1']);
	}
	if (p.direction !== 'en_de') q.push(['dir', p.direction]);
	for (const t of p.tags) q.push(['tag', t]);
	if (p.pos) q.push(['pos', p.pos]);
	return q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

export function anchorLabel(anchor: Anchor): string {
	switch (anchor.kind) {
		case 'last7':
			return 'Last 7 days';
		case 'last30':
			return 'Last 30 days';
		case 'never_revisited':
			return 'Never revisited';
		case 'range':
			return anchor.from === anchor.to ? anchor.from : `${anchor.from} to ${anchor.to}`;
	}
}

export function sessionTitle(s: Selection): string {
	if (s.type === 'new') return 'New cards';
	if (s.type === 'cram') return s.includeKnown ? 'Cram (with known)' : 'Cram';
	return `Review: ${anchorLabel(s.anchor)}`;
}
