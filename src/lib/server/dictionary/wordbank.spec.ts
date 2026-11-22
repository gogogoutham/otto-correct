/**
 * Checks the built word bank (data/wordbank/wordbank.jsonl.gz) against a fixed test list:
 * the starter contrast groups, the starter prefix-meaning verbs, and words whose grammar
 * the card back depends on. Rebuild with `npm run wordbank:build` if this fails after a
 * parser change.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ParsedEntry } from './kaikki.js';

type Entry = ParsedEntry & {
	frequencyRank: number;
	tatoeba: { german: string; english: string }[];
};

const entries: Entry[] = gunzipSync(readFileSync('data/wordbank/wordbank.jsonl.gz'))
	.toString('utf8')
	.split('\n')
	.filter(Boolean)
	.map((l) => JSON.parse(l) as Entry);
const byWord = new Map<string, Entry[]>();
for (const e of entries) byWord.set(e.headword, [...(byWord.get(e.headword) ?? []), e]);
const get = (word: string, pos: string) => byWord.get(word)?.filter((e) => e.pos === pos) ?? [];

/** Starter contrast-group members and prefix-meaning example verbs from the requirements. */
const TEST_LIST = `
nach zu in an auf bei aus von für seit als wenn wann ob falls aber sondern nachdem danach vor
bevor vorher wissen kennen können legen stellen setzen hängen stecken fragen bitten lernen
erfahren leben wohnen ausgeben verbringen beantworten bewohnen beleuchten entfernen entkommen
entdecken entstehen erreichen ertrinken erschießen verlaufen verwechseln verändern verbessern
verbrauchen zerbrechen zerstören missverstehen empfehlen gehören anfangen anschalten ankommen
ansehen aufmachen aufstehen aufessen ausgehen austrinken ausschlafen ausschalten abfahren abnehmen
absagen einsteigen einladen mitkommen mitbringen nachmachen nachdenken vorbereiten vorstellen
zumachen zuhören übersetzen umsteigen durchfallen umarmen durchsuchen doch schon mal Bank See
Junge Name Herz gut hoch gern oft lila rosa egal schuld stolz fähig weil dass deshalb trotzdem
und entweder sein haben werden fahren geben lesen sehen helfen warten freuen Arzt Schule Kino
Meer Grenze Insel Party`
	.split(/\s+/)
	.filter(Boolean);

/** Rare in film subtitles, so outside the bank; the on-demand fetch covers them. */
const KNOWN_GAPS = ['erarbeiten', 'misslingen', 'nachschlagen'];

describe('word bank', () => {
	it('has about 10,000 lemmas', () => {
		expect(byWord.size).toBeGreaterThanOrEqual(9900);
	});

	it('contains every word on the test list', () => {
		expect(TEST_LIST.filter((w) => !byWord.has(w))).toEqual([]);
		expect(KNOWN_GAPS.filter((w) => byWord.has(w))).toEqual([]);
	});

	it('has irregular verb forms', () => {
		expect(get('sein', 'verb')[0].grammar).toMatchObject({
			thirdPersonPresent: 'ist',
			preterite: 'war',
			pastParticiple: 'gewesen',
			subjunctiveII: 'wäre',
			conjugation: 'irregular'
		});
		expect(get('lesen', 'verb')[0].grammar).toMatchObject({ imperativeSingular: ['lies'] });
		expect(get('geben', 'verb')[0].grammar).toMatchObject({ imperativeSingular: ['gib'] });
		expect(get('wissen', 'verb')[0].grammar).toMatchObject({ thirdPersonPresent: 'weiß' });
	});

	it('splits transitive and intransitive hängen', () => {
		expect(
			get('hängen', 'verb').map((e) => (e.grammar as { preterite?: string }).preterite)
		).toEqual(expect.arrayContaining(['hing', 'hängte']));
	});

	it('has prefix data for separable and inseparable verbs', () => {
		expect(get('aufmachen', 'verb')[0].grammar).toMatchObject({
			prefix: 'auf',
			prefixType: 'separable',
			baseVerb: 'machen'
		});
		expect(get('verbessern', 'verb')[0].grammar).toMatchObject({
			prefix: 'ver',
			prefixType: 'inseparable'
		});
	});

	it('has prepositional objects on meanings', () => {
		const warten = get('warten', 'verb')[0];
		expect(warten.senses[0].details.prepositionalObjects).toEqual([
			{ preposition: 'auf', case: 'accusative' }
		]);
		expect(get('stolz', 'adjective')[0].senses[0].details.prepositionalObjects).toEqual([
			{ preposition: 'auf', case: 'accusative' }
		]);
	});

	it('has noun gender, plural and genitive, including mixed nouns', () => {
		expect(get('Herz', 'noun')[0].grammar).toMatchObject({
			genders: ['n'],
			plurals: ['Herzen'],
			genitives: ['Herzens']
		});
		expect(get('Name', 'noun')[0].grammar).toMatchObject({ genitives: ['Namens'] });
		expect(get('See', 'noun').map((e) => (e.grammar as { genders?: string[] }).genders)).toEqual([
			['m'],
			['f']
		]);
	});

	it('has the case each common preposition governs', () => {
		for (const [word, cases] of [
			['mit', ['dative']],
			['für', ['accusative']],
			['in', ['accusative', 'dative']],
			['wegen', ['genitive']]
		] as const) {
			expect(get(word, 'preposition')[0].grammar).toMatchObject({ governs: cases });
		}
	});

	it('gives most entries at least one example sentence', () => {
		const withExample = entries.filter(
			(e) => e.tatoeba.length || e.senses.some((s) => s.examples.length)
		);
		expect(withExample.length / entries.length).toBeGreaterThan(0.95);
	});
});
