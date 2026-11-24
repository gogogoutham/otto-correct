/**
 * The starter set: 15 contrast groups and the common verb-prefix meanings, drafted with
 * AI help and reviewed by hand. Loading it adds nothing to the deck: every member comes
 * in as "not in deck" and stays greyed out until it is added.
 *
 * Members point at word-bank entries by headword and part of speech. `sense` picks the
 * dictionary sense whose gloss matches it (first sense if none does); `gloss` replaces the
 * dictionary gloss where Wiktionary words it poorly for this use.
 */
import type { PartOfSpeech } from '#lib/grammar.js';

type Case = 'accusative' | 'dative' | 'genitive';

export interface StarterMember {
	de: string;
	pos: PartOfSpeech;
	/** Regex (case-insensitive) matched against the sense's glosses. */
	sense?: string;
	/** For homographs that differ by prefix type, e.g. übersetzen. */
	prefixType?: 'separable' | 'inseparable';
	gloss?: string;
	governs?: Case[];
	/** Not in the word bank: created by hand with this gloss. */
	manual?: true;
	rule?: string;
	example?: string;
}

export interface StarterGroup {
	key: string;
	label: string;
	note?: string;
	related?: string[];
	members: StarterMember[];
}

export interface StarterPrefixMeaning {
	key: string;
	prefix: string;
	label: string;
	note?: string;
	verbs: StarterMember[];
}

