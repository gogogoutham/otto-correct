/**
 * Which grammar fields each part of speech has, how to show them in one line, and how
 * to read them back from an edit form. Shared by the server and the pages.
 */

export type PartOfSpeech =
	| 'verb'
	| 'noun'
	| 'adjective'
	| 'adverb'
	| 'preposition'
	| 'conjunction'
	| 'particle'
	| 'expression';

export const PARTS_OF_SPEECH: PartOfSpeech[] = [
	'noun',
	'verb',
	'adjective',
	'adverb',
	'preposition',
	'conjunction',
	'particle',
	'expression'
];

export type Grammar = Record<string, unknown>;

/** The part of speech as shown: postpositions are stored as prepositions. */
export const posLabel = (pos: PartOfSpeech, grammar: Grammar): string =>
	pos === 'preposition' && grammar.postposition === true ? 'postposition' : pos;

export type FieldKind =
	| { type: 'text' }
	/** Several values, edited as a comma-separated list. */
	| { type: 'list' }
	| { type: 'bool' }
	| { type: 'choice'; options: { value: string; label: string }[] }
	| { type: 'multi'; options: { value: string; label: string }[] };

export interface GrammarField {
	key: string;
	label: string;
	kind: FieldKind;
	/** Applies German input helpers (umlaut buttons). */
	german?: boolean;
}

const CASES = [
	{ value: 'accusative', label: 'accusative' },
	{ value: 'dative', label: 'dative' },
	{ value: 'genitive', label: 'genitive' }
];

const comparison: GrammarField[] = [
	{ key: 'comparative', label: 'Comparative', kind: { type: 'text' }, german: true },
	{ key: 'superlative', label: 'Superlative', kind: { type: 'text' }, german: true },
	{ key: 'notComparable', label: 'Not comparable', kind: { type: 'bool' } }
];

export const GRAMMAR_FIELDS: Record<PartOfSpeech, GrammarField[]> = {
	noun: [
		{
			key: 'genders',
			label: 'Gender',
			kind: {
				type: 'multi',
				options: [
					{ value: 'm', label: 'der' },
					{ value: 'f', label: 'die' },
					{ value: 'n', label: 'das' }
				]
			}
		},
		{ key: 'plurals', label: 'Plural', kind: { type: 'list' }, german: true },
		{ key: 'genitives', label: 'Genitive', kind: { type: 'list' }, german: true },
		{ key: 'noPlural', label: 'No plural', kind: { type: 'bool' } },
		{ key: 'pluralOnly', label: 'Plural only', kind: { type: 'bool' } },
		{
			key: 'declension',
			label: 'Declension',
			kind: {
				type: 'choice',
				options: [
					{ value: 'strong', label: 'strong' },
					{ value: 'weak', label: 'weak (n-declension)' },
					{ value: 'mixed', label: 'mixed' }
				]
			}
		},
		{ key: 'adjectival', label: 'Declines like an adjective', kind: { type: 'bool' } }
	],
	verb: [
		{ key: 'thirdPersonPresent', label: 'er/sie/es', kind: { type: 'text' }, german: true },
		{ key: 'preterite', label: 'Präteritum', kind: { type: 'text' }, german: true },
		{ key: 'pastParticiple', label: 'Partizip II', kind: { type: 'text' }, german: true },
		{
			key: 'auxiliaries',
			label: 'Auxiliary',
			kind: {
				type: 'multi',
				options: [
					{ value: 'haben', label: 'haben' },
					{ value: 'sein', label: 'sein' }
				]
			}
		},
		{ key: 'subjunctiveII', label: 'Konjunktiv II', kind: { type: 'text' }, german: true },
		{ key: 'imperativeSingular', label: 'Imperative (du)', kind: { type: 'list' }, german: true },
		{
			key: 'conjugation',
			label: 'Conjugation',
			kind: {
				type: 'choice',
				options: [
					{ value: 'weak', label: 'weak' },
					{ value: 'strong', label: 'strong' },
					{ value: 'mixed', label: 'mixed' },
					{ value: 'irregular', label: 'irregular' }
				]
			}
		},
		{ key: 'prefix', label: 'Prefix', kind: { type: 'text' }, german: true },
		{
			key: 'prefixType',
			label: 'Prefix type',
			kind: {
				type: 'choice',
				options: [
					{ value: 'separable', label: 'separable' },
					{ value: 'inseparable', label: 'inseparable' }
				]
			}
		},
		{ key: 'baseVerb', label: 'Base verb', kind: { type: 'text' }, german: true }
	],
	adjective: [
		...comparison,
		{ key: 'declinedStem', label: 'Declined stem', kind: { type: 'text' }, german: true },
		{ key: 'neverDeclines', label: 'Never declines', kind: { type: 'bool' } },
		{ key: 'predicativeOnly', label: 'Predicative only', kind: { type: 'bool' } }
	],
	adverb: comparison,
	preposition: [
		{ key: 'postposition', label: 'Comes after its noun (postposition)', kind: { type: 'bool' } },
		{ key: 'governs', label: 'Takes', kind: { type: 'multi', options: CASES } },
		{ key: 'twoWay', label: 'Two-way (Wechselpräposition)', kind: { type: 'bool' } },
		{ key: 'contractions', label: 'Contractions', kind: { type: 'list' }, german: true }
	],
	conjunction: [
		{
			key: 'wordOrder',
			label: 'Word order',
			kind: {
				type: 'choice',
				options: [
					{ value: 'coordinating', label: 'coordinating (und, aber)' },
					{ value: 'subordinating', label: 'verb at the end (weil, dass)' },
					{ value: 'adverbial', label: 'verb next (deshalb, trotzdem)' }
				]
			}
		}
	],
	particle: [],
	expression: []
};

