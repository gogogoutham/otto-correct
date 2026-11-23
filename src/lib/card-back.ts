/**
 * Grammar rules: what a card's German side shows. Only what must be memorized is shown:
 * irregular or unpredictable forms. Predictable forms are computed and hidden, and a fully
 * regular word is labelled "regular". Pure functions, shared by the server and the pages.
 */
import { defaultWordOrder, type Grammar, type PartOfSpeech, type WordOrder } from './grammar.js';

export interface BackLine {
	label: string;
	value: string;
}

export interface CardBack {
	/** The German headword as shown: article for nouns, "sich", separable bar (an|kommen). */
	title: string;
	/** Short labels, e.g. "regular", "n-declension", "separable". */
	labels: string[];
	lines: BackLine[];
	/** A full table for the few verbs whose present tense must be learned whole. */
	table?: { caption: string; rows: [string, string][] };
	/** Meaning-level grammar, e.g. "+ Dat", "auf + Akk". */
	usage: string[];
	/** What to recall, for the English → German front, e.g. "gender, plural, genitive". */
	recall: string[];
}

export interface WordInput {
	headword: string;
	pos: PartOfSpeech;
	grammar: Grammar;
}

const CASE_ABBR: Record<string, string> = {
	accusative: 'Akk',
	dative: 'Dat',
	genitive: 'Gen',
	nominative: 'Nom'
};
export const caseAbbr = (c: string) => CASE_ABBR[c] ?? c;

const str = (v: unknown): string | undefined =>
	typeof v === 'string' && v.trim() && v.trim() !== '-' ? v.trim() : undefined;
const list = (v: unknown): string[] =>
	Array.isArray(v) ? (v as unknown[]).map(str).filter((x): x is string => !!x) : [];

/** A gloss without its leading grammar note: "[with dative] in, inside" → "in, inside". */
export const cleanGloss = (gloss: string) => gloss.replace(/^\[[^\]]*\]\s*/, '');

/** Meaning-level usage: reflexive, object cases, prepositional objects, register. */
export function meaningUsage(g: Grammar): string[] {
	const out: string[] = [];
	for (const c of list(g.objectCases)) out.push(`+ ${caseAbbr(c)}`);
	for (const p of (g.prepositionalObjects as { preposition: string; case?: string }[]) ?? [])
		out.push(`${p.preposition}${p.case ? ` + ${caseAbbr(p.case)}` : ''}`);
	for (const c of list(g.governs)) out.push(`+ ${caseAbbr(c)}`);
	for (const r of list(g.register)) out.push(r);
	return out;
}

export function buildCardBack(word: WordInput, meaningGrammar: Grammar = {}): CardBack {
	const back = (() => {
		switch (word.pos) {
			case 'verb':
				return verbBack(word);
			case 'noun':
				return nounBack(word);
			case 'adjective':
				return adjectiveBack(word);
			case 'adverb':
				return adverbBack(word);
			case 'preposition':
				return prepositionBack(word, meaningGrammar);
			case 'conjunction':
				return conjunctionBack(word);
			default:
				return plain(word.headword);
		}
	})();
	if (meaningGrammar.reflexive === true && word.pos === 'verb') back.title = `sich ${back.title}`;
	// Prepositions show the case they govern as a line of their own.
	const usage = word.pos === 'preposition' ? meaningUsage({ ...meaningGrammar, governs: [] }) : [];
	back.usage = word.pos === 'preposition' ? usage : meaningUsage(meaningGrammar);
	if (back.usage.length && word.pos !== 'preposition') back.recall.push('usage');
	return back;
}

const plain = (title: string): CardBack => ({
	title,
	labels: [],
	lines: [],
	usage: [],
	recall: []
});

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

const SEPARABLE_PREFIXES = new Set(['an', 'auf', 'aus', 'ab', 'ein', 'mit', 'nach', 'vor', 'zu']);

