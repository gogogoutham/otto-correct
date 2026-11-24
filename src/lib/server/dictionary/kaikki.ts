/**
 * Parses English Wiktionary German entries, as extracted by wiktextract and published
 * at kaikki.org, into the shape stored in the `dict_*` tables.
 *
 * Used by the offline word-bank build and by the on-demand fetch, so both produce
 * identical rows. Pure functions only: no I/O here.
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

/** The subset of a wiktextract entry this parser reads. */
export interface KaikkiEntry {
	word: string;
	pos: string;
	lang_code?: string;
	etymology_number?: number;
	head_templates?: { name?: string; args?: Record<string, string>; expansion?: string }[];
	forms?: { form: string; tags?: string[]; source?: string }[];
	senses?: KaikkiSense[];
	tags?: string[];
}

interface KaikkiSense {
	glosses?: string[];
	raw_glosses?: string[];
	tags?: string[];
	form_of?: { word: string }[];
	alt_of?: { word: string }[];
	examples?: { text?: string; english?: string; translation?: string; type?: string }[];
}

export type Case = 'accusative' | 'dative' | 'genitive';
export type Gender = 'm' | 'f' | 'n';

export interface ParsedSense {
	glosses: string[];
	details: {
		tags?: string[];
		/** Case(s) of the object(s), e.g. helfen + dative. */
		objectCases?: Case[];
		/** Prepositional objects, e.g. warten auf + accusative. */
		prepositionalObjects?: { preposition: string; case?: Case }[];
		/** Case governed, for prepositions. */
		governs?: Case[];
	};
	examples: { german: string; english: string | null }[];
}

export interface VerbGrammar {
	thirdPersonPresent?: string;
	preterite?: string;
	pastParticiple?: string;
	subjunctiveII?: string;
	imperativeSingular?: string[];
	auxiliaries?: ('haben' | 'sein')[];
	conjugation?: 'weak' | 'strong' | 'mixed' | 'irregular';
	prefix?: string;
	prefixType?: 'separable' | 'inseparable';
	/** Candidate base verb (ankommen → kommen). Verified against the bank at build time. */
	baseVerb?: string;
}

export interface NounGrammar {
	genders?: Gender[];
	plurals?: string[];
	genitives?: string[];
	noPlural?: boolean;
	pluralOnly?: boolean;
	declension?: 'strong' | 'weak' | 'mixed';
	adjectival?: boolean;
}

export interface ComparisonGrammar {
	comparative?: string;
	superlative?: string;
	notComparable?: boolean;
}

export interface AdjectiveGrammar extends ComparisonGrammar {
	/** Stem used when declined, when it differs from the headword (hoch → hoh-e). */
	declinedStem?: string;
	neverDeclines?: boolean;
	predicativeOnly?: boolean;
}

export interface PrepositionGrammar {
	/** Comes after its noun: meiner Meinung nach. */
	postposition?: boolean;
	governs?: Case[];
	twoWay?: boolean;
	contractions?: string[];
}

export type Grammar =
	| VerbGrammar
	| PrepositionGrammar
	| NounGrammar
	| AdjectiveGrammar
	| ComparisonGrammar
	| Record<string, never>;

export interface ParsedEntry {
	headword: string;
	pos: PartOfSpeech;
	sourceRef: string;
	grammar: Grammar;
	senses: ParsedSense[];
	forms: { form: string; tags: string[] }[];
}

const POS_MAP: Record<string, PartOfSpeech> = {
	verb: 'verb',
	noun: 'noun',
	adj: 'adjective',
	adv: 'adverb',
	prep: 'preposition',
	postp: 'preposition',
	conj: 'conjunction',
	particle: 'particle',
	phrase: 'expression',
	prep_phrase: 'expression',
	proverb: 'expression',
	idiom: 'expression'
};

const INSEPARABLE_PREFIXES = ['miss', 'emp', 'ent', 'zer', 'be', 'er', 'ge', 'ver'];
/** Separable or inseparable depending on meaning; unmarked in the source means inseparable. */
const EITHER_PREFIXES = ['wieder', 'wider', 'hinter', 'durch', 'unter', 'über', 'voll', 'um'];

