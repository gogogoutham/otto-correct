import { readFileSync } from 'node:fs';

const lines = readFileSync(new URL('./sample.jsonl', import.meta.url), 'utf8')
	.split('\n')
	.filter(Boolean);

/** Serves fixture entries the way kaikki.org serves one word's page. */
export const fakeKaikki: typeof fetch = (input) => {
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