/** Meaning-level fields that can be edited, by part of speech. */
export function meaningFields(pos: PartOfSpeech): GrammarField[] {
	if (pos === 'verb')
		return [
			{ key: 'reflexive', label: 'Reflexive (sich)', kind: { type: 'bool' } },
			{ key: 'objectCases', label: 'Object case', kind: { type: 'multi', options: CASES } }
		];
	if (pos === 'preposition')
		return [
			{ key: 'governs', label: 'Case in this meaning', kind: { type: 'multi', options: CASES } }
		];
	return [];
}

/** Reads a grammar edit form. Empty fields come back as `undefined`, meaning "remove". */
export function grammarFromForm(fields: GrammarField[], form: FormData, prefix = ''): Grammar {
	const out: Grammar = {};
	for (const f of fields) {
		const name = prefix + f.key;
		const raw = form.getAll(name).filter((v): v is string => typeof v === 'string');
		switch (f.kind.type) {
			case 'text': {
				const v = (raw[0] ?? '').trim();
				out[f.key] = v || undefined;
				break;
			}
			case 'list': {
				const v = splitList(raw[0] ?? '');
				out[f.key] = v.length ? v : undefined;
				break;
			}
			case 'bool':
				out[f.key] = raw.includes('on') ? true : undefined;
				break;
			case 'choice': {
				const allowed = f.kind.options.map((o) => o.value);
				out[f.key] = allowed.includes(raw[0]) ? raw[0] : undefined;
				break;
			}
			case 'multi': {
				const allowed = f.kind.options.map((o) => o.value);
				const v = raw.filter((r) => allowed.includes(r));
				out[f.key] = v.length ? v : undefined;
				break;
			}
		}
	}
	return out;
}

export const splitList = (s: string) =>
	s
		.split(',')
		.map((x) => x.trim())
		.filter(Boolean);

/** A field's value as the edit form shows it. */
export function fieldText(value: unknown): string {
	if (Array.isArray(value)) return value.join(', ');
	if (typeof value === 'string') return value;
	return '';
}

const ARTICLE: Record<string, string> = { m: 'der', f: 'die', n: 'das' };

