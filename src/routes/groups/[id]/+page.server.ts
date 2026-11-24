import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { cardActions } from '#lib/server/card-actions.js';
import { guard, idParam, int, text, userId } from '#lib/server/forms.js';
import {
	addMember,
	deleteGroup,
	findMeanings,
	getGroup,
	listGroups,
	moveMember,
	removeMember,
	setRelated,
	updateGroup,
	updateMember
} from '#lib/server/groups.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const uid = userId(locals);
	const id = idParam(params.id, 'Group');
	const q = url.searchParams.get('find') ?? '';
	const [group, all, found] = await Promise.all([
		guard(() => getGroup(db, uid, id)),
		listGroups(db, uid),
		findMeanings(db, uid, q)
	]);
	const memberIds = new Set(group.members.map((m) => m.meaningId));
	return {
		group,
		find: q,
		found: found.filter((f) => !memberIds.has(f.meaningId)),
		otherGroups: all
			.filter((g) => g.id !== id && g.kind === group.kind)
			.map((g) => ({
				id: g.id,
				title: g.kind === 'prefix_meaning' && g.prefix ? `${g.prefix}-: ${g.label}` : g.label
			}))
	};
};

const gid = (params: { id: string }) => idParam(params.id, 'Group');

export const actions: Actions = {
	addToDeck: cardActions.addToDeck,

	update: async ({ request, locals, params }) => {
		const form = await request.formData();
		const label = text(form, 'label');
		if (!label) return fail(400, { message: 'The group needs a name.' });
		await guard(() =>
			updateGroup(db, userId(locals), gid(params), { label, note: text(form, 'note') || null })
		);
		return { saved: 'group' };
	},

	delete: async ({ locals, params }) => {
		await guard(() => deleteGroup(db, userId(locals), gid(params)));
		redirect(303, '/groups');
	},

	addMember: async ({ request, locals, params }) => {
		const form = await request.formData();
		await guard(() =>
			addMember(db, userId(locals), gid(params), int(form, 'meaningId'), {
				rule: text(form, 'rule'),
				example: text(form, 'example')
			})
		);
	},

	updateMember: async ({ request, locals }) => {
		const form = await request.formData();
		await guard(() =>
			updateMember(db, userId(locals), int(form, 'memberId'), {
				rule: text(form, 'rule') || null,
				example: text(form, 'example') || null
			})
		);
		return { saved: `member-${text(form, 'memberId')}` };
	},

	removeMember: async ({ request, locals }) => {
		const form = await request.formData();
		await guard(() => removeMember(db, userId(locals), int(form, 'memberId')));
	},

	move: async ({ request, locals }) => {
		const form = await request.formData();
		await guard(() =>
			moveMember(db, userId(locals), int(form, 'memberId'), text(form, 'dir') === 'up' ? -1 : 1)
		);
	},

	related: async ({ request, locals, params }) => {
		const form = await request.formData();
		await guard(() =>
			setRelated(
				db,
				userId(locals),
				gid(params),
				int(form, 'otherId'),
				text(form, 'related') === 'true'
			)
		);
	}
};
