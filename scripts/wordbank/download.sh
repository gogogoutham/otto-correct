#!/usr/bin/env bash
# Downloads the word-bank build inputs into data/downloads (about 1.2 GB).
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p data/downloads && cd data/downloads
curl -fL -o kaikki.org-dictionary-German.jsonl https://kaikki.org/dictionary/German/kaikki.org-dictionary-German.jsonl
curl -fL -o de_50k.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt
for f in deu/deu-eng_links.tsv.bz2 deu/deu_sentences.tsv.bz2 eng/eng_sentences.tsv.bz2; do
	curl -fL -o "$(basename "$f")" "https://downloads.tatoeba.org/exports/per_language/$f"
done
ls -la
