/**
 * Database schema for V1.
 *
 * Two kinds of tables:
 * - Shared dictionary tables (`dict_*`, `prefix`): reference data, not owned by any user.
 * - User-owned tables: every one carries `user_id`, so more users can be added later
 *   without a migration.
 */
import { sql } from 'drizzle-orm';
import {
	bigserial,
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	serial,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const partOfSpeech = pgEnum('part_of_speech', [
	'verb',
	'noun',
	'adjective',
	'adverb',
	'preposition',
	'conjunction',
	'particle',
	'expression'
]);

export const deckStatus = pgEnum('deck_status', ['not_in_deck', 'studying', 'known']);

export const exampleSource = pgEnum('example_source', ['dictionary', 'tatoeba', 'ai', 'manual']);

export const groupKind = pgEnum('group_kind', ['contrast', 'prefix_meaning', 'verb_family']);

export const prefixType = pgEnum('prefix_type', ['separable', 'inseparable', 'either']);

export const direction = pgEnum('direction', ['en_de', 'de_en']);

export const sessionType = pgEnum('session_type', ['new', 'review', 'cram']);

export const reviewOrder = pgEnum('review_order', ['oldest_first', 'shuffled']);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
	timestamp('updated_at', { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdate(() => new Date());

// ---------------------------------------------------------------------------
// Users and sessions
// ---------------------------------------------------------------------------

export const user = pgTable('user', {
	id: uuid('id').primaryKey().defaultRandom(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	/** IANA time zone; a study day starts at midnight here. */
	timeZone: text('time_zone').notNull().default('UTC'),
	dailyNewLimit: smallint('daily_new_limit').notNull().default(6),
	reviewOrder: reviewOrder('review_order').notNull().default('oldest_first'),
	createdAt: createdAt()
});

export const session = pgTable(
	'session',
	{
		/** SHA-256 of the session token; the raw token only lives in the cookie. */
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
	},
	(t) => [index('session_user_idx').on(t.userId)]
);

// ---------------------------------------------------------------------------
// Shared dictionary (A1–B2 word bank + words fetched on demand)
// ---------------------------------------------------------------------------

export const dictWord = pgTable(
	'dict_word',
	{
		id: serial('id').primaryKey(),
		headword: text('headword').notNull(),
		pos: partOfSpeech('pos').notNull(),
		/** Stable reference into the source (e.g. kaikki.org entry id). */
		sourceRef: text('source_ref').notNull().unique(),
		/** Part-of-speech grammar parsed from the source (gender, plural, principal parts, ...). */
		grammar: jsonb('grammar').notNull().default({}),
		/** Rank in the frequency list; null for words fetched on demand. */
		frequencyRank: integer('frequency_rank'),
		fetchedOnDemand: boolean('fetched_on_demand').notNull().default(false),
		updatedAt: updatedAt()
	},
	(t) => [
		index('dict_word_headword_idx').on(t.headword),
		index('dict_word_headword_trgm_idx').using('gin', sql`lower(${t.headword}) gin_trgm_ops`)
	]
);

export const dictSense = pgTable(
	'dict_sense',
	{
		id: serial('id').primaryKey(),
		dictWordId: integer('dict_word_id')
			.notNull()
			.references(() => dictWord.id, { onDelete: 'cascade' }),
		position: smallint('position').notNull(),
		glosses: text('glosses').array().notNull(),
		/** Sense-level details from the source (register, case, preposition, raw tags). */
		details: jsonb('details').notNull().default({})
	},
	(t) => [index('dict_sense_word_idx').on(t.dictWordId)]
);

/** Inflected forms, so that "fuhr" finds "fahren". */
export const dictForm = pgTable(
	'dict_form',
	{
		id: serial('id').primaryKey(),
		dictWordId: integer('dict_word_id')
			.notNull()
			.references(() => dictWord.id, { onDelete: 'cascade' }),
		form: text('form').notNull(),
		tags: text('tags')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`)
	},
	(t) => [index('dict_form_form_idx').on(sql`lower(${t.form})`)]
);

export const dictExample = pgTable(
	'dict_example',
	{
		id: serial('id').primaryKey(),
		dictSenseId: integer('dict_sense_id')
			.notNull()
			.references(() => dictSense.id, { onDelete: 'cascade' }),
		german: text('german').notNull(),
		english: text('english'),
		source: exampleSource('source').notNull()
	},
	(t) => [index('dict_example_sense_idx').on(t.dictSenseId)]
);

/** Reference data: each prefix's meanings are prefix-meaning groups. */
export const prefix = pgTable('prefix', {
	id: serial('id').primaryKey(),
	prefix: text('prefix').notNull().unique(),
	type: prefixType('type').notNull()
});

// ---------------------------------------------------------------------------
// The user's collection
// ---------------------------------------------------------------------------

export const word = pgTable(
	'word',
	{
		id: serial('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		headword: text('headword').notNull(),
		pos: partOfSpeech('pos').notNull(),
		/** Null when the word was created manually. */
		dictWordId: integer('dict_word_id').references(() => dictWord.id, { onDelete: 'set null' }),
		/** Word-level part-of-speech fields (see requirements, "Part-of-speech fields"). */
		grammar: jsonb('grammar').notNull().default({}),
		/** Grammar field names edited by hand; re-sync from source never overwrites these. */
		manualFields: text('manual_fields')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		/** For verbs: the prefix used, if any. Prefix type and base verb live in `grammar`. */
		prefixId: integer('prefix_id').references(() => prefix.id),
		sourceSyncedAt: timestamp('source_synced_at', { withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('word_user_headword_idx').on(t.userId, t.headword),
		index('word_headword_trgm_idx').using('gin', sql`lower(${t.headword}) gin_trgm_ops`)
	]
);

/** Expressions link to the words they contain. Homographs are found by matching headword. */
export const wordLink = pgTable(
	'word_link',
	{
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		wordId: integer('word_id')
			.notNull()
			.references(() => word.id, { onDelete: 'cascade' }),
		linkedWordId: integer('linked_word_id')
			.notNull()
			.references(() => word.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.wordId, t.linkedWordId] })]
);

export const meaning = pgTable(
	'meaning',
	{
		id: serial('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		wordId: integer('word_id')
			.notNull()
			.references(() => word.id, { onDelete: 'cascade' }),
		dictSenseId: integer('dict_sense_id').references(() => dictSense.id, {
			onDelete: 'set null'
		}),
		glosses: text('glosses').array().notNull(),
		/** Short context label, e.g. "to (cities/countries)". */
		contextLabel: text('context_label'),
		/** Meaning-level grammar: case governed, preposition, reflexive, register, ... */
		grammar: jsonb('grammar').notNull().default({}),
		manualFields: text('manual_fields')
			.array()
			.notNull()
			.default(sql`'{}'::text[]`),
		deckStatus: deckStatus('deck_status').notNull().default('studying'),
		addedAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('meaning_user_status_idx').on(t.userId, t.deckStatus),
		index('meaning_word_idx').on(t.wordId)
	]
);

export const example = pgTable(
	'example',
	{
		id: serial('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		meaningId: integer('meaning_id')
			.notNull()
			.references(() => meaning.id, { onDelete: 'cascade' }),
		german: text('german').notNull(),
		english: text('english'),
		source: exampleSource('source').notNull(),
		position: smallint('position').notNull().default(0)
	},
	(t) => [index('example_meaning_idx').on(t.meaningId)]
);

export const tag = pgTable(
	'tag',
	{
		id: serial('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull()
	},
	(t) => [uniqueIndex('tag_user_name_idx').on(t.userId, t.name)]
);

export const meaningTag = pgTable(
	'meaning_tag',
	{
		meaningId: integer('meaning_id')
			.notNull()
			.references(() => meaning.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tag.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.meaningId, t.tagId] }), index('meaning_tag_tag_idx').on(t.tagId)]
);

// ---------------------------------------------------------------------------
// Groups: contrast groups, prefix meanings, verb families
// ---------------------------------------------------------------------------

export const group = pgTable(
	'group',
	{
		id: serial('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		kind: groupKind('kind').notNull(),
		/** English idea, prefix + meaning, or base verb. */
		label: text('label').notNull(),
		note: text('note'),
		/** Set for prefix-meaning groups. */
		prefixId: integer('prefix_id').references(() => prefix.id),
		/** When the group first had two in-deck members; it then joins the new-card queue. */
		qualifiedAt: timestamp('qualified_at', { withTimezone: true }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [index('group_user_kind_idx').on(t.userId, t.kind)]
);

export const groupRelation = pgTable(
	'group_relation',
	{
		groupId: integer('group_id')
			.notNull()
			.references(() => group.id, { onDelete: 'cascade' }),
		relatedGroupId: integer('related_group_id')
			.notNull()
			.references(() => group.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.groupId, t.relatedGroupId] })]
);

export const groupMember = pgTable(
	'group_member',
	{
		id: serial('id').primaryKey(),
		groupId: integer('group_id')
			.notNull()
			.references(() => group.id, { onDelete: 'cascade' }),
		meaningId: integer('meaning_id')
			.notNull()
			.references(() => meaning.id, { onDelete: 'cascade' }),
		rule: text('rule'),
		example: text('example'),
		position: smallint('position').notNull().default(0)
	},
	(t) => [
		uniqueIndex('group_member_group_meaning_idx').on(t.groupId, t.meaningId),
		index('group_member_meaning_idx').on(t.meaningId)
	]
);

// ---------------------------------------------------------------------------
// Cards and the review log
// ---------------------------------------------------------------------------

export const card = pgTable(
	'card',
	{
		id: serial('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		/** Exactly one of meaningId / groupId is set. */
		meaningId: integer('meaning_id').references(() => meaning.id, { onDelete: 'cascade' }),
		groupId: integer('group_id').references(() => group.id, { onDelete: 'cascade' }),
		/** When the card entered the new-card queue; reset if a known meaning returns to studying. */
		queuedAt: timestamp('queued_at', { withTimezone: true }),
		lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
		flagged: boolean('flagged').notNull().default(false)
	},
	(t) => [
		check('card_one_subject', sql`(${t.meaningId} is null) <> (${t.groupId} is null)`),
		uniqueIndex('card_meaning_idx').on(t.meaningId),
		uniqueIndex('card_group_idx').on(t.groupId),
		index('card_user_queued_idx').on(t.userId, t.queuedAt)
	]
);

/** Append-only. First-seen and revisit dates are derived from here. */
export const reviewEvent = pgTable(
	'review_event',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		cardId: integer('card_id')
			.notNull()
			.references(() => card.id, { onDelete: 'cascade' }),
		reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
		direction: direction('direction').notNull(),
		sessionType: sessionType('session_type').notNull()
	},
	(t) => [
		index('review_event_card_idx').on(t.cardId, t.reviewedAt),
		index('review_event_user_idx').on(t.userId, t.reviewedAt)
	]
);

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
