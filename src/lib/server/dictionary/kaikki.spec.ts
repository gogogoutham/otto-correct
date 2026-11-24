import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	isFormOfOnly,
	formOfTargets,
	kaikkiWordPath,
	occurrenceCounter,
	parseEntry,
	type KaikkiEntry,
	type ParsedEntry
} from './kaikki.js';

const raw: KaikkiEntry[] = readFileSync(new URL('./fixtures/sample.jsonl', import.meta.url), 'utf8')
	.split('\n')
	.filter(Boolean)
	.map((l) => JSON.parse(l) as KaikkiEntry);

const occurrence = occurrenceCounter();
const parsed = raw.map((e) => parseEntry(e, occurrence(e))).filter((p): p is ParsedEntry => !!p);
const find = (word: string, pos: string) =>
	parsed.filter((p) => p.headword === word && p.pos === pos);

describe('parseEntry', () => {
	it('keeps a normal plural when only one sense is plural-only', () => {
		const [apfel] = find('Apfel', 'noun');
		expect(apfel.grammar).toMatchObject({ genders: ['m'], plurals: ['Äpfel'] });
		expect(apfel.grammar).not.toHaveProperty('pluralOnly');
	});

	it('marks nouns Wiktionary lists with no plural', () => {
		const [heimweh] = find('Heimweh', 'noun');
		expect(heimweh.grammar).toMatchObject({ genders: ['n'], noPlural: true });
		expect(heimweh.grammar).not.toHaveProperty('plurals');
	});

	it('reads verb principal parts and auxiliaries', () => {
		const [fahren] = find('fahren', 'verb');
		expect(fahren.grammar).toMatchObject({
			thirdPersonPresent: 'fährt',
			preterite: 'fuhr',
			pastParticiple: 'gefahren',
			subjunctiveII: 'führe',
			auxiliaries: ['haben', 'sein'],
			conjugation: 'strong'
		});
	});

	it('marks separable prefixes and their base verb', () => {
		const [ankommen] = find('ankommen', 'verb');
		expect(ankommen.grammar).toMatchObject({
			prefix: 'an',
			prefixType: 'separable',
			baseVerb: 'kommen',
			auxiliaries: ['sein']
		});
	});

	it('keeps separable and inseparable übersetzen apart', () => {
		const entries = find('übersetzen', 'verb');
		expect(entries.map((e) => (e.grammar as { prefixType?: string }).prefixType).sort()).toEqual([
			'inseparable',
			'separable'
		]);
		expect(new Set(entries.map((e) => e.sourceRef)).size).toBe(2);
	});

	it('reads object case and prepositional objects from the gloss notes', () => {
		const [helfen] = find('helfen', 'verb');
		expect(helfen.senses[0].details.objectCases).toEqual(['dative']);
		const [ankommen] = find('ankommen', 'verb');
		expect(ankommen.senses[1].details.prepositionalObjects).toEqual([
			{ preposition: 'auf', case: 'accusative' }
		]);
	});

	it('splits homographs by plural (die Bank: Bänke / Banken)', () => {
		const banks = find('Bank', 'noun');
		expect(banks.map((b) => b.grammar)).toEqual([
			expect.objectContaining({ genders: ['f'], plurals: ['Bänke'] }),
			expect.objectContaining({ genders: ['f'], plurals: ['Banken'] })
		]);
	});

	it('gives same-etymology homographs distinct source refs (der See / die See)', () => {
		const sees = find('See', 'noun');
		expect(sees.map((s) => (s.grammar as { genders?: string[] }).genders)).toEqual([['m'], ['f']]);
		expect(sees[0].sourceRef).not.toBe(sees[1].sourceRef);
	});

	it('reads weak-noun declension and several plurals', () => {
		const [junge] = find('Junge', 'noun');
		expect(junge.grammar).toMatchObject({
			genders: ['m'],
			genitives: ['Jungen'],
			declension: 'weak'
		});
	});

	it('reads adjective stem changes and indeclinable adjectives', () => {
		expect(find('hoch', 'adjective')[0].grammar).toMatchObject({
			comparative: 'höher',
			superlative: 'am höchsten',
			declinedStem: 'hoh'
		});
		expect(find('lila', 'adjective')[0].grammar).toMatchObject({ neverDeclines: true });
		expect(find('lila', 'adjective')[0].grammar).not.toHaveProperty('declinedStem');
	});

	it('adds the case a preposition governs', () => {
		expect(find('nach', 'preposition')[0].grammar).toMatchObject({ governs: ['dative'] });
	});

	it('skips inflected-form entries and proper names', () => {
		expect(find('fuhr', 'verb')).toHaveLength(0);
		const fuhr = raw.find((e) => e.word === 'fuhr')!;
		expect(isFormOfOnly(fuhr)).toBe(true);
		expect(formOfTargets(fuhr)).toEqual(['fahren']);
		expect(parsed.some((p) => p.headword === 'See' && p.pos !== 'noun')).toBe(false);
	});
});

describe('kaikkiWordPath', () => {
	it('builds the per-word path, URL-encoding umlauts', () => {
		expect(kaikkiWordPath('Bank')).toBe('B/Ba/Bank');
		expect(kaikkiWordPath('übersetzen')).toBe('%C3%BC/%C3%BCb/%C3%BCbersetzen');
	});
});
