/**
 * Loads data/wordbank/wordbank.jsonl.gz into the shared dictionary tables.
 *
 * Skips the load when the same file was already loaded (tracked by its SHA-256 in
 * dict_meta). On Vercel it runs before each production build, after migrations; preview
 * builds skip it, like migrations.
 *
 *   DATABASE_URL=... npx tsx scripts/wordbank/load.ts [--force]
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../src/lib/server/db/schema.js';
import {
	getMeta,
	setMeta,
	storeEntries,
	type StoredEntry
} from '../../src/lib/server/dictionary/store.js';

const FILE = 'data/wordbank/wordbank.jsonl.gz';
const META_KEY = 'wordbank_sha256';

if (process.env.VERCEL && process.env.VERCEL_ENV !== 'production') {
	console.log(`Skipping word bank load for VERCEL_ENV=${process.env.VERCEL_ENV}`);
	process.exit(0);
}
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const file = readFileSync(FILE);
const sha = createHash('sha256').update(file).digest('hex');
const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });

try {
	if (!process.argv.includes('--force') && (await getMeta(db, META_KEY)) === sha) {
		console.log('Word bank already loaded; nothing to do.');
	} else {
		const entries = gunzipSync(file)
			.toString('utf8')
			.split('\n')
			.filter(Boolean)
			.map((line) => JSON.parse(line) as StoredEntry);
		const started = Date.now();
		await storeEntries(db, entries, {
			fetchedOnDemand: false,
			onProgress: (n) => {
				if (n % 2000 === 0 || n === entries.length) console.log(`  ${n}/${entries.length} entries`);
			}
		});
		await setMeta(db, META_KEY, sha);
		console.log(
			`Loaded ${entries.length} entries in ${((Date.now() - started) / 1000).toFixed(0)}s`
		);
	}
} finally {
	await client.end();
}