/** Present tense of verbs learned as a whole table. Prefixed forms reuse the base table. */
export const IRREGULAR_PRESENT: Record<string, [string, string][]> = {
	sein: [
		['ich', 'bin'],
		['du', 'bist'],
		['er/sie/es', 'ist'],
		['wir', 'sind'],
		['ihr', 'seid'],
		['sie/Sie', 'sind']
	],
	haben: [
		['ich', 'habe'],
		['du', 'hast'],
		['er/sie/es', 'hat'],
		['wir', 'haben'],
		['ihr', 'habt'],
		['sie/Sie', 'haben']
	],
	werden: [
		['ich', 'werde'],
		['du', 'wirst'],
		['er/sie/es', 'wird'],
		['wir', 'werden'],
		['ihr', 'werdet'],
		['sie/Sie', 'werden']
	],
	wissen: [
		['ich', 'weiß'],
		['du', 'weißt'],
		['er/sie/es', 'weiß'],
		['wir', 'wissen'],
		['ihr', 'wisst'],
		['sie/Sie', 'wissen']
	],
	dürfen: modal('darf', 'dürf'),
	können: modal('kann', 'könn'),
	mögen: modal('mag', 'mög'),
	müssen: modal('muss', 'müss'),
	sollen: modal('soll', 'soll'),
	wollen: modal('will', 'woll')
};

function modal(singular: string, stem: string): [string, string][] {
	const du = singular.endsWith('ss') ? `${singular}t` : `${singular}st`;
	return [
		['ich', singular],
		['du', du],
		['er/sie/es', singular],
		['wir', `${stem}en`],
		['ihr', `${stem}t`],
		['sie/Sie', `${stem}en`]
	];
}

/** The verb without its prefix, for computing forms (ankommen → kommen). */
function splitPrefix(word: WordInput): { prefix: string; base: string; type?: string } {
	const g = word.grammar;
	const prefix = str(g.prefix) ?? '';
	const type = str(g.prefixType);
	const base =
		str(g.baseVerb) ??
		(prefix && word.headword.startsWith(prefix) ? word.headword.slice(prefix.length) : '');
	if (prefix && base && word.headword === prefix + base) return { prefix, base, type };
	return { prefix: '', base: word.headword, type: undefined };
}

/** Infinitive stem: kommen → komm, sammeln → sammel, tun → tu. */
export function verbStem(infinitive: string): string {
	if (/e[lr]n$/.test(infinitive)) return infinitive.slice(0, -1);
	if (infinitive.endsWith('en')) return infinitive.slice(0, -2);
	if (infinitive.endsWith('n')) return infinitive.slice(0, -1);
	return infinitive;
}

/** Stems that take a linking -e- (arbeit-e-t, öffn-e-t, red-e-te). */
const needsE = (stem: string) =>
	/[dt]$/.test(stem) || (/[mn]$/.test(stem) && /[^aeiouäöüylrmnh][mn]$/.test(stem));

/** Regular present: er/sie/es form from the stem. */
export function regularThirdPerson(infinitive: string): string {
	const stem = verbStem(infinitive);
	return needsE(stem) ? `${stem}et` : `${stem}t`;
}

/** ich form: komme, sammle, wandere. */
function firstPerson(infinitive: string): string {
	const table = IRREGULAR_PRESENT[infinitive];
	if (table) return table[0][1];
	const stem = verbStem(infinitive);
	if (stem.endsWith('el')) return `${stem.slice(0, -2)}le`;
	if (stem.endsWith('er')) return `${stem}e`;
	if (/[aeiouäöü]$/.test(stem)) return `${stem}e`.replace(/ee$/, 'e');
	return `${stem}e`;
}

/** The du-imperative forms that follow from the stem (fahr/fahre, sammle, öffne). */
function regularImperatives(infinitive: string): string[] {
	const stem = verbStem(infinitive);
	const forms = [stem, `${stem}e`];
	if (stem.endsWith('el')) forms.push(`${stem.slice(0, -2)}le`);
	if (stem.endsWith('er')) forms.push(`${stem.slice(0, -2)}re`);
	return forms;
}

