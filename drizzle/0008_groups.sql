ALTER TABLE "group" ADD COLUMN "seed_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "group_user_seed_idx" ON "group" USING btree ("user_id","seed_key");--> statement-breakpoint
CREATE UNIQUE INDEX "group_user_family_idx" ON "group" USING btree ("user_id","label") WHERE "group"."kind" = 'verb_family';--> statement-breakpoint
-- Verb prefixes (reference data, shared by every user).
INSERT INTO prefix (prefix, type) VALUES
	('ab', 'separable'), ('an', 'separable'), ('auf', 'separable'), ('aus', 'separable'),
	('bei', 'separable'), ('ein', 'separable'), ('fest', 'separable'), ('fort', 'separable'),
	('her', 'separable'), ('hin', 'separable'), ('los', 'separable'), ('mit', 'separable'),
	('nach', 'separable'), ('vor', 'separable'), ('weg', 'separable'), ('zu', 'separable'),
	('zurück', 'separable'), ('zusammen', 'separable'),
	('be', 'inseparable'), ('emp', 'inseparable'), ('ent', 'inseparable'), ('er', 'inseparable'),
	('ge', 'inseparable'), ('miss', 'inseparable'), ('ver', 'inseparable'), ('zer', 'inseparable'),
	('durch', 'either'), ('hinter', 'either'), ('über', 'either'), ('um', 'either'),
	('unter', 'either'), ('voll', 'either'), ('wider', 'either'), ('wieder', 'either')
ON CONFLICT (prefix) DO NOTHING;--> statement-breakpoint
-- Link collection verbs to their prefix.
UPDATE word SET prefix_id = p.id FROM prefix p
WHERE word.pos = 'verb' AND word.prefix_id IS NULL AND word.grammar->>'prefix' = p.prefix;