/**
 * Wiktionary's German entries don't record which case a preposition takes, so the common
 * ones are listed here. "two-way" prepositions take accusative for direction and dative
 * for location; the meaning decides.
 */
const PREPOSITIONS: Record<string, { governs: Case[]; twoWay?: true; contractions?: string[] }> = {
	durch: { governs: ['accusative'], contractions: ['durchs'] },
	für: { governs: ['accusative'], contractions: ['fürs'] },
	gegen: { governs: ['accusative'] },
	ohne: { governs: ['accusative'] },
	um: { governs: ['accusative'], contractions: ['ums'] },
	bis: { governs: ['accusative'] },
	entlang: { governs: ['accusative'] },
	aus: { governs: ['dative'] },
	außer: { governs: ['dative'] },
	bei: { governs: ['dative'], contractions: ['beim'] },
	mit: { governs: ['dative'] },
	nach: { governs: ['dative'] },
	seit: { governs: ['dative'] },
	von: { governs: ['dative'], contractions: ['vom'] },
	zu: { governs: ['dative'], contractions: ['zum', 'zur'] },
	gegenüber: { governs: ['dative'] },
	ab: { governs: ['dative'] },
	an: { governs: ['accusative', 'dative'], twoWay: true, contractions: ['am', 'ans'] },
	auf: { governs: ['accusative', 'dative'], twoWay: true, contractions: ['aufs'] },
	hinter: { governs: ['accusative', 'dative'], twoWay: true },
	in: { governs: ['accusative', 'dative'], twoWay: true, contractions: ['im', 'ins'] },
	neben: { governs: ['accusative', 'dative'], twoWay: true },
	über: { governs: ['accusative', 'dative'], twoWay: true, contractions: ['übers'] },
	unter: { governs: ['accusative', 'dative'], twoWay: true },
	vor: { governs: ['accusative', 'dative'], twoWay: true, contractions: ['vors'] },
	zwischen: { governs: ['accusative', 'dative'], twoWay: true },
	wegen: { governs: ['genitive'] },
	trotz: { governs: ['genitive'] },
	während: { governs: ['genitive'] },
	statt: { governs: ['genitive'] },
	anstatt: { governs: ['genitive'] },
	innerhalb: { governs: ['genitive'] },
	außerhalb: { governs: ['genitive'] },
	aufgrund: { governs: ['genitive'] },
	dank: { governs: ['genitive', 'dative'] },
	laut: { governs: ['genitive', 'dative'] }
};
/** Form tags that describe the table, not a word form. */
const META_FORM_TAGS = new Set(['table-tags', 'inflection-template', 'class']);
const CASES: Case[] = ['accusative', 'dative', 'genitive'];
const MAX_EXAMPLES_PER_SENSE = 3;
const MAX_EXAMPLE_LENGTH = 160;

const hasTags = (tags: string[] | undefined, ...wanted: string[]) =>
	!!tags && wanted.every((t) => tags.includes(t));

const unique = <T>(values: T[]) => [...new Set(values)];

export function mapPartOfSpeech(entry: Pick<KaikkiEntry, 'pos' | 'word'>): PartOfSpeech | null {
	const pos = POS_MAP[entry.pos];
	if (!pos) return null;
	// Multi-word verbs such as "Bescheid sagen" are expressions in this app.
	if (pos === 'verb' && entry.word.includes(' ')) return 'expression';
	return pos;
}

/** True when every sense only points at another word (inflected form or spelling variant). */
export function isFormOfOnly(entry: KaikkiEntry): boolean {
	const senses = entry.senses ?? [];
	return senses.length > 0 && senses.every((s) => s.form_of?.length || s.alt_of?.length);
}

/** Lemmas an inflected-form entry points to, e.g. "fuhr" → ["fahren"]. */
export function formOfTargets(entry: KaikkiEntry): string[] {
	return unique(
		(entry.senses ?? [])
			.flatMap((s) => [...(s.form_of ?? []), ...(s.alt_of ?? [])])
			.map((f) => f.word)
	);
}