const withPrefix = (form: string, prefix: string, separable: boolean) =>
	!prefix ? form : separable ? `${form} ${prefix}` : `${prefix}${form}`;

/** True for a weak verb whose every form follows from the infinitive. */
export function isRegularVerb(word: WordInput): boolean {
	const g = word.grammar;
	if (g.conjugation !== 'weak' && g.conjugation !== undefined) return false;
	const { prefix, base, type } = splitPrefix(word);
	const separable = type === 'separable';
	const stem = verbStem(base);
	const e = needsE(stem) ? 'e' : '';
	const noGe =
		(prefix && !separable) ||
		base.endsWith('ieren') ||
		/^(be|emp|ent|er|ge|miss|ver|zer)/.test(base);
	const preterite = withPrefix(`${stem}${e}te`, prefix, separable);
	const participle = `${prefix}${noGe ? '' : 'ge'}${stem}${e}t`;
	const third = withPrefix(regularThirdPerson(base), prefix, separable);
	return (
		(str(g.preterite) ?? preterite) === preterite &&
		(str(g.pastParticiple) ?? participle) === participle &&
		(str(g.thirdPersonPresent) ?? third) === third &&
		!!(str(g.preterite) || str(g.pastParticiple))
	);
}

const AUXILIARY_LABEL: Record<string, string> = { haben: 'hat', sein: 'ist' };

function verbBack(word: WordInput): CardBack {
	const g = word.grammar;
	const { prefix, base, type } = splitPrefix(word);
	const separable = type === 'separable';
	const back = plain(separable ? `${prefix}|${base}` : word.headword);
	const auxiliaries = list(g.auxiliaries);
	// Always "Perfekt: hat gemacht", so regular and irregular verbs read the same way.
	const perfect = `${auxiliaries.map((a) => AUXILIARY_LABEL[a] ?? a).join(' / ') || '?'} ${str(g.pastParticiple) ?? '…'}`;
	const table = IRREGULAR_PRESENT[base];
	const regular = !table && isRegularVerb(word);

	if (regular) {
		back.labels.push('regular');
		back.lines.push({ label: 'Perfekt', value: perfect });
		back.recall.push('auxiliary');
	} else {
		const third = str(g.thirdPersonPresent);
		const regularThird = withPrefix(regularThirdPerson(base), prefix, separable);
		if (!table && third && third !== regularThird)
			back.lines.push({ label: 'er/sie/es', value: third });
		const preterite = str(g.preterite);
		if (preterite) back.lines.push({ label: 'Präteritum', value: preterite });
		back.lines.push({ label: 'Perfekt', value: perfect });
		// Weak verbs' Konjunktiv II is the Präteritum, so only other verbs show it.
		const subjunctive = str(g.subjunctiveII);
		if (subjunctive && g.conjugation !== 'weak')
			back.lines.push({ label: 'Konjunktiv II', value: subjunctive });
		const imperatives = list(g.imperativeSingular);
		const regularImp = regularImperatives(base).map((f) => withPrefix(f, prefix, separable));
		if (imperatives.length && !imperatives.some((i) => regularImp.includes(i)))
			back.lines.push({ label: 'Imperativ (du)', value: `${imperatives[0]}!` });
		back.recall.push('principal parts', 'auxiliary');
	}

	if (table) {
		back.table = { caption: 'Präsens', rows: table };
		back.labels.push('irregular present');
		back.recall.push('present tense');
	}

	if (prefix && (type === 'separable' || type === 'inseparable')) {
		const participle = str(g.pastParticiple);
		const forms = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');
		if (separable) {
			back.labels.push('separable');
			back.lines.push({
				label: 'Split',
				value: forms(`Ich ${firstPerson(base)} ${prefix}.`, participle, `${prefix}zu${base}`)
			});
			back.recall.push('separable split');
		} else {
			back.labels.push('inseparable');
			back.lines.push({
				label: 'No split',
				value: forms(`Ich ${prefix}${firstPerson(base)}.`, participle, `zu ${word.headword}`)
			});
		}
	} else if (prefix && SEPARABLE_PREFIXES.has(prefix)) {
		back.labels.push('separable');
	}
	return back;
}

