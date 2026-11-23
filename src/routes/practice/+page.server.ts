import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Practice became cram sessions in M5. */
export const load: PageServerLoad = () => redirect(308, '/review');
