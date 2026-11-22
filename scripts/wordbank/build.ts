/**
 * Builds the A1–B2 word bank: the most frequent German lemmas, parsed from the
 * kaikki.org Wiktionary extract, with example sentences from Tatoeba.
 *
 * Runs offline (a laptop or CI), never on the host. Output: data/wordbank/wordbank.jsonl.gz
 * plus a manifest. Inputs are downloaded by scripts/wordbank/download.sh.
 *
 *   npx tsx scripts/wordbank/build.ts [--size 10000] [--in /path/to/downloads]
 */
import {
	createReadStream,
	createWriteStream,
	mkdirSync,
	readFileSync,
	writeFileSync
} from 'node:fs';
import { createInterface } from 'node:readline';
import { createGzip } from 'node:zlib';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
	formOfTargets,
	isFormOfOnly,
	mapPartOfSpeech,
	occurrenceCounter,
	parseEntry,
	type KaikkiEntry,
	type ParsedEntry,
	type VerbGrammar
} from '../../src/lib/server/dictionary/kaikki.js';
import { tokenize } from '../../src/lib/server/dictionary/tokenize.js';

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : fallback;
};
const SIZE = Number(opt('size', '10000'));
const IN = opt('in', 'data/downloads');
const OUT = opt('out', 'data/wordbank');
const KAIKKI = join(IN, 'kaikki.org-dictionary-German.jsonl');
const FREQUENCY = join(IN, 'de_50k.txt');
const TATOEBA_EXAMPLES_PER_WORD = 3;
/** Head-line "forms" that aren't inflections of the word (e.g. a verb's auxiliary "haben"). */
const SKIP_FORM_TAGS = new Set([
	'alternative',
	'auxiliary',
	'diminutive',
	'table-tags',
	'class',
	'abbreviation',
	'initialism',
	'acronym',
	'clipping',
	'symbol'
]);
/** A token that is an inflected form of more lemmas than this is too ambiguous to use. */
const MAX_LEMMAS_PER_FORM = 4;

export interface WordBankEntry extends ParsedEntry {
	frequencyRank: number;
	tatoeba: { german: string; english: string }[];
}

async function* lines(path: string): AsyncGenerator<string> {
	const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
	for await (const line of rl) if (line) yield line;
}

/** Streams a .bz2 file through the system bunzip2. */
async function* bz2Lines(path: string): AsyncGenerator<string> {
	const proc = spawn('bunzip2', ['-c', path]);
	const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
	for await (const line of rl) if (line) yield line;
}

const lower = (s: string) => s.toLocaleLowerCase('de');

function addTo(map: Map<string, Set<string>>, key: string, value: string) {
	let set = map.get(key);
	if (!set) map.set(key, (set = new Set()));
	set.add(value);
}

// ---------------------------------------------------------------------------
// Pass 1: index lemmas and inflected forms
// ---------------------------------------------------------------------------

async function indexDictionary() {
	/** lowercase spelling → lemma headwords (case preserved) */
	const lemmasByLower = new Map<string, Set<string>>();
	/** lowercase inflected form → lemma headwords */
	const lemmasByForm = new Map<string, Set<string>>();
	const verbs = new Set<string>();
	/** lowercase words whose own lowercase entry is a part of speech the app skips (ich, der, es) */
	const skippedLowercase = new Set<string>();
	/** lowercase-spelled lemmas → their parts of speech */
	const lowercasePos = new Map<string, Set<string>>();

	for await (const line of lines(KAIKKI)) {
		const entry = JSON.parse(line) as KaikkiEntry;
		if (entry.lang_code !== 'de') continue;
		if (isFormOfOnly(entry)) {
			// Abbreviations ("So" → Sonntag) aren't inflected forms of the word.
			const abbreviation = entry.senses?.some((s) => s.tags?.some((t) => SKIP_FORM_TAGS.has(t)));
			if (!abbreviation) {
				for (const target of formOfTargets(entry)) addTo(lemmasByForm, lower(entry.word), target);
			}
			continue;
		}
		const pos = mapPartOfSpeech(entry);
		if (!pos) {
			if (entry.word === lower(entry.word)) skippedLowercase.add(entry.word);
			continue;
		}
		addTo(lemmasByLower, lower(entry.word), entry.word);
		if (entry.word === lower(entry.word)) addTo(lowercasePos, entry.word, pos);
		if (pos === 'verb') verbs.add(entry.word);
		for (const f of entry.forms ?? []) {
			if (f.source || f.form.includes(' ')) continue;
			if (f.tags?.some((t) => SKIP_FORM_TAGS.has(t))) continue;
			addTo(lemmasByForm, lower(f.form), entry.word);
		}
	}
	return { lemmasByLower, lemmasByForm, verbs, skippedLowercase, lowercasePos };
}

