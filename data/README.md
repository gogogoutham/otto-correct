# Data

## `wordbank/`

The A1–B2 word bank: the 10,000 most frequent German lemmas with their grammar, meanings,
inflected forms and example sentences. Built by `npm run wordbank:build` (after
`npm run wordbank:download`) and loaded into the database by `npm run wordbank:load`, which
production deploys run automatically when the file changes.

`manifest.json` records when it was built and what it contains.

### Sources and licences

- Dictionary entries: [English Wiktionary](https://en.wiktionary.org), extracted by
  [wiktextract](https://github.com/tatuylonen/wiktextract) and published at
  [kaikki.org](https://kaikki.org/dictionary/German/). Licensed
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Word frequencies: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
  (OpenSubtitles 2018, German), licensed
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- Example sentences: [Tatoeba](https://tatoeba.org), licensed
  [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/).

The word bank is a derived work of these sources and is shared under CC BY-SA 4.0.
