import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

// `prepare: false` keeps this compatible with Neon's pooled (PgBouncer) connection string.
const client = postgres(DATABASE_URL, { prepare: false, max: 5 });

export const db = drizzle(client, { schema });
