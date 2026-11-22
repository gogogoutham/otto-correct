CREATE TYPE "public"."deck_status" AS ENUM('not_in_deck', 'studying', 'known');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('en_de', 'de_en');--> statement-breakpoint
CREATE TYPE "public"."example_source" AS ENUM('dictionary', 'tatoeba', 'ai', 'manual');--> statement-breakpoint
CREATE TYPE "public"."group_kind" AS ENUM('contrast', 'prefix_meaning', 'verb_family');--> statement-breakpoint
CREATE TYPE "public"."part_of_speech" AS ENUM('verb', 'noun', 'adjective', 'adverb', 'preposition', 'conjunction', 'particle', 'expression');--> statement-breakpoint
CREATE TYPE "public"."prefix_type" AS ENUM('separable', 'inseparable', 'either');--> statement-breakpoint
CREATE TYPE "public"."review_order" AS ENUM('oldest_first', 'shuffled');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('new', 'review', 'cram');--> statement-breakpoint
CREATE TABLE "card" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"meaning_id" integer,
	"group_id" integer,
	"queued_at" timestamp with time zone,
	"last_reviewed_at" timestamp with time zone,
	"flagged" boolean DEFAULT false NOT NULL,
	CONSTRAINT "card_one_subject" CHECK (("card"."meaning_id" is null) <> ("card"."group_id" is null))
);
--> statement-breakpoint
CREATE TABLE "dict_example" (
	"id" serial PRIMARY KEY NOT NULL,
	"dict_sense_id" integer NOT NULL,
	"german" text NOT NULL,
	"english" text,
	"source" "example_source" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dict_form" (
	"id" serial PRIMARY KEY NOT NULL,
	"dict_word_id" integer NOT NULL,
	"form" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dict_sense" (
	"id" serial PRIMARY KEY NOT NULL,
	"dict_word_id" integer NOT NULL,
	"position" smallint NOT NULL,
	"glosses" text[] NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dict_word" (
	"id" serial PRIMARY KEY NOT NULL,
	"headword" text NOT NULL,
	"pos" "part_of_speech" NOT NULL,
	"source_ref" text NOT NULL,
	"grammar" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"frequency_rank" integer,
	"fetched_on_demand" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dict_word_source_ref_unique" UNIQUE("source_ref")
);
--> statement-breakpoint
CREATE TABLE "example" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"meaning_id" integer NOT NULL,
	"german" text NOT NULL,
	"english" text,
	"source" "example_source" NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "group_kind" NOT NULL,
	"label" text NOT NULL,
	"note" text,
	"prefix_id" integer,
	"qualified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_member" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"meaning_id" integer NOT NULL,
	"rule" text,
	"example" text,
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_relation" (
	"group_id" integer NOT NULL,
	"related_group_id" integer NOT NULL,
	CONSTRAINT "group_relation_group_id_related_group_id_pk" PRIMARY KEY("group_id","related_group_id")
);
--> statement-breakpoint
CREATE TABLE "meaning" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"word_id" integer NOT NULL,
	"dict_sense_id" integer,
	"glosses" text[] NOT NULL,
	"context_label" text,
	"grammar" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"manual_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"deck_status" "deck_status" DEFAULT 'studying' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meaning_tag" (
	"meaning_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	CONSTRAINT "meaning_tag_meaning_id_tag_id_pk" PRIMARY KEY("meaning_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "prefix" (
	"id" serial PRIMARY KEY NOT NULL,
	"prefix" text NOT NULL,
	"type" "prefix_type" NOT NULL,
	CONSTRAINT "prefix_prefix_unique" UNIQUE("prefix")
);
--> statement-breakpoint
CREATE TABLE "review_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" integer NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"direction" "direction" NOT NULL,
	"session_type" "session_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"daily_new_limit" smallint DEFAULT 6 NOT NULL,
	"review_order" "review_order" DEFAULT 'oldest_first' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "word" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"headword" text NOT NULL,
	"pos" "part_of_speech" NOT NULL,
	"dict_word_id" integer,
	"grammar" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"manual_fields" text[] DEFAULT '{}'::text[] NOT NULL,
	"prefix_id" integer,
	"source_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "word_link" (
	"user_id" uuid NOT NULL,
	"word_id" integer NOT NULL,
	"linked_word_id" integer NOT NULL,
	CONSTRAINT "word_link_word_id_linked_word_id_pk" PRIMARY KEY("word_id","linked_word_id")
);
--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_meaning_id_meaning_id_fk" FOREIGN KEY ("meaning_id") REFERENCES "public"."meaning"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card" ADD CONSTRAINT "card_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dict_example" ADD CONSTRAINT "dict_example_dict_sense_id_dict_sense_id_fk" FOREIGN KEY ("dict_sense_id") REFERENCES "public"."dict_sense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dict_form" ADD CONSTRAINT "dict_form_dict_word_id_dict_word_id_fk" FOREIGN KEY ("dict_word_id") REFERENCES "public"."dict_word"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dict_sense" ADD CONSTRAINT "dict_sense_dict_word_id_dict_word_id_fk" FOREIGN KEY ("dict_word_id") REFERENCES "public"."dict_word"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "example" ADD CONSTRAINT "example_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "example" ADD CONSTRAINT "example_meaning_id_meaning_id_fk" FOREIGN KEY ("meaning_id") REFERENCES "public"."meaning"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group" ADD CONSTRAINT "group_prefix_id_prefix_id_fk" FOREIGN KEY ("prefix_id") REFERENCES "public"."prefix"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_meaning_id_meaning_id_fk" FOREIGN KEY ("meaning_id") REFERENCES "public"."meaning"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_relation" ADD CONSTRAINT "group_relation_group_id_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_relation" ADD CONSTRAINT "group_relation_related_group_id_group_id_fk" FOREIGN KEY ("related_group_id") REFERENCES "public"."group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaning" ADD CONSTRAINT "meaning_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaning" ADD CONSTRAINT "meaning_word_id_word_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."word"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaning" ADD CONSTRAINT "meaning_dict_sense_id_dict_sense_id_fk" FOREIGN KEY ("dict_sense_id") REFERENCES "public"."dict_sense"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaning_tag" ADD CONSTRAINT "meaning_tag_meaning_id_meaning_id_fk" FOREIGN KEY ("meaning_id") REFERENCES "public"."meaning"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meaning_tag" ADD CONSTRAINT "meaning_tag_tag_id_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_event" ADD CONSTRAINT "review_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_event" ADD CONSTRAINT "review_event_card_id_card_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."card"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word" ADD CONSTRAINT "word_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word" ADD CONSTRAINT "word_dict_word_id_dict_word_id_fk" FOREIGN KEY ("dict_word_id") REFERENCES "public"."dict_word"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word" ADD CONSTRAINT "word_prefix_id_prefix_id_fk" FOREIGN KEY ("prefix_id") REFERENCES "public"."prefix"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_link" ADD CONSTRAINT "word_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_link" ADD CONSTRAINT "word_link_word_id_word_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."word"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "word_link" ADD CONSTRAINT "word_link_linked_word_id_word_id_fk" FOREIGN KEY ("linked_word_id") REFERENCES "public"."word"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_meaning_idx" ON "card" USING btree ("meaning_id");--> statement-breakpoint
CREATE UNIQUE INDEX "card_group_idx" ON "card" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "card_user_queued_idx" ON "card" USING btree ("user_id","queued_at");--> statement-breakpoint
CREATE INDEX "dict_example_sense_idx" ON "dict_example" USING btree ("dict_sense_id");--> statement-breakpoint
CREATE INDEX "dict_form_form_idx" ON "dict_form" USING btree (lower("form"));--> statement-breakpoint
CREATE INDEX "dict_sense_word_idx" ON "dict_sense" USING btree ("dict_word_id");--> statement-breakpoint
CREATE INDEX "dict_word_headword_idx" ON "dict_word" USING btree ("headword");--> statement-breakpoint
CREATE INDEX "dict_word_headword_trgm_idx" ON "dict_word" USING gin (lower("headword") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "example_meaning_idx" ON "example" USING btree ("meaning_id");--> statement-breakpoint
CREATE INDEX "group_user_kind_idx" ON "group" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "group_member_group_meaning_idx" ON "group_member" USING btree ("group_id","meaning_id");--> statement-breakpoint
CREATE INDEX "group_member_meaning_idx" ON "group_member" USING btree ("meaning_id");--> statement-breakpoint
CREATE INDEX "meaning_user_status_idx" ON "meaning" USING btree ("user_id","deck_status");--> statement-breakpoint
CREATE INDEX "meaning_word_idx" ON "meaning" USING btree ("word_id");--> statement-breakpoint
CREATE INDEX "meaning_tag_tag_idx" ON "meaning_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "review_event_card_idx" ON "review_event" USING btree ("card_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "review_event_user_idx" ON "review_event" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_user_name_idx" ON "tag" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "word_user_headword_idx" ON "word" USING btree ("user_id","headword");--> statement-breakpoint
CREATE INDEX "word_headword_trgm_idx" ON "word" USING gin (lower("headword") gin_trgm_ops);