export function articles(grammar: Grammar): string {
	const genders = (grammar.genders as string[] | undefined) ?? [];
	return genders.map((g) => ARTICLE[g] ?? g).join('/');
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

const WORD_ORDER_SHORT: Record<string, string> = {
	coordinating: 'normal word order',
	subordinating: 'verb at the end',
	adverbial: 'verb next'
};

/** One line of key grammar, e.g. "fährt · fuhr · ist gefahren" or "die Hunde · des Hundes". */
export function grammarSummary(pos: PartOfSpeech, g: Grammar, headword = ''): string {
	switch (pos) {
		case 'conjunction': {
			const order = str(g.wordOrder) ?? defaultWordOrder(headword);
			return order ? (WORD_ORDER_SHORT[order] ?? '') : '';
		}
		case 'noun': {
			const parts: string[] = [];
			if (g.pluralOnly) parts.push('plural only');
			else if (g.noPlural) parts.push('no plural');
			else if (list(g.plurals).length) parts.push(`die ${list(g.plurals).join(' / ')}`);
			if (list(g.genitives).length) parts.push(`des ${list(g.genitives).join(' / ')}`);
			if (g.declension === 'weak') parts.push('n-declension');
			return parts.join(' · ');
		}
		case 'verb': {
			const aux = list(g.auxiliaries)
				.map((a) => (a === 'sein' ? 'ist' : 'hat'))
				.join('/');
			const parts = [
				str(g.thirdPersonPresent),
				str(g.preterite),
				g.pastParticiple ? `${aux ? aux + ' ' : ''}${str(g.pastParticiple)}` : undefined
			].filter(Boolean);
			if (g.prefixType === 'separable') parts.push('separable');
			return parts.join(' · ');
		}
		case 'adjective':
		case 'adverb': {
			if (g.notComparable) return 'not comparable';
			const superlative = str(g.superlative);
			return [
				str(g.comparative),
				superlative && (superlative.startsWith('am ') ? superlative : `am ${superlative}`)
			]
				.filter(Boolean)
				.join(' · ');
		}
		case 'preposition': {
			const cases = list(g.governs).map((c) => `+ ${c.slice(0, 3)}`);
			return [g.postposition ? 'after its noun' : '', cases.join(' / '), g.twoWay ? 'two-way' : '']
				.filter(Boolean)
				.join(' · ');
		}
		default:
			return '';
	}
}

export type WordOrder = 'coordinating' | 'subordinating' | 'adverbial';

/**
 * Word order after common conjunctions. Wiktionary doesn't record it, so this list fills
 * in when the word has none set by hand.
 */
const WORD_ORDER: Record<string, WordOrder> = {
	und: 'coordinating',
	aber: 'coordinating',
	oder: 'coordinating',
	denn: 'coordinating',
	sondern: 'coordinating',
	doch: 'coordinating',
	weil: 'subordinating',
	dass: 'subordinating',
	ob: 'subordinating',
	wenn: 'subordinating',
	als: 'subordinating',
	obwohl: 'subordinating',
	damit: 'subordinating',
	bevor: 'subordinating',
	nachdem: 'subordinating',
	während: 'subordinating',
	falls: 'subordinating',
	seit: 'subordinating',
	seitdem: 'subordinating',
	sodass: 'subordinating',
	bis: 'subordinating',
	sobald: 'subordinating',
	solange: 'subordinating',
	wie: 'subordinating',
	indem: 'subordinating',
	deshalb: 'adverbial',
	deswegen: 'adverbial',
	daher: 'adverbial',
	darum: 'adverbial',
	trotzdem: 'adverbial',
	also: 'adverbial',
	dann: 'adverbial',
	sonst: 'adverbial',
	außerdem: 'adverbial',
	dennoch: 'adverbial'
};

export const defaultWordOrder = (headword: string): WordOrder | undefined =>
	WORD_ORDER[headword.toLowerCase()];

/** Values that aren't stored but are filled in when the word has none (conjunction word order). */
export function grammarDefaults(headword: string, pos: PartOfSpeech): Grammar {
	const order = pos === 'conjunction' ? defaultWordOrder(headword) : undefined;
	return order ? { wordOrder: order } : {};
}
