<script lang="ts">
	import { actionUrl, withParam } from '#lib/url.js';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Card from '#lib/components/Card.svelte';
	import { PARTS_OF_SPEECH } from '#lib/grammar.js';

	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let flipped = $state(false);
	let showFilters = $state(false);

	const here = $derived(page.url.pathname + page.url.search);
	/** The same practice run at another card. */
	const at = (i: number) => resolve(`/practice?${withParam(page.url.search, 'i', String(i))}`);
	// A new card always starts face down; a post that keeps the same card doesn't flip it.
	const cardId = $derived(data.card?.meaningId);
	$effect(() => {
		void cardId;
		flipped = false;
	});
	const card = $derived(data.card);
</script>

<svelte:head>
	<title>Practice · Otto</title>
</svelte:head>

<main class="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6 pb-24">
	<header class="flex items-center justify-between gap-2">
		<h1 class="text-lg font-semibold">Practice</h1>
		<button
			class="text-sm text-blue-700 hover:underline"
			onclick={() => (showFilters = !showFilters)}
		>
			{data.filter.direction === 'en_de'
				? 'English → German'
				: 'German → English'}{#if data.filter.tags.length}&ensp;·&ensp;{data.filter.tags.join(
					', '
				)}{/if}{#if data.filter.pos}&ensp;·&ensp;{data.filter.pos}{/if}&ensp;▾
		</button>
	</header>

	{#if showFilters || !data.total}
		<form method="GET" class="flex flex-col gap-3 rounded-xl border border-stone-200 p-4 text-sm">
			<fieldset class="flex flex-wrap gap-4">
				<legend class="mb-1 text-stone-500">Direction</legend>
				<label class="flex items-center gap-1">
					<input
						type="radio"
						name="dir"
						value="en_de"
						checked={data.filter.direction === 'en_de'}
					/>
					English → German
				</label>
				<label class="flex items-center gap-1">
					<input
						type="radio"
						name="dir"
						value="de_en"
						checked={data.filter.direction === 'de_en'}
					/>
					German → English
				</label>
			</fieldset>
			{#if data.allTags.length}
				<fieldset class="flex flex-wrap gap-3">
					<legend class="mb-1 text-stone-500">Tags (any)</legend>
					{#each data.allTags as tag (tag)}
						<label class="flex items-center gap-1">
							<input
								type="checkbox"
								name="tag"
								value={tag}
								checked={data.filter.tags.includes(tag)}
							/>
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
						<option value={p} selected={data.filter.pos === p}>{p}</option>
					{/each}
				</select>
			</label>
			<div>
				<button class="rounded-lg bg-stone-900 px-3 py-1.5 font-medium text-white">Start</button>
			</div>
		</form>
	{/if}

	{#if card}
		<p class="text-sm text-stone-500">
			Card {data.index + 1} of {data.total}. Practice doesn't record reviews yet; scheduled sessions
			come next.
		</p>
		<Card {card} direction={data.filter.direction} {flipped} returnTo={here} />

		{#if !flipped}
			<button
				class="rounded-lg bg-stone-900 px-4 py-3 font-medium text-white"
				onclick={() => (flipped = true)}
			>
				Flip
			</button>
		{:else}
			<div class="flex gap-2">
				{#if data.index > 0}
					<a href={at(data.index - 1)} class="rounded-lg border border-stone-300 px-4 py-3">←</a>
				{/if}
				{#if data.index + 1 < data.total}
					<a
						href={at(data.index + 1)}
						class="flex-1 rounded-lg bg-stone-900 px-4 py-3 text-center font-medium text-white"
					>
						Next
					</a>
				{:else}
					<span class="flex-1 rounded-lg bg-stone-100 px-4 py-3 text-center text-stone-600">
						That was the last card
					</span>
				{/if}
			</div>
		{/if}

		<div class="flex flex-wrap items-center gap-4 text-sm">
			<form method="POST" action={actionUrl(page.url.search, 'flag')} use:enhance>
				<input type="hidden" name="meaningId" value={card.meaningId} />
				<input type="hidden" name="flagged" value={String(!card.flagged)} />
				<button class="text-blue-700 hover:underline">
					{card.flagged ? '⚑ Unflag' : '⚐ Flag'}
				</button>
			</form>
			<form method="POST" action={actionUrl(page.url.search, 'known')} use:enhance>
				<input type="hidden" name="meaningId" value={card.meaningId} />
				<button class="text-blue-700 hover:underline">Mark known</button>
			</form>
			<a
				href={resolve(`/words/[id]?return=${encodeURIComponent(here)}`, {
					id: String(card.wordId)
				})}
				class="text-blue-700 hover:underline"
			>
				Edit word or meaning
			</a>
		</div>
	{:else}
		<p class="text-stone-600">
			No studying meanings match. <a
				href={resolve('/search')}
				class="text-blue-700 hover:underline"
			>
				Add some words
			</a> or change the filters.
		</p>
	{/if}
</main>