// ---------------------------------------------------------------------------
// Nouns
// ---------------------------------------------------------------------------

const ARTICLE: Record<string, string> = { m: 'der', f: 'die', n: 'das' };
const GENITIVE_ARTICLE: Record<string, string> = { m: 'des', f: 'der', n: 'des' };

/** Weak or mixed, derived from the genitive: des Jungen (weak), des Namens (mixed). */
export function nounDeclension(headword: string, g: Grammar): 'weak' | 'mixed' | null {
	const genders = list(g.genders);
	const genitive = list(g.genitives)[0];
	if (!genitive || genders.includes('f')) return null;
	// -ns on a word that doesn't end in -n: Name → Namens, Herz → Herzens (not Leben → Lebens).
	if (genitive.endsWith('ns') && !headword.endsWith('n')) return 'mixed';
	if (genitive.endsWith('n') && genitive !== headword) return 'weak';
	return null;
}

function nounBack(word: WordInput): CardBack {
	const g = word.grammar;
	const genders = list(g.genders);
	const article = genders.map((x) => ARTICLE[x] ?? x).join('/');
	const back = plain(article ? `${article} ${word.headword}` : word.headword);
	back.recall.push('gender');

	if (g.adjectival === true) {
		const stem = word.headword.replace(/e$/, '');
		const ein = genders.includes('f') ? 'eine' : 'ein';
		const ending = genders.includes('m') ? 'er' : genders.includes('n') ? 'es' : 'e';
		back.labels.push('declines like an adjective');
		back.lines.push({ label: 'Forms', value: `${back.title} · ${ein} ${stem}${ending}` });
	}

	if (g.pluralOnly === true) {
		back.labels.push('plural only');
		back.title = `die ${word.headword}`;
		back.recall = ['plural only'];
		return back;
	}
	if (g.noPlural === true) back.lines.push({ label: 'Plural', value: 'no plural' });
	else {
		const plurals = list(g.plurals);
		if (plurals.length)
			back.lines.push({
				label: 'Plural',
				value: `die ${plurals[0]}${plurals.length > 1 ? ` (also ${plurals.slice(1).join(', ')})` : ''}`
			});
	}
	back.recall.push('plural');

	// Feminine nouns never change in the genitive singular, so it is hidden for them.
	const genitives = list(g.genitives);
	const gender = genders[0];
	if (genitives.length && gender && gender !== 'f' && g.adjectival !== true) {
		back.lines.push({
			label: 'Genitive',
			value: `${GENITIVE_ARTICLE[gender]} ${genitives.join(' / ')}`
		});
		back.recall.push('genitive');
		const declension = nounDeclension(word.headword, g);
		if (declension === 'weak') back.labels.push('n-declension');
		if (declension === 'mixed') back.labels.push('mixed declension');
	}
	return back;
}

// ---------------------------------------------------------------------------
// Adjectives and adverbs
// ---------------------------------------------------------------------------

/** Regular comparative: schnell → schneller, dunkel → dunkler, teuer → teurer, leise → leiser. */
export function regularComparative(base: string): string {
	if (base.endsWith('e')) return `${base}r`;
	if (/el$/.test(base) || /[aeä]uer$/.test(base)) return `${base.slice(0, -2)}${base.slice(-1)}er`;
	return `${base}er`;
}

/** Regular superlative: am schnellsten, am kältesten-style -esten after d, t, s, ß, sch, x, z. */
export function regularSuperlative(base: string): string {
	return /([dtsßxz]|sch)$/.test(base) || /[aeiouäöü]$/.test(base)
		? `am ${base}esten`
		: `am ${base}sten`;
}