export const STARTER_GROUPS: StarterGroup[] = [
	{
		key: 'to-a-place',
		label: 'to (a place)',
		related: ['at-a-place', 'from-a-place'],
		members: [
			{
				de: 'nach',
				pos: 'preposition',
				sense: 'to, towards',
				gloss: 'to (cities, countries)',
				governs: ['dative'],
				rule: 'Cities, countries without an article, nach Hause',
				example: 'nach Berlin, nach Hause'
			},
			{
				de: 'zu',
				pos: 'preposition',
				sense: 'to, towards',
				gloss: 'to (people, businesses)',
				governs: ['dative'],
				rule: 'People, businesses, general destinations',
				example: 'zum Arzt, zur Schule'
			},
			{
				de: 'in',
				pos: 'preposition',
				sense: 'into, to',
				gloss: 'into, to (enclosed spaces)',
				governs: ['accusative'],
				rule: 'Into enclosed spaces; countries with an article',
				example: 'ins Kino, in die Schweiz'
			},
			{
				de: 'an',
				pos: 'preposition',
				sense: 'on, onto',
				gloss: 'to (the edge of: water, a border, a wall)',
				governs: ['accusative'],
				rule: 'To an edge: water, borders, walls',
				example: 'ans Meer, an die Grenze'
			},
			{
				de: 'auf',
				pos: 'preposition',
				sense: 'to; used with certain nouns',
				gloss: 'to (open places, islands, events)',
				governs: ['accusative'],
				rule: 'Open surfaces, islands, events, some public buildings',
				example: 'auf die Insel, auf eine Party'
			}
		]
	},
	{
		key: 'at-a-place',
		label: 'at / in (a place)',
		related: ['to-a-place', 'from-a-place'],
		members: [
			{
				de: 'in',
				pos: 'preposition',
				sense: 'inside a building',
				gloss: 'in, at (inside)',
				governs: ['dative'],
				rule: 'Inside enclosed spaces; countries with an article',
				example: 'im Kino, in der Schweiz'
			},
			{
				de: 'bei',
				pos: 'preposition',
				sense: '^at$',
				gloss: "at (someone's place)",
				governs: ['dative'],
				rule: "At someone's home or business, at a company",
				example: 'bei meinen Eltern, beim Arzt'
			},
			{
				de: 'an',
				pos: 'preposition',
				sense: 'by, near',
				gloss: 'at, by (the edge of)',
				governs: ['dative'],
				rule: 'At an edge: water, borders, walls',
				example: 'am Meer, an der Wand'
			},
			{
				de: 'auf',
				pos: 'preposition',
				sense: 'in, at; used with certain nouns',
				gloss: 'at, on (open places, events)',
				governs: ['dative'],
				rule: 'On open surfaces, islands, at events, some public buildings',
				example: 'auf der Insel, auf der Post'
			},
			{
				de: 'zu Hause',
				pos: 'expression',
				manual: true,
				gloss: 'at home',
				rule: 'At home (where you are, not where you go)',
				example: 'Ich bin zu Hause.'
			}
		]
	},
	{
		key: 'from-a-place',
		label: 'from (a place)',
		related: ['to-a-place', 'at-a-place'],
		members: [
			{
				de: 'aus',
				pos: 'preposition',
				sense: 'from \\(a place',
				gloss: 'from, out of (a place)',
				governs: ['dative'],
				rule: 'Out of an enclosed space; where you come from (cities, countries)',
				example: 'aus dem Haus, aus Berlin'
			},
			{
				de: 'von',
				pos: 'preposition',
				sense: '^from$',
				governs: ['dative'],
				rule: 'From people, open places, a starting point',
				example: 'vom Arzt, von der Arbeit'
			}
		]
	},
	{
		key: 'for-time',
		label: 'for (time)',
		members: [
			{
				de: 'für',
				pos: 'preposition',
				sense: 'certain duration',
				gloss: 'for (a period of time)',
				governs: ['accusative'],
				rule: 'A span that is planned, still to come, or complete',
				example: 'für zwei Wochen'
			},
			{
				de: 'seit',
				pos: 'preposition',
				sense: 'past period',
				governs: ['dative'],
				rule: 'Started in the past and still going (present tense in German)',
				example: 'Ich wohne seit zwei Jahren hier.'
			}
		]
	},
	{
		key: 'when',
		label: 'when',
		related: ['if'],
		members: [
			{
				de: 'als',
				pos: 'conjunction',
				sense: 'same moment',
				gloss: 'when (once, in the past)',
				rule: 'A single event or period in the past',
				example: 'Als ich jung war, wohnte ich in Wien.'
			},
			{
				de: 'wenn',
				pos: 'conjunction',
				sense: 'whenever',
				rule: 'Present or future; or every time, also in the past',
				example: 'Wenn ich Zeit habe, lese ich.'
			},
			{
				de: 'wann',
				pos: 'adverb',
				sense: '^when$',
				gloss: 'when (in questions)',
				rule: 'Questions, direct or indirect',
				example: 'Wann kommst du? Ich weiß nicht, wann er kommt.'
			}
		]
	},
	{
		key: 'if',
		label: 'if',
		related: ['when'],
		members: [
			{
				de: 'wenn',
				pos: 'conjunction',
				sense: 'on the condition',
				rule: 'A condition',
				example: 'Wenn es regnet, bleiben wir zu Hause.'
			},
			{
				de: 'ob',
				pos: 'conjunction',
				sense: 'whether',
				gloss: 'if, whether',
				rule: 'Indirect yes/no questions (whether)',
				example: 'Ich weiß nicht, ob er kommt.'
			},
			{
				de: 'falls',
				pos: 'conjunction',
				sense: 'in the event',
				rule: 'In case; a condition that may well not happen',
				example: 'Falls du Hilfe brauchst, ruf mich an.'
			}
		]
	},
	{
		key: 'but',
		label: 'but',
		members: [
			{
				de: 'aber',
				pos: 'conjunction',
				sense: 'but',
				rule: 'A contrast where both parts stay true',
				example: 'Das Hotel ist alt, aber schön.'
			},
			{
				de: 'sondern',
				pos: 'conjunction',
				sense: 'rather',
				gloss: 'but (rather)',
				rule: 'After a negative: replaces what was denied',
				example: 'nicht heute, sondern morgen'
			}
		]
	},
	{
		key: 'after',
		label: 'after',
		related: ['before'],
		members: [
			{
				de: 'nach',
				pos: 'preposition',
				sense: 'after, past',
				governs: ['dative'],
				rule: 'Before a noun',
				example: 'nach dem Essen'
			},
			{
				de: 'nachdem',
				pos: 'conjunction',
				sense: 'after',
				rule: 'Before a clause; verb at the end, usually with an earlier tense',
				example: 'Nachdem er gegessen hatte, ging er.'
			},
			{
				de: 'danach',
				pos: 'adverb',
				sense: 'afterwards',
				rule: 'On its own: afterwards',
				example: 'Danach gehen wir ins Kino.'
			}
		]
	},
	{
		key: 'before',
		label: 'before',
		related: ['after'],
		members: [
			{
				de: 'vor',
				pos: 'preposition',
				sense: 'before, prior to',
				governs: ['dative'],
				rule: 'Before a noun',
				example: 'vor dem Essen'
			},
			{
				de: 'bevor',
				pos: 'conjunction',
				sense: 'before',
				rule: 'Before a clause; verb at the end',
				example: 'Bevor du gehst, ruf mich an.'
			},
			{
				de: 'vorher',
				pos: 'adverb',
				sense: 'beforehand',
				rule: 'On its own: beforehand',
				example: 'Ruf mich vorher an.'
			}
		]
	},
	{
		key: 'to-know',
		label: 'to know',
		members: [
			{
				de: 'wissen',
				pos: 'verb',
				sense: 'aware of',
				rule: 'Facts and information, often with dass, ob or a question word',
				example: 'Ich weiß, dass er kommt.'
			},
			{
				de: 'kennen',
				pos: 'verb',
				sense: 'acquainted',
				rule: 'People, places and things you are familiar with',
				example: 'Ich kenne Berlin gut.'
			},
			{
				de: 'können',
				pos: 'verb',
				sense: 'know how to',
				gloss: 'to know (a language, a skill)',
				rule: 'Languages and skills',
				example: 'Sie kann Deutsch.'
			}
		]
	},
	{
		key: 'to-put',
		label: 'to put',
		note: 'Each has a matching verb for where something is: liegen, stehen, sitzen, hängen, stecken.',
		members: [
			{
				de: 'legen',
				pos: 'verb',
				gloss: 'to lay, to put (flat)',
				rule: 'Lying flat',
				example: 'Ich lege das Buch auf den Tisch.'
			},
			{
				de: 'stellen',
				pos: 'verb',
				gloss: 'to put, to stand (upright)',
				rule: 'Standing upright',
				example: 'Ich stelle die Flasche auf den Tisch.'
			},
			{
				de: 'setzen',
				pos: 'verb',
				gloss: 'to set, to seat (sitting)',
				rule: 'Into a sitting position',
				example: 'Ich setze das Kind auf den Stuhl.'
			},
			{
				de: 'hängen',
				pos: 'verb',
				sense: 'to hang, to suspend',
				gloss: 'to hang (something up)',
				rule: 'Hanging (weak: hängte, gehängt)',
				example: 'Ich hänge das Bild an die Wand.'
			},
			{
				de: 'stecken',
				pos: 'verb',
				gloss: 'to put (into), to insert',
				rule: 'Into something: a slot, pocket or lock',
				example: 'Ich stecke den Schlüssel ins Schloss.'
			}
		]
	},
	{
		key: 'to-ask',
		label: 'to ask',
		members: [
			{
				de: 'fragen',
				pos: 'verb',
				sense: '^to ask$',
				rule: 'Ask a question; fragen nach + Dat = ask about',
				example: 'Er fragt nach dem Weg.'
			},
			{
				de: 'bitten',
				pos: 'verb',
				sense: 'request',
				gloss: 'to ask (for), to request',
				rule: 'Ask for something; bitten um + Akk',
				example: 'Sie bittet um Hilfe.'
			}
		]
	},
	{
		key: 'to-learn',
		label: 'to learn',
		members: [
			{
				de: 'lernen',
				pos: 'verb',
				sense: 'acquire knowledge',
				rule: 'Study; acquire knowledge or a skill',
				example: 'Ich lerne Deutsch.'
			},
			{
				de: 'erfahren',
				pos: 'verb',
				sense: 'find out',
				gloss: 'to learn, to find out',
				rule: 'Find out news or information',
				example: 'Ich habe es gestern erfahren.'
			}
		]
	},
	{
		key: 'to-live',
		label: 'to live',
		members: [
			{
				de: 'leben',
				pos: 'verb',
				sense: 'to be alive',
				rule: 'Be alive; live a certain way, or in a place in general',
				example: 'Er lebt seit Jahren in Deutschland.'
			},
			{
				de: 'wohnen',
				pos: 'verb',
				sense: 'reside',
				rule: 'Have your home at an address or in a home',
				example: 'Ich wohne in der Hauptstraße.'
			}
		]
	},
	{
		key: 'to-spend',
		label: 'to spend',
		members: [
			{
				de: 'ausgeben',
				pos: 'verb',
				sense: 'to spend',
				gloss: 'to spend (money)',
				rule: 'Money',
				example: 'Er gibt viel Geld aus.'
			},
			{
				de: 'verbringen',
				pos: 'verb',
				sense: 'to spend, to pass',
				gloss: 'to spend (time)',
				rule: 'Time',
				example: 'Wir verbringen den Sommer am See.'
			}
		]
	}
];

