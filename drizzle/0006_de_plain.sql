-- Lower-cases German text and drops umlaut marks (ä → a, ß → ss), for matching words typed without umlauts.
CREATE OR REPLACE FUNCTION de_plain(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE RETURNS NULL ON NULL INPUT
AS $$ SELECT replace(translate(lower(t), 'äöü', 'aou'), 'ß', 'ss') $$;
