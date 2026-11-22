CREATE TABLE "dict_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "dict_sense_word_idx";--> statement-breakpoint
ALTER TABLE "dict_example" ALTER COLUMN "dict_sense_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dict_example" ADD COLUMN "dict_word_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "dict_example" ADD CONSTRAINT "dict_example_dict_word_id_dict_word_id_fk" FOREIGN KEY ("dict_word_id") REFERENCES "public"."dict_word"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dict_example_word_idx" ON "dict_example" USING btree ("dict_word_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dict_sense_word_position_idx" ON "dict_sense" USING btree ("dict_word_id","position");