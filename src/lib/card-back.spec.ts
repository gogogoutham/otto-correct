import { describe, expect, it } from 'vitest';
import { buildCardBack, cleanGloss, type CardBack } from './card-back.js';
import type { Grammar, PartOfSpeech } from './grammar.js';

const back = (headword: string, pos: PartOfSpeech, grammar: Grammar, meaning: Grammar = {}) =>
	buildCardBack({ headword, pos, grammar }, meaning);
const lines = (b: CardBack) => Object.fromEntries(b.lines.map((l) => [l.label, l.value]));

// Grammar as stored in the word bank for these words.
const fahren = {
	preterite: 'fuhr',
	auxiliaries: ['haben', 'sein'],
	conjugation: 'strong',
	subjunctiveII: 'führe',
	pastParticiple: 'gefahren',
	imperativeSingular: ['fahr', 'fahre'],
	thirdPersonPresent: 'fährt'
};

describe('verbs', () => {
	it('shows only "regular" and the auxiliary for a regular weak verb', () => {
		for (const [verb, g] of [
			['machen', { preterite: 'machte', pastParticiple: 'gemacht', thirdPersonPresent: 'macht' }],
			[
				'arbeiten',
				{ preterite: 'arbeitete', pastParticiple: 'gearbeitet', thirdPersonPresent: 'arbeitet' }
			],
			[
				'öffnen',
				{ preterite: 'öffnete', pastParticiple: 'geöffnet', thirdPersonPresent: 'öffnet' }
			],
			[
				'studieren',
				{ preterite: 'studierte', pastParticiple: 'studiert', thirdPersonPresent: 'studiert' }
			],
			[
				'sammeln',
				{ preterite: 'sammelte', pastParticiple: 'gesammelt', thirdPersonPresent: 'sammelt' }
			]
		] as const) {
			const b = back(verb, 'verb', { ...g, conjugation: 'weak', auxiliaries: ['haben'] });
			expect(b.labels, verb).toEqual(['regular']);
			expect(Object.keys(lines(b)), verb).toEqual(['Perfekt']);
			expect(lines(b).Perfekt, verb).toBe(`hat ${g.pastParticiple}`);
		}
	});

	it('shows a strong verb’s stem change, principal parts and Konjunktiv II, not a regular imperative', () => {
		const l = lines(back('fahren', 'verb', fahren));
		expect(l).toEqual({
			'er/sie/es': 'fährt',
			Präteritum: 'fuhr',
			Perfekt: 'hat / ist gefahren',
			'Konjunktiv II': 'führe'
		});
	});

	it('shows an irregular du-imperative', () => {
		const l = lines(
			back('lesen', 'verb', {
				preterite: 'las',
				pastParticiple: 'gelesen',
				thirdPersonPresent: 'liest',
				imperativeSingular: ['lies'],
				auxiliaries: ['haben'],
				conjugation: 'strong'
			})
		);
		expect(l['Imperativ (du)']).toBe('lies!');
		expect(l['er/sie/es']).toBe('liest');
	});

	it('hides the 3rd person when the stem does not change', () => {
		const l = lines(
			back('kommen', 'verb', {
				preterite: 'kam',
				pastParticiple: 'gekommen',
				thirdPersonPresent: 'kommt',
				auxiliaries: ['sein'],
				conjugation: 'strong'
			})
		);
		expect(l['er/sie/es']).toBeUndefined();
		expect(l.Perfekt).toBe('ist gekommen');
	});

	it('computes the separable split', () => {
		const b = back('ankommen', 'verb', {
			prefix: 'an',
			baseVerb: 'kommen',
			prefixType: 'separable',
			preterite: 'kam an',
			pastParticiple: 'angekommen',
			thirdPersonPresent: 'kommt an',
			auxiliaries: ['sein'],
			conjugation: 'strong'
		});
		expect(b.title).toBe('an|kommen');
		expect(b.labels).toContain('separable');
		expect(lines(b).Split).toBe('Ich komme an. · angekommen · anzukommen');
	});

	it('tells the two übersetzen apart', () => {
		const insep = back('übersetzen', 'verb', {
			prefix: 'über',
			baseVerb: 'setzen',
			prefixType: 'inseparable',
			preterite: 'übersetzte',
			pastParticiple: 'übersetzt',
			thirdPersonPresent: 'übersetzt',
			auxiliaries: ['haben'],
			conjugation: 'weak'
		});
		const sep = back('übersetzen', 'verb', {
			prefix: 'über',
			baseVerb: 'setzen',
			prefixType: 'separable',
			preterite: 'setzte über',
			pastParticiple: 'übergesetzt',
			thirdPersonPresent: 'setzt über',
			auxiliaries: ['sein', 'haben'],
			conjugation: 'weak'
		});
		expect(insep.title).toBe('übersetzen');
		expect(lines(insep)['No split']).toBe('Ich übersetze. · übersetzt · zu übersetzen');
		expect(sep.title).toBe('über|setzen');
		expect(lines(sep).Split).toBe('Ich setze über. · übergesetzt · überzusetzen');
		expect(sep.labels).toEqual(['regular', 'separable']);
	});

	it('shows the full present table for sein and modals', () => {
		const b = back('können', 'verb', {
			preterite: 'konnte',
			pastParticiple: 'gekonnt',
			subjunctiveII: 'könnte',
			thirdPersonPresent: 'kann',
			auxiliaries: ['haben']
		});
		expect(b.table?.rows[0]).toEqual(['ich', 'kann']);
		expect(b.table?.rows[1]).toEqual(['du', 'kannst']);
		expect(lines(b)['Konjunktiv II']).toBe('könnte');
		expect(back('sein', 'verb', { preterite: 'war' }).table?.rows[0]).toEqual(['ich', 'bin']);
	});

	it('adds meaning-level grammar: reflexive, object case, prepositional object', () => {
		const b = back(
			'freuen',
			'verb',
			{ preterite: 'freute', pastParticiple: 'gefreut', conjugation: 'weak' },
			{ reflexive: true, prepositionalObjects: [{ preposition: 'auf', case: 'accusative' }] }
		);
		expect(b.title).toBe('sich freuen');
		expect(b.usage).toEqual(['auf + Akk']);
		expect(back('helfen', 'verb', fahren, { objectCases: ['dative'] }).usage).toEqual(['+ Dat']);
	});
});

