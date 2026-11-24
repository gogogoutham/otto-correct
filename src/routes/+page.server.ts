import { db } from '#lib/server/db/index.js';
import { userId } from '#lib/server/forms.js';
import { homeCounts, loadStudyData } from '#lib/server/study.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const data = await loadStudyData(db, userId(locals));
	return {
		counts: homeCounts(data),
		timeZone: data.settings.timeZone,
		dailyNewLimit: data.settings.dailyNewLimit
	};
};
