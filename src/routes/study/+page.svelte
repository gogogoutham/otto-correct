<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Card from '#lib/components/Card.svelte';
	import GroupCard from '#lib/components/GroupCard.svelte';
	import { PARTS_OF_SPEECH } from '#lib/grammar.js';
	import { anchorParams, sessionTitle } from '#lib/session-params.js';
	import { actionUrl } from '#lib/url.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let flipped = $state(false);
	let showFilters = $state(false);
	let busy = $state(false);

	const s = $derived(data.session);
	const here = $derived(page.url.pathname + page.url.search);
	/** The session's own settings, kept when the filters change. */
	const fixed = $derived.by(() => {
		const sel = s.selection;
		const out: [string, string][] = [['type', sel.type]];
		if (sel.type === 'review')
			out.push(...Object.entries(anchorParams(sel.anchor)), ['order', sel.order]);
		if (sel.type === 'cram') {
			out.push(['order', sel.order]);
			if (sel.includeKnown) out.push(['known', '1']);
		}
		return out;
	});
	// A new card always starts face down; a post that keeps the same card doesn't flip it.
	const cardId = $derived(data.cardId);
	$effect(() => {
		void cardId;
		flipped = false;
	});
</script>

<svelte:head>
	<title>{sessionTitle(s.selection)} · Otto</title>
</svelte:head>

<main class="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6 pb-24">
	<header class="flex flex-wrap items-baseline justify-between gap-2">
		<h1 class="text-lg font-semibold">{sessionTitle(s.selection)}</h1>
		<button
			class="text-sm text-blue-700 hover:underline"
			onclick={() => (showFilters = !showFilters)}
		>
			{s.direction === 'en_de'
				? 'English → German'
				: 'German → English'}{#if s.tags.length}&ensp;·&ensp;{s.tags.join(
					', '
				)}{/if}{#if s.pos}&ensp;·&ensp;{s.pos}{/if}&ensp;▾
		</button>
	</header>

	{#if showFilters}
		<form method="GET" class="flex flex-col gap-3 rounded-xl border border-stone-200 p-4 text-sm">
			{#each fixed as [name, value] (name)}<input type="hidden" {name} {value} />{/each}
			<fieldset class="flex flex-wrap gap-4">
				<legend class="mb-1 text-stone-500">Direction</legend>
				<label class="flex items-center gap-1">
					<input type="radio" name="dir" value="en_de" checked={s.direction === 'en_de'} />
					English → German
				</label>
				<label class="flex items-center gap-1">
					<input type="radio" name="dir" value="de_en" checked={s.direction === 'de_en'} />
					German → English
				</label>
			</fieldset>
			{#if data.allTags.length}
				<fieldset class="flex flex-wrap gap-3">
					<legend class="mb-1 text-stone-500">Tags (any)</legend>
					{#each data.allTags as tag (tag)}
						<label class="flex items-center gap-1">
							<input type="checkbox" name="tag" value={tag} checked={s.tags.includes(tag)} />
							{tag}
						</label>
					{/each}
				</fieldset>
			{/if}
			<label class="flex items-center gap-2">
				<span class="text-stone-500">Part of speech</span>
				<select name="pos" class="rounded-lg border border-stone-300 px-2 py-1">
					<option value="">any</option>
					{#each PARTS_OF_SPEECH as p (p)}
						<option value={p} selected={s.pos === p}>{p}</option>
					{/each}
				</select>
			</label>
			<div>
				<button class="rounded-lg bg-stone-900 px-3 py-1.5 font-medium text-white">Apply</button>
			</div>
		</form>
	{/if}

	{#if (data.card || data.group) && data.cardId}
		<p class="text-sm text-stone-500">{data.left} left</p>
		{#if data.card}
			<Card card={data.card} direction={s.direction} {flipped} returnTo={here} />
		{:else if data.group}
			<GroupCard group={data.group} {flipped} returnTo={here} />
		{/if}

		{#if !flipped}
			<button
				class="rounded-lg bg-stone-900 px-4 py-3 font-medium text-white"
				onclick={() => (flipped = true)}
			>
				Flip
			</button>
		{:else}
			<form
				method="POST"
				action={actionUrl(page.url.search, 'reviewed')}
				use:enhance={() => {
					busy = true;
					return async ({ update }) => {
						await update();
						busy = false;
					};
				}}
			>
				<input type="hidden" name="cardId" value={data.cardId} />
				<input type="hidden" name="direction" value={s.direction} />
				<input type="hidden" name="sessionType" value={s.selection.type} />
				<button
					disabled={busy}
					class="w-full rounded-lg bg-stone-900 px-4 py-3 font-medium text-white disabled:opacity-50"
				>
					Reviewed · next
				</button>
			</form>
		{/if}

		<div class="flex flex-wrap items-center gap-4 text-sm">
			<form method="POST" action={actionUrl(page.url.search, 'flag')} use:enhance>
				{#if data.card}
					<input type="hidden" name="meaningId" value={data.card.meaningId} />
				{:else}
					<input type="hidden" name="cardId" value={data.cardId} />
				{/if}
				<input type="hidden" name="flagged" value={String(!data.flagged)} />
				<button class="text-blue-700 hover:underline">
					{data.flagged ? '⚑ Unflag' : '⚐ Flag'}
				</button>
			</form>
			{#if data.card}
				<form method="POST" action={actionUrl(page.url.search, 'known')} use:enhance>
					<input type="hidden" name="meaningId" value={data.card.meaningId} />
					<button class="text-blue-700 hover:underline">Mark known</button>
				</form>
				<a
					href={resolve(`/words/[id]?return=${encodeURIComponent(here)}`, {
						id: String(data.card.wordId)
					})}
					class="text-blue-700 hover:underline"
				>
					Edit word or meaning
				</a>
			{:else if data.group}
				<a
					href={resolve(`/groups/[id]?return=${encodeURIComponent(here)}`, {
						id: String(data.group.id)
					})}
					class="text-blue-700 hover:underline"
				>
					Edit group
				</a>
			{/if}
			<a href={resolve('/')} class="ml-auto text-stone-500 hover:underline">Pause</a>
		</div>
	{:else}
		<section class="flex flex-col gap-2 rounded-xl border border-stone-200 p-5 text-center">
			<p class="font-medium">Nothing left here for now.</p>
			<p class="text-sm text-stone-600">
				{#if s.selection.type === 'new'}
					Today's new cards are done. More arrive tomorrow.
				{:else}
					Every card in this selection has been reviewed today.
				{/if}
			</p>
			<p class="flex justify-center gap-4 text-sm">
				<a href={resolve('/')} class="text-blue-700 hover:underline">Home</a>
				<a href={resolve('/review')} class="text-blue-700 hover:underline">Review or cram</a>
			</p>
		</section>
	{/if}
</main>