/** Forms from the entry's head line (not the inflection tables). */
function headForms(entry: KaikkiEntry) {
	return (entry.forms ?? []).filter(
		(f) => !f.source && !f.tags?.some((t) => META_FORM_TAGS.has(t))
	);
}

function headArg(entry: KaikkiEntry): string {
	return entry.head_templates?.find((h) => h.args?.['1'])?.args?.['1'] ?? '';
}

function senseTags(entry: KaikkiEntry): string[] {
	return unique((entry.senses ?? []).flatMap((s) => s.tags ?? []));
}

function parseVerb(entry: KaikkiEntry): VerbGrammar {
	const g: VerbGrammar = {};
	const forms = headForms(entry);
	const find = (...tags: string[]) =>
		forms.find((f) => hasTags(f.tags, ...tags) && !hasTags(f.tags, 'subjunctive'))?.form;

	g.thirdPersonPresent = find('present', 'third-person', 'singular');
	g.preterite = forms.find(
		(f) => hasTags(f.tags, 'past') && f.tags!.length === 1 // plain "past" = Präteritum
	)?.form;
	g.pastParticiple = find('participle', 'past');
	g.subjunctiveII = forms.find((f) => hasTags(f.tags, 'past', 'subjunctive'))?.form;

	const aux = forms
		.filter((f) => hasTags(f.tags, 'auxiliary'))
		.map((f) => f.form)
		.filter((f): f is 'haben' | 'sein' => f === 'haben' || f === 'sein');
	if (aux.length) g.auxiliaries = unique(aux);

	const imperative = (entry.forms ?? [])
		.filter((f) => f.source === 'conjugation' && hasTags(f.tags, 'imperative', 'singular'))
		.map((f) => f.form.replace(/!$/, ''));
	if (imperative.length) g.imperativeSingular = unique(imperative);

	const tags = senseTags(entry);
	if (tags.includes('irregular')) g.conjugation = 'irregular';
	else if (tags.includes('strong')) g.conjugation = 'strong';
	else if (tags.includes('mixed')) g.conjugation = 'mixed';
	else if (tags.includes('weak')) g.conjugation = 'weak';

	// Separable verbs are written "an.kommen<...>" in the head template.
	const arg = headArg(entry);
	const separable = /^([a-zäöü]+)\.([a-zäöüß]+)/.exec(arg);
	if (separable) {
		g.prefix = separable[1];
		g.prefixType = 'separable';
		g.baseVerb = separable[2];
	} else {
		const prefix = [...INSEPARABLE_PREFIXES, ...EITHER_PREFIXES].find(
			(p) => entry.word.startsWith(p) && entry.word.length > p.length + 3
		);
		if (prefix) {
			g.prefix = prefix;
			g.prefixType = 'inseparable';
			g.baseVerb = entry.word.slice(prefix.length);
		}
	}
	return g;
}