describe('nouns', () => {
	it('shows gender, plural and genitive', () => {
		const b = back('Hund', 'noun', {
			genders: ['m'],
			plurals: ['Hunde'],
			genitives: ['Hundes', 'Hunds']
		});
		expect(b.title).toBe('der Hund');
		expect(lines(b)).toEqual({ Plural: 'die Hunde', Genitive: 'des Hundes / Hunds' });
		expect(b.recall).toEqual(['gender', 'plural', 'genitive']);
	});

	it('hides the predictable feminine genitive', () => {
		const b = back('Frau', 'noun', { genders: ['f'], plurals: ['Frauen'], genitives: ['Frau'] });
		expect(lines(b)).toEqual({ Plural: 'die Frauen' });
	});

	it('labels weak and mixed nouns from the genitive', () => {
		expect(
			back('Junge', 'noun', { genders: ['m'], plurals: ['Jungen'], genitives: ['Jungen'] }).labels
		).toEqual(['n-declension']);
		expect(
			back('Name', 'noun', { genders: ['m'], plurals: ['Namen'], genitives: ['Namens'] }).labels
		).toEqual(['mixed declension']);
		expect(
			back('Herz', 'noun', { genders: ['n'], plurals: ['Herzen'], genitives: ['Herzens'] }).labels
		).toEqual(['mixed declension']);
		expect(
			back('Mann', 'noun', {
				genders: ['m'],
				plurals: ['Männer'],
				genitives: ['Mannes'],
				declension: 'mixed'
			}).labels
		).toEqual([]);
	});

	it('handles no plural, plural only and adjectival nouns', () => {
		expect(lines(back('Milch', 'noun', { genders: ['f'], noPlural: true })).Plural).toBe(
			'no plural'
		);
		const eltern = back('Eltern', 'noun', { pluralOnly: true, plurals: ['Eltern'] });
		expect(eltern.title).toBe('die Eltern');
		expect(eltern.labels).toEqual(['plural only']);
		const deutsche = back('Deutsche', 'noun', { genders: ['m'], adjectival: true });
		expect(lines(deutsche).Forms).toBe('der Deutsche · ein Deutscher');
	});
});

