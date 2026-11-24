import { db } from '#lib/server/db/index.js';
import { userId } from '#lib/server/forms.js';
import { listPrefixes } from '#lib/server/groups.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	prefixes: await listPrefixes(db, userId(locals))
});
