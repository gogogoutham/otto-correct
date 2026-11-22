# Word bank findings (Milestone 2)

Built Nov 22, 2026 from the kaikki.org German extract (dump of Oct 30, 2026), the
OpenSubtitles 2018 German frequency list and Tatoeba.

## Result

- **10,000 lemmas, 10,740 entries** (homographs and parts of speech are separate entries),
  from the top 24,705 frequency tokens.
- 4,643 nouns, 3,021 verbs, 2,130 adjectives, 766 adverbs, 96 prepositions, 68 conjunctions,
  15 particles.
- 19,916 meanings, 306,219 inflected forms (for search), 6,915 dictionary examples and
  29,679 Tatoeba sentence pairs. 96% of entries have at least one example.
- 3.8 MB compressed in the repo; **91 MB in Postgres** (of Neon's free 1 GB), loaded in
  about 12 seconds.
- 128 of the 131 words on the test list are in the bank (see
  `src/lib/server/dictionary/wordbank.spec.ts`). The other three (_erarbeiten, misslingen,
  nachschlagen_) are rare in subtitles and come from the on-demand fetch.

## Field coverage

| Field                                                    | Coverage                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Noun gender                                              | 4,619 of 4,643 (99%); the rest are mostly plural-only nouns such as _Eltern_ |
| Noun plural (or "no plural" / "plural only")             | 4,231 of 4,643 (91%)                                                         |
| Noun genitive                                            | 4,594 of 4,643 (99%)                                                         |
| Verb 3rd sg. present, Präteritum, Partizip II, auxiliary | 3,007 of 3,021 (99.5%)                                                       |
| Verb prefix and base verb                                | 1,518 verbs (855 separable)                                                  |
| Adjective comparison (or "not comparable")               | 2,072 of 2,130 (97%)                                                         |
| Meaning-level prepositional object (_warten auf_ + Akk)  | 455 meanings                                                                 |
| Meaning-level object case (_helfen_ + Dat)               | 370 meanings                                                                 |
| Preposition case                                         | 42 of 96, from a built-in list of the common prepositions                    |

## Gaps and how they're handled

1. **Preposition case isn't in the source.** Wiktionary's German entries don't record it,
   so the 36 common prepositions get it from a built-in list (with two-way and contraction
   info). Rare ones (_zufolge_, _mangels_) need manual entry.
2. **Prepositional objects are only partly marked.** They come from notes like
   "[with auf (+ accusative)]" in the glosses, which many entries lack. _sich freuen auf_
   vs _über_ is marked, but expect gaps; these fields are editable.
3. **The frequency list is lowercase.** "aber" also matches the noun _Aber_. A capitalized
   noun is only kept when nothing lowercase claims the word (_haus_ → _Haus_) or it
   nominalizes a verb (_essen_ → _Essen_). A few odd entries remain, such as _ein_ as an
   adjective.
4. **Grammar labels need rules, not just data.** _Name_ is tagged "weak" by the source
   but its genitive _Namens_ makes it mixed; the card back should derive the label from
   the genitive (Milestone 4). _rosa_ gets an invented comparative _rosaner_; "never declines"
   should hide it.
5. **Prefix meaning isn't in the source,** as expected. It stays an AI suggestion (Milestone 6).
6. **Gender-inclusive entries** (_Freund:in_) and abbreviations (_Nr._) are skipped.
7. **Expressions are rare in a single-word frequency list.** Only one made the bank;
   expressions like _Bescheid sagen_ come from the on-demand fetch or manual entry.

## On-demand fetch

Words outside the bank are fetched from `kaikki.org/dictionary/German/meaning/…` when
looked up, parsed by the same code, and saved, so each word is fetched once. An inflected
form (_fuhr_) is followed to its lemma. Measured here: about 0.3–1.4 s for a new word,
under 10 ms once stored. If the site is down, the lookup reports it and the word can be
entered manually.

## Rebuilding

`npm run wordbank:download` (about 1.2 GB), then `npm run wordbank:build` (about 35 s).
Commit the new `data/wordbank/`; the next production deploy loads it.
