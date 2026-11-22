DROP INDEX "dict_form_form_idx";--> statement-breakpoint
DROP INDEX "dict_word_headword_trgm_idx";--> statement-breakpoint
DROP INDEX "word_headword_trgm_idx";--> statement-breakpoint
ALTER TABLE "dict_sense" ADD COLUMN "gloss_search" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX "dict_sense_gloss_trgm_idx" ON "dict_sense" USING gin ("gloss_search" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "word_user_dict_word_idx" ON "word" USING btree ("user_id","dict_word_id") WHERE "word"."dict_word_id" is not null;--> statement-breakpoint
CREATE INDEX "dict_form_form_idx" ON "dict_form" USING btree (de_fold("form"));--> statement-breakpoint
CREATE INDEX "dict_word_headword_trgm_idx" ON "dict_word" USING gin (de_fold("headword") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "word_headword_trgm_idx" ON "word" USING gin (de_fold("headword") gin_trgm_ops);