const v = (de: string, sense?: string, extra: Partial<StarterMember> = {}): StarterMember => ({
	de,
	pos: 'verb',
	sense,
	...extra
});

export const STARTER_PREFIX_MEANINGS: StarterPrefixMeaning[] = [
	{
		key: 'be-object',
		prefix: 'be',
		label: 'makes a verb take a direct object',
		verbs: [v('beantworten'), v('bewohnen')]
	},
	{ key: 'be-provide', prefix: 'be', label: 'provide with', verbs: [v('beleuchten', 'light')] },
	{
		key: 'ent-away',
		prefix: 'ent',
		label: 'removal, away from',
		verbs: [v('entfernen', 'remove'), v('entkommen')]
	},
	{ key: 'ent-uncover', prefix: 'ent', label: 'uncovering', verbs: [v('entdecken', 'discover')] },
	{
		key: 'ent-arise',
		prefix: 'ent',
		label: 'coming into being',
		verbs: [v('entstehen', 'come into being')]
	},
	{
		key: 'er-result',
		prefix: 'er',
		label: 'achieving a result',
		verbs: [v('erreichen', 'reach'), v('erarbeiten')]
	},
	{
		key: 'er-death',
		prefix: 'er',
		label: 'dying or killing',
		verbs: [v('ertrinken'), v('erschießen')]
	},
	{
		key: 'ver-wrong',
		prefix: 'ver',
		label: 'doing something wrong',
		verbs: [v('verlaufen', 'get lost', { gloss: 'to get lost (sich verlaufen)' }), v('verwechseln')]
	},
	{
		key: 'ver-change',
		prefix: 'ver',
		label: 'change of state',
		verbs: [v('verändern', 'alter'), v('verbessern', 'make better')]
	},
	{ key: 'ver-use-up', prefix: 'ver', label: 'using up', verbs: [v('verbrauchen')] },
	{
		key: 'zer-pieces',
		prefix: 'zer',
		label: 'into pieces',
		verbs: [v('zerbrechen'), v('zerstören')]
	},
	{
		key: 'miss-wrongly',
		prefix: 'miss',
		label: 'wrongly, badly',
		verbs: [v('missverstehen'), v('misslingen')]
	},
	{
		key: 'an-begin',
		prefix: 'an',
		label: 'beginning',
		verbs: [v('anfangen', 'begin'), v('anschalten')]
	},
	{
		key: 'an-toward',
		prefix: 'an',
		label: 'toward, at',
		verbs: [v('ankommen', 'arrive'), v('ansehen', 'look at')]
	},
	{ key: 'auf-open', prefix: 'auf', label: 'open', verbs: [v('aufmachen', 'open')] },
	{ key: 'auf-up', prefix: 'auf', label: 'up', verbs: [v('aufstehen', 'get up')] },
	{ key: 'auf-finish', prefix: 'auf', label: 'finish completely', verbs: [v('aufessen')] },
	{ key: 'aus-out', prefix: 'aus', label: 'out', verbs: [v('ausgehen', 'go out')] },
	{
		key: 'aus-thoroughly',
		prefix: 'aus',
		label: 'thoroughly, to the end',
		verbs: [v('austrinken', 'finish'), v('ausschlafen')]
	},
	{ key: 'aus-off', prefix: 'aus', label: 'off', verbs: [v('ausschalten')] },
	{
		key: 'ab-away',
		prefix: 'ab',
		label: 'off, away',
		verbs: [v('abfahren', 'depart'), v('abnehmen', 'take off')]
	},
	{ key: 'ab-cancel', prefix: 'ab', label: 'cancelling', verbs: [v('absagen', 'cancel')] },
	{
		key: 'ein-into',
		prefix: 'ein',
		label: 'into',
		verbs: [v('einsteigen', 'get in'), v('einladen', 'invite')]
	},
	{
		key: 'mit-along',
		prefix: 'mit',
		label: 'along with',
		verbs: [v('mitkommen', 'come with'), v('mitbringen', 'bring')]
	},
	{ key: 'nach-copy', prefix: 'nach', label: 'after, copying', verbs: [v('nachmachen')] },
	{
		key: 'nach-look-into',
		prefix: 'nach',
		label: 'looking into',
		verbs: [v('nachdenken'), v('nachschlagen')]
	},
	{
		key: 'vor-before',
		prefix: 'vor',
		label: 'before, in front',
		verbs: [v('vorbereiten'), v('vorstellen', 'introduce')]
	},
	{ key: 'zu-closed', prefix: 'zu', label: 'closed', verbs: [v('zumachen', 'close')] },
	{ key: 'zu-toward', prefix: 'zu', label: 'toward', verbs: [v('zuhören')] },
	{
		key: 'ueber-literal',
		prefix: 'über',
		label: 'separable: across, over (literal)',
		verbs: [v('übersetzen', 'cross', { prefixType: 'separable', gloss: 'to ferry across' })]
	},
	{
		key: 'ueber-figurative',
		prefix: 'über',
		label: 'inseparable: figurative',
		verbs: [v('übersetzen', 'translate', { prefixType: 'inseparable' })]
	},
	{
		key: 'um-literal',
		prefix: 'um',
		label: 'separable: around, change (literal)',
		verbs: [v('umsteigen')]
	},
	{
		key: 'um-figurative',
		prefix: 'um',
		label: 'inseparable: all around, enclosing',
		verbs: [v('umarmen')]
	},
	{
		key: 'durch-literal',
		prefix: 'durch',
		label: 'separable: through (literal)',
		verbs: [v('durchfallen', 'fall through|fail', { prefixType: 'separable' })]
	},
	{
		key: 'durch-thorough',
		prefix: 'durch',
		label: 'inseparable: thoroughly',
		verbs: [v('durchsuchen')]
	}
];

/** Prefixes with no productive meaning: shown on their page instead of meanings. */
export const PREFIX_NOTES: Record<string, string> = {
	emp: 'No productive meaning: learn these verbs one by one (empfehlen, empfinden).',
	ge: 'No productive meaning: learn these verbs one by one (gehören, gefallen).',
	durch:
		'Separable meanings are usually literal; inseparable ones figurative or thorough (durchfallen, durchsuchen).',
	über: 'Separable meanings are usually literal; inseparable ones figurative (übersetzen: ferry across vs translate).',
	um: 'Separable meanings are usually literal; inseparable ones mean "all around" (umsteigen, umarmen).',
	unter:
		'Separable meanings are usually literal (go under); inseparable ones figurative (unterrichten).'
};
