// Applies database migrations from ./drizzle.
//
// On Vercel this runs before every build, but only touches the database for
// production deployments, so preview builds of unmerged branches never change it.
// Locally: DATABASE_URL=... npm run db:migrate
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const onVercel = Boolean(process.env.VERCEL);
if (onVercel && process.env.VERCEL_ENV !== 'production') {
	console.log(`Skipping migrations for VERCEL_ENV=${process.env.VERCEL_ENV}`);
	process.exit(0);
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
	await migrate(drizzle(client), { migrationsFolder: './drizzle' });
	console.log('Migrations applied');
} finally {
	await client.end();
}
