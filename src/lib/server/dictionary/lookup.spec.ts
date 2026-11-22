import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fetchEntries, SourceUnavailableError } from './lookup.js';

const lines = readFileSync(new URL('./fixtures/sample.jsonl', import.meta.url), 'utf8')
	.split('\n')
	.filter(Boolean);

/** Serves fixture entries the way kaikki.org serves one word's page. */
const fakeKaikki: typeof fetch = (input) => {
	const url = input instanceof Request ? input.url : input.toString();
	const word = decodeURIComponent(
		url
			.split('/')
			.at(-1)!
			.replace(/\.jsonl$/, '')
	);
	const body = lines.filter((l) => (JSON.parse(l) as { word: string }).word === word).join('\n');
	return Promise.resolve(new Response(body || 'not found', { status: body ? 200 : 404 }));
};

describe('fetchEntries', () => {
	it('follows an inflected form to its lemma', async () => {
		const entries = await fetchEntries('fuhr', fakeKaikki);
		expect(entries.map((e) => `${e.headword}/${e.pos}`)).toEqual(['fahren/verb']);
	});

	it('tries the capitalized spelling, so "bank" finds die Bank', async () => {
		const entries = await fetchEntries('bank', fakeKaikki);
		expect(entries.map((e) => e.headword)).toEqual(['Bank', 'Bank']);
	});

	it('returns nothing for an unknown word', async () => {
		expect(await fetchEntries('xyzzy', fakeKaikki)).toEqual([]);
	});

	it('reports an unreachable source', async () => {
		const down: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
		await expect(fetchEntries('Fernweh', down)).rejects.toBeInstanceOf(SourceUnavailableError);
	});
});