/** Stem used before an ending when it differs from the headword (hoch → hoh, dunkel → dunkl). */
export function declinedStem(base: string, g: Grammar): string | null {
	const given = str(g.declinedStem);
	if (given && !given.startsWith('-')) return given === base ? null : given;
	if (/el$/.test(base) || /[aeä]uer$/.test(base)) return `${base.slice(0, -2)}${base.slice(-1)}`;
	return null;
}

function comparisonLines(word: WordInput, back: CardBack) {
	const g = word.grammar;
	if (g.notComparable === true) return;
	const comparative = str(g.comparative);
	const superlative = str(g.superlative);
	const regular =
		(!comparative || comparative === regularComparative(word.headword)) &&
		(!superlative ||
			superlative === regularSuperlative(word.headword) ||
			// Some vowel-final adjectives take either: am neusten / am neuesten.
			superlative === `am ${word.headword}sten`);
	if (comparative && !regular) {
		back.lines.push({
			label: 'Comparison',
			value: [comparative, superlative].filter(Boolean).join(' · ')
		});
		back.recall.push('comparison');
	}
	return regular;
}

function adjectiveBack(word: WordInput): CardBack {
	const g = word.grammar;
	const back = plain(word.headword);
	const regular = comparisonLines(word, back);
	const stem = declinedStem(word.headword, g);
	if (stem && g.neverDeclines !== true) {
		back.lines.push({ label: 'Declined', value: `${stem}e (die ${stem}e …)` });
		back.recall.push('declined stem');
	}
	if (g.neverDeclines === true) back.labels.push('never declines');
	if (g.predicativeOnly === true) back.labels.push('predicative only');
	if (regular && !back.lines.length && !back.labels.length) back.labels.push('regular');
	return back;
}

function adverbBack(word: WordInput): CardBack {
	const back = plain(word.headword);
	comparisonLines(word, back);
	return back;
}

// ---------------------------------------------------------------------------
// Prepositions and conjunctions
// ---------------------------------------------------------------------------

function prepositionBack(word: WordInput, meaningGrammar: Grammar): CardBack {
	const g = word.grammar;
	const back = plain(word.headword);
	// The meaning's own case wins (in + Dat = location); otherwise the word's.
	const cases = list(meaningGrammar.governs).length
		? list(meaningGrammar.governs)
		: list(meaningGrammar.objectCases).length
			? list(meaningGrammar.objectCases)
			: list(g.governs);
	const twoWay = g.twoWay === true;
	const role = (c: string) =>
		!twoWay || cases.length > 1
			? ''
			: c === 'dative'
				? ' (location: wo?)'
				: c === 'accusative'
					? ' (direction: wohin?)'
					: '';
	if (cases.length) {
		back.lines.push({
			label: 'Case',
			value: cases.map((c) => `+ ${caseAbbr(c)}${role(c)}`).join(' / ')
		});
		back.recall.push('case');
	}
	if (twoWay) back.labels.push('two-way');
	if (twoWay && cases.length > 1)
		back.lines.push({ label: 'Two-way', value: 'Akk = direction (wohin?) · Dat = location (wo?)' });
	const contractions = list(g.contractions);
	if (contractions.length)
		back.lines.push({ label: 'Contractions', value: contractions.join(', ') });
	return back;
}

export const WORD_ORDER_TEXT: Record<WordOrder, string> = {
	coordinating: 'normal word order (…, und ich gehe)',
	subordinating: 'verb at the end (…, weil ich gehe)',
	adverbial: 'verb next (…, deshalb gehe ich)'
};

function conjunctionBack(word: WordInput): CardBack {
	const back = plain(word.headword);
	const order =
		(str(word.grammar.wordOrder) as WordOrder | undefined) ?? defaultWordOrder(word.headword);
	if (order) {
		back.lines.push({ label: 'Word order', value: WORD_ORDER_TEXT[order] });
		back.recall.push('word order');
	}
	return back;
}