// ---------------------------------------------------------------------------
// Frequency list → lemmas
// ---------------------------------------------------------------------------

const fromForms = (lemmas: Set<string> | undefined) =>
	lemmas && lemmas.size <= MAX_LEMMAS_PER_FORM ? [...lemmas] : [];

function selectLemmas(index: Awaited<ReturnType<typeof indexDictionary>>) {
	const selected = new Map<string, number>(); // headword → frequency rank
	const tokens = readFileSync(FREQUENCY, 'utf8').split('\n');
	let rank = 0;
	let unmatched = 0;
	for (const line of tokens) {
		const token = line.split(' ')[0];
		if (!token) continue;
		rank++;
		if ([...token].length < 2) continue;
		// The frequency list is lowercased, so "aber" also matches the noun "Aber". Keep a
		// capitalized match only when nothing lowercase claims the token ("haus" → Haus), or
		// when it nominalizes a verb ("essen" → Essen).
		const lowercaseClaimed =
			index.skippedLowercase.has(token) ||
			index.lowercasePos.has(token) ||
			index.lemmasByForm.has(token);
		const nominalizesVerb = index.lowercasePos.get(token)?.has('verb') ?? false;
		const exact = [...(index.lemmasByLower.get(token) ?? [])].filter(
			(w) => w === token || !lowercaseClaimed || nominalizesVerb
		);
		const viaForms = fromForms(index.lemmasByForm.get(token)).filter(
			// Same spelling in another case ("es" → "Es") was already decided above.
			(w) => index.lemmasByLower.has(lower(w)) && !w.includes(' ') && lower(w) !== token
		);
		// Skip gender-inclusive spellings ("Freund:in") and abbreviations ("Nr.").
		const candidates = new Set<string>([...exact, ...viaForms].filter((w) => !/[:.]/.test(w)));
		if (!candidates.size) unmatched++;
		for (const word of candidates) if (!selected.has(word)) selected.set(word, rank);
		if (selected.size >= SIZE) break;
	}
	return { selected, tokensUsed: rank, unmatched };
}

// ---------------------------------------------------------------------------
// Pass 2: parse the selected lemmas
// ---------------------------------------------------------------------------

async function parseSelected(selected: Map<string, number>, verbs: Set<string>) {
	const entries: WordBankEntry[] = [];
	const occurrence = occurrenceCounter();
	for await (const line of lines(KAIKKI)) {
		const entry = JSON.parse(line) as KaikkiEntry;
		if (entry.lang_code !== 'de') continue;
		const n = occurrence(entry);
		const rank = selected.get(entry.word);
		if (rank === undefined) continue;
		const parsed = parseEntry(entry, n);
		if (!parsed) continue;
		if (parsed.pos === 'verb') {
			const g = parsed.grammar as VerbGrammar;
			// Only keep a prefix split when the base is itself a verb (not "er|nten").
			if (g.baseVerb && !verbs.has(g.baseVerb)) {
				delete g.prefix;
				delete g.prefixType;
				delete g.baseVerb;
			}
		}
		entries.push({ ...parsed, frequencyRank: rank, tatoeba: [] });
	}
	return entries;
}

// ---------------------------------------------------------------------------
// Tatoeba examples
// ---------------------------------------------------------------------------