function parseNoun(entry: KaikkiEntry): NounGrammar {
	const g: NounGrammar = {};
	const tags = senseTags(entry);
	const genders = (['masculine', 'feminine', 'neuter'] as const)
		.filter((t) => tags.includes(t))
		.map((t) => t[0] as Gender);
	if (!genders.length) {
		const first = headArg(entry).split(/[,:.]/)[0];
		if (first === 'm' || first === 'f' || first === 'n') genders.push(first);
	}
	if (genders.length) g.genders = genders;

	const forms = headForms(entry);
	const plurals = forms
		.filter((f) => f.tags?.length === 1 && f.tags[0] === 'plural')
		.map((f) => f.form);
	const genitives = forms
		.filter((f) => f.tags?.length === 1 && f.tags[0] === 'genitive')
		.map((f) => f.form);
	// Some entries only have the declension table; read nominative plural / genitive singular there.
	const table = (entry.forms ?? []).filter(
		(f) => f.source === 'declension' && !hasTags(f.tags, 'rare')
	);
	if (!plurals.length)
		plurals.push(
			...table.filter((f) => hasTags(f.tags, 'nominative', 'plural')).map((f) => f.form)
		);
	if (!genitives.length)
		genitives.push(
			...table.filter((f) => hasTags(f.tags, 'genitive', 'singular')).map((f) => f.form)
		);
	if (plurals.length) g.plurals = unique(plurals);
	if (genitives.length) g.genitives = unique(genitives);

	// One plural-only sense (Apfel: "Äpfel", poetic for breasts) doesn't make the word
	// plural-only when the head line gives it a normal plural.
	const pluralOnlySense = (s: { tags?: string[] }) =>
		hasTags(s.tags, 'plural-only') || hasTags(s.tags, 'plural-normally');
	const senses = entry.senses ?? [];
	const headPlurals = forms.some((f) => f.tags?.length === 1 && f.tags[0] === 'plural');
	if (senses.some(pluralOnlySense) && (!headPlurals || senses.every(pluralOnlySense)))
		g.pluralOnly = true;
	else if (
		!plurals.length &&
		(tags.includes('no-plural') ||
			tags.includes('uncountable') ||
			tags.includes('singular-only') ||
			// The head line says it even when no sense is tagged: "Heimweh n (…, no plural)".
			entry.head_templates?.some((h) => h.expansion?.includes('no plural')))
	)
		g.noPlural = true;

	if (tags.includes('weak')) g.declension = 'weak';
	else if (tags.includes('mixed')) g.declension = 'mixed';

	if (entry.head_templates?.some((h) => h.args?.adj) || tags.includes('adjectival'))
		g.adjectival = true;
	return g;
}

function parseComparison(entry: KaikkiEntry): ComparisonGrammar {
	const g: ComparisonGrammar = {};
	const forms = headForms(entry);
	g.comparative = forms.find((f) => hasTags(f.tags, 'comparative'))?.form;
	g.superlative = forms.find((f) => hasTags(f.tags, 'superlative'))?.form;
	if (senseTags(entry).includes('not-comparable')) g.notComparable = true;
	return g;
}

function parseAdjective(entry: KaikkiEntry): AdjectiveGrammar {
	const g: AdjectiveGrammar = parseComparison(entry);
	const args = (entry.head_templates ?? []).map((h) => h.args?.['1'] ?? '');
	const tags = senseTags(entry);
	const stem = args
		.filter((a) => !a.includes('[rare]'))
		.map((a) => /(?:^|\.)stem:([^.:]+)/.exec(a)?.[1])
		.find(Boolean);
	if (stem && stem !== entry.word) g.declinedStem = stem;
	if (args.some((a) => a.split('.').includes('indecl')) || tags.includes('indeclinable'))
		g.neverDeclines = true;
	if (tags.includes('predicative-only') || tags.includes('predicative')) g.predicativeOnly = true;
	return g;
}

/** Reads "[with auf (+ accusative) ‘…’]" and "[with dative ‘…’]" notes from a raw gloss. */
function parseValency(
	raw: string
): Pick<ParsedSense['details'], 'objectCases' | 'prepositionalObjects'> {
	const out: Pick<ParsedSense['details'], 'objectCases' | 'prepositionalObjects'> = {};
	for (const m of raw.matchAll(/\[with ([^\]]+)\]/g)) {
		for (const part of m[1].split(/,| or | and /)) {
			const prep = /^\s*([a-zäöü]+) \(\+ (accusative|dative|genitive)\)/.exec(part);
			if (prep) {
				(out.prepositionalObjects ??= []).push({ preposition: prep[1], case: prep[2] as Case });
				continue;
			}
			const bareCase = /^\s*(accusative|dative|genitive)\b/.exec(part);
			if (bareCase) (out.objectCases ??= []).push(bareCase[1] as Case);
		}
	}
	return out;
}

