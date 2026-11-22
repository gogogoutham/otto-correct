-- Folds German spelling for search: lowercase, umlauts as ae/oe/ue, ß as ss.
-- "fuer", "Fuer" and "für" all fold to "fuer".
CREATE OR REPLACE FUNCTION de_fold(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE RETURNS NULL ON NULL INPUT
AS $$ SELECT replace(replace(replace(replace(lower(t), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss') $$;
