-- Postpositions (meiner Meinung nach) are filed as prepositions; mark them so they can be told apart.
UPDATE dict_word SET grammar = grammar || '{"postposition": true}'::jsonb
WHERE source_ref LIKE '%|postp|%' AND NOT grammar ? 'postposition';--> statement-breakpoint
UPDATE word SET grammar = word.grammar || '{"postposition": true}'::jsonb
FROM dict_word d
WHERE word.dict_word_id = d.id AND d.source_ref LIKE '%|postp|%' AND NOT word.grammar ? 'postposition';