async function attachTatoeba(entries: WordBankEntry[]) {
	const english = new Map<number, string>();
	const links = new Map<number, number>(); // German id → one English id
	for await (const line of bz2Lines(join(IN, 'deu-eng_links.tsv.bz2'))) {
		const [de, en] = line.split('\t').map(Number);
		if (!links.has(de)) links.set(de, en);
	}
	const wantedEnglish = new Set(links.values());
	for await (const line of bz2Lines(join(IN, 'eng_sentences.tsv.bz2'))) {
		const [id, , text] = line.split('\t');
		if (wantedEnglish.has(Number(id))) english.set(Number(id), text);
	}

	// Map every form of every bank entry to the entries it belongs to.
	const byForm = new Map<string, WordBankEntry[]>();
	for (const e of entries) {
		if (e.pos === 'expression') continue;
		for (const form of new Set([e.headword, ...e.forms.map((f) => f.form)])) {
			if (form.includes(' ')) continue;
			const key = lower(form);
			const list = byForm.get(key) ?? [];
			if (!list.includes(e)) list.push(e);
			byForm.set(key, list);
		}
	}

	// Prefer short, plain sentences: 4–10 words, scored by length.
	const candidates = new Map<WordBankEntry, { german: string; english: string; score: number }[]>();
	for await (const line of bz2Lines(join(IN, 'deu_sentences.tsv.bz2'))) {
		const [id, , text] = line.split('\t');
		const en = english.get(links.get(Number(id)) ?? -1);
		if (!en) continue;
		const tokens = tokenize(text);
		if (tokens.length < 4 || tokens.length > 10) continue;
		const score = Math.abs(tokens.length - 7);
		for (const token of new Set(tokens.map(lower))) {
			for (const e of byForm.get(token) ?? []) {
				const list = candidates.get(e) ?? [];
				if (list.length < 40) list.push({ german: text, english: en, score });
				candidates.set(e, list);
			}
		}
	}
	for (const e of entries) {
		e.tatoeba = (candidates.get(e) ?? [])
			.sort((a, b) => a.score - b.score)
			.slice(0, TATOEBA_EXAMPLES_PER_WORD)
			.map(({ german, english }) => ({ german, english }));
	}
}

// ---------------------------------------------------------------------------

async function main() {
	const started = Date.now();
	const log = (msg: string) =>
		console.log(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${msg}`);

	log('Indexing dictionary…');
	const index = await indexDictionary();
	log(`${index.lemmasByLower.size} lemma spellings, ${index.lemmasByForm.size} forms`);

	const { selected, tokensUsed, unmatched } = selectLemmas(index);
	log(
		`${selected.size} lemmas from the top ${tokensUsed} frequency tokens (${unmatched} unmatched)`
	);

	log('Parsing selected entries…');
	const entries = await parseSelected(selected, index.verbs);
	entries.sort((a, b) => a.frequencyRank - b.frequencyRank);
	log(`${entries.length} entries`);

	log('Attaching Tatoeba examples…');
	await attachTatoeba(entries);

	mkdirSync(OUT, { recursive: true });
	await pipeline(
		Readable.from(entries.map((e) => JSON.stringify(e) + '\n')),
		createGzip({ level: 9 }),
		createWriteStream(join(OUT, 'wordbank.jsonl.gz'))
	);

	const count = (f: (e: WordBankEntry) => string): Record<string, number> => {
		const counts: Record<string, number> = {};
		for (const e of entries) counts[f(e)] = (counts[f(e)] ?? 0) + 1;
		return counts;
	};
	const manifest = {
		builtAt: new Date().toISOString(),
		lemmas: selected.size,
		entries: entries.length,
		frequencyTokensUsed: tokensUsed,
		byPartOfSpeech: count((e) => e.pos),
		senses: entries.reduce((n, e) => n + e.senses.length, 0),
		forms: entries.reduce((n, e) => n + e.forms.length, 0),
		dictionaryExamples: entries.reduce(
			(n, e) => n + e.senses.reduce((m, s) => m + s.examples.length, 0),
			0
		),
		tatoebaExamples: entries.reduce((n, e) => n + e.tatoeba.length, 0),
		entriesWithoutAnyExample: entries.filter(
			(e) => !e.tatoeba.length && !e.senses.some((s) => s.examples.length)
		).length,
		sources: {
			dictionary: 'English Wiktionary via kaikki.org (wiktextract), CC BY-SA 4.0',
			frequency: 'hermitdave/FrequencyWords, OpenSubtitles 2018 German top 50k, CC BY-SA 4.0',
			sentences: 'Tatoeba (tatoeba.org), CC BY 2.0 FR'
		}
	};
	writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, '\t') + '\n');
	log(`Done: ${JSON.stringify(manifest)}`);
}

await main();