function parseSense(sense: KaikkiSense, pos: PartOfSpeech): ParsedSense | null {
	if (sense.form_of?.length || sense.alt_of?.length) return null;
	const gloss = sense.glosses?.at(-1)?.trim();
	if (!gloss || /^Separated form of /.test(gloss)) return null;

	const tags = sense.tags ?? [];
	const raw = sense.raw_glosses?.at(-1) ?? '';
	const details: ParsedSense['details'] = {};
	if (tags.length) details.tags = tags;
	Object.assign(details, parseValency(raw));
	if (pos === 'preposition') {
		const governs = CASES.filter(
			(c) => tags.includes(`with-${c}`) || new RegExp(`\\+ ?${c}`).test(raw)
		);
		if (governs.length) details.governs = governs;
	}

	const examples = (sense.examples ?? [])
		.filter((e) => e.text && e.text.length <= MAX_EXAMPLE_LENGTH && e.type !== 'quotation')
		.slice(0, MAX_EXAMPLES_PER_SENSE)
		.map((e) => ({
			german: e.text!.trim(),
			english: (e.english ?? e.translation)?.trim() || null
		}));

	return { glosses: [gloss], details, examples };
}

/**
 * Parses one wiktextract line. Returns null for entries the app doesn't use
 * (names, pronouns, inflected-form entries, other languages).
 *
 * `occurrence` tells apart entries that share word, part of speech and etymology
 * number (der See / die See both have none); count them in source order with
 * `occurrenceCounter`.
 */
export function parseEntry(entry: KaikkiEntry, occurrence = 0): ParsedEntry | null {
	if (entry.lang_code && entry.lang_code !== 'de') return null;
	const pos = mapPartOfSpeech(entry);
	if (!pos || isFormOfOnly(entry)) return null;

	const senses = (entry.senses ?? [])
		.map((s) => parseSense(s, pos))
		.filter((s): s is ParsedSense => s !== null);
	if (!senses.length) return null;

	let grammar: Grammar = {};
	if (pos === 'verb') grammar = parseVerb(entry);
	else if (pos === 'noun') grammar = parseNoun(entry);
	else if (pos === 'adjective') grammar = parseAdjective(entry);
	else if (pos === 'adverb') grammar = parseComparison(entry);
	else if (pos === 'preposition' && PREPOSITIONS[entry.word])
		grammar = { ...PREPOSITIONS[entry.word] };
	// Postpositions follow their noun (meiner Meinung nach); they're filed as prepositions.
	if (entry.pos === 'postp') grammar = { ...grammar, postposition: true };

	const seen = new Set<string>();
	const forms: ParsedEntry['forms'] = [];
	for (const f of entry.forms ?? []) {
		const form = f.form.trim();
		if (!form || form === '-' || f.tags?.some((t) => META_FORM_TAGS.has(t))) continue;
		if (f.tags?.some((t) => t === 'alternative' || t === 'obsolete' || t === 'also')) continue;
		if (seen.has(form)) continue;
		seen.add(form);
		forms.push({ form, tags: f.tags ?? [] });
	}

	return {
		headword: entry.word,
		pos,
		sourceRef: `kaikki:${entry.word}|${entry.pos}|${entry.etymology_number ?? 0}|${occurrence}`,
		grammar: stripUndefined(grammar),
		senses,
		forms
	};
}

/** Returns a function giving each (word, pos, etymology) its 0-based occurrence number. */
export function occurrenceCounter(): (entry: KaikkiEntry) => number {
	const counts = new Map<string, number>();
	return (entry) => {
		const key = `${entry.word}|${entry.pos}|${entry.etymology_number ?? 0}`;
		const n = counts.get(key) ?? 0;
		counts.set(key, n + 1);
		return n;
	};
}

function stripUndefined<T extends object>(o: T): T {
	return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** kaikki.org path for one word's entries, e.g. "Bank" → "B/Ba/Bank". */
export function kaikkiWordPath(word: string): string {
	const chars = [...word];
	const enc = encodeURIComponent;
	return `${enc(chars[0])}/${enc(chars.slice(0, 2).join(''))}/${enc(word)}`;
}