describe('adjectives and adverbs', () => {
	it('hides regular comparison and labels the word regular', () => {
		const b = back('schnell', 'adjective', {
			comparative: 'schneller',
			superlative: 'am schnellsten'
		});
		expect(b.lines).toEqual([]);
		expect(b.labels).toEqual(['regular']);
	});

	it('shows irregular or umlauted comparison', () => {
		expect(
			lines(back('gut', 'adjective', { comparative: 'besser', superlative: 'am besten' }))
				.Comparison
		).toBe('besser · am besten');
		expect(
			lines(back('alt', 'adjective', { comparative: 'älter', superlative: 'am ältesten' }))
				.Comparison
		).toBe('älter · am ältesten');
		expect(
			lines(back('gern', 'adverb', { comparative: 'lieber', superlative: 'am liebsten' }))
				.Comparison
		).toBe('lieber · am liebsten');
	});

	it('shows the declined stem: hoch → hohe, dunkel → dunkle, teuer → teure', () => {
		expect(lines(back('hoch', 'adjective', { declinedStem: 'hoh' })).Declined).toMatch(/^hohe/);
		const dunkel = back('dunkel', 'adjective', {
			comparative: 'dunkler',
			superlative: 'am dunkelsten',
			declinedStem: '-e'
		});
		expect(lines(dunkel)).toEqual({ Declined: 'dunkle (die dunkle …)' });
		expect(lines(back('teuer', 'adjective', { declinedStem: '-e' })).Declined).toMatch(/^teure/);
	});

	it('labels never-declining and predicative-only adjectives', () => {
		expect(back('lila', 'adjective', { neverDeclines: true, notComparable: true }).labels).toEqual([
			'never declines'
		]);
		expect(
			back('egal', 'adjective', { neverDeclines: true, predicativeOnly: true }).labels
		).toEqual(['never declines', 'predicative only']);
	});
});

describe('prepositions and conjunctions', () => {
	const inGrammar = {
		twoWay: true,
		governs: ['accusative', 'dative'],
		contractions: ['im', 'ins']
	};

	it('shows the case this meaning takes, and contractions', () => {
		const location = back('in', 'preposition', inGrammar, { governs: ['dative'] });
		expect(lines(location)).toEqual({
			Case: '+ Dat (location: wo?)',
			Contractions: 'im, ins'
		});
		expect(lines(back('in', 'preposition', inGrammar)).Case).toBe('+ Akk / + Dat');
		expect(lines(back('wegen', 'preposition', { governs: ['genitive'] })).Case).toBe('+ Gen');
	});

	it('shows word order for conjunctions', () => {
		expect(lines(back('weil', 'conjunction', {}))['Word order']).toMatch(/verb at the end/);
		expect(lines(back('und', 'conjunction', {}))['Word order']).toMatch(/normal/);
		expect(
			lines(back('sondern', 'conjunction', { wordOrder: 'subordinating' }))['Word order']
		).toMatch(/verb at the end/);
	});

	it('strips the grammar note from a gloss', () => {
		expect(cleanGloss('[with dative] in, inside')).toBe('in, inside');
		expect(cleanGloss('to drive')).toBe('to drive');
	});
});

describe('word summaries', () => {
	it('shows the superlative once, with "am"', async () => {
		const { grammarSummary } = await import('./grammar.js');
		expect(
			grammarSummary('adjective', { comparative: 'teurer', superlative: 'am teuersten' })
		).toBe('teurer · am teuersten');
		expect(grammarSummary('conjunction', {}, 'denn')).toBe('normal word order');
	});
});

describe('postpositions', () => {
	it('labels a postposition and says it follows its noun', () => {
		const b = buildCardBack(
			{
				headword: 'nach',
				pos: 'preposition',
				grammar: { postposition: true, governs: ['dative'] }
			},
			{}
		);
		expect(b.labels).toContain('postposition');
		expect(b.lines).toContainEqual({
			label: 'Position',
			value: 'after its noun (meiner Meinung nach)'
		});
	});
});
