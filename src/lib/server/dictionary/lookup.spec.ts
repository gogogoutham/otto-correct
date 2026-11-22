import { describe, expect, it } from 'vitest';
import { fakeKaikki } from './fixtures/fake-kaikki.js';
import { fetchEntries, SourceUnavailableError } from './lookup.js';

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
