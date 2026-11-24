<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { GroupSummary } from '#lib/server/groups.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let loading = $state(false);

	const SECTIONS: { kind: GroupSummary['kind']; title: string; blurb: string }[] = [
		{
			kind: 'contrast',
			title: 'Contrast groups',
			blurb: 'The German words for one English idea, with when to use each.'
		},
		{
			kind: 'prefix_meaning',
			title: 'Prefix meanings',
			blurb: 'Verbs that share what their prefix means.'
		},
		{
			kind: 'verb_family',
			title: 'Verb families',
			blurb: 'Prefixed verbs built on the same base verb. Made automatically.'
		}
	];
	// Families are listed under their own heading, so the bare base verb is enough.
	const title = (g: GroupSummary) =>
		g.kind === 'prefix_meaning' && g.prefix ? `${g.prefix}-: ${g.label}` : g.label;
	const hasStarter = $derived(data.groups.some((g) => g.kind !== 'verb_family'));
</script>

<svelte:head>
	<title>Groups · Otto</title>
</svelte:head>

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
	<header class="flex flex-wrap items-baseline justify-between gap-2">
		<h1 class="text-xl font-semibold">Groups</h1>
		<a href={resolve('/prefixes')} class="text-sm text-blue-700 hover:underline">Verb prefixes →</a>
	</header>

	<p class="text-sm text-stone-600">
		A group gets its own card once two of its members are in your deck. Group cards appear in
		English → German sessions.
	</p>

	{#if form?.starter}
		<p class="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-900" role="status">
			{#if form.starter.groups}
				Added {form.starter.groups} groups with {form.starter.members} members, all greyed out until you
				add them to your deck.
			{:else}
				The starter groups are already loaded.
			{/if}
			{#if form.starter.missing.length}
				Not in the word bank, so left out: {form.starter.missing.join(', ')}.
			{/if}
		</p>
	{/if}
	{#if form?.message}
		<p class="rounded-lg bg-red-50 px-4 py-2 text-red-900" role="alert">{form.message}</p>
	{/if}

	<div class="flex flex-wrap items-end gap-3">
		<form method="POST" action="?/create" class="flex flex-wrap items-end gap-2">
			<label class="flex flex-col gap-1 text-sm">
				<span class="text-stone-500">New contrast group</span>
				<input
					name="label"
					placeholder="e.g. to (a place)"
					class="rounded-lg border border-stone-300 px-3 py-1.5"
				/>
			</label>
			<button class="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">
				Create
			</button>
		</form>
		<form
			method="POST"
			action="?/starter"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					await update();
					loading = false;
				};
			}}
		>
			<button
				disabled={loading}
				class="rounded-lg border border-stone-300 px-3 py-1.5 text-sm disabled:opacity-50"
			>
				{loading ? 'Loading…' : hasStarter ? 'Load missing starter groups' : 'Load starter groups'}
			</button>
		</form>
	</div>

	{#each SECTIONS as section (section.kind)}
		{@const groups = data.groups.filter((g) => g.kind === section.kind)}
		<section class="flex flex-col gap-2">
			<h2 class="font-medium">{section.title}</h2>
			<p class="text-sm text-stone-600">{section.blurb}</p>
			{#if groups.length}
				<ul class="divide-y divide-stone-100 rounded-xl border border-stone-200">
					{#each groups as g (g.id)}
						<li>
							<a
								href={resolve('/groups/[id]', { id: String(g.id) })}
								class="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50"
							>
								<span>{title(g)}</span>
								<span class="shrink-0 text-sm text-stone-500">
									{g.inDeck}/{g.members} in deck{#if g.qualified}&ensp;·&ensp;<span
											class="text-green-700"
										>
											card
										</span>{/if}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-sm text-stone-400">None yet.</p>
			{/if}
		</section>
	{/each}
</main>
