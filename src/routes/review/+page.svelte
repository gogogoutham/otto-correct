<script lang="ts">
	import { resolve } from '$app/paths';
	import { PARTS_OF_SPEECH } from '#lib/grammar.js';
	import type { Choice } from './+page.server';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Review · Otto</title>
</svelte:head>

{#snippet choiceRow(c: Choice)}
	<li>
		{#if c.count}
			<a
				href={resolve(`/study?${c.query}`)}
				class="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-3 hover:bg-stone-50"
			>
				<span>
					<span class="font-medium">{c.label}</span>
					{#if c.detail}<span class="block text-sm text-stone-500">{c.detail}</span>{/if}
				</span>
				<span class="shrink-0 rounded-full bg-stone-900 px-2.5 py-0.5 text-sm text-white">
					{c.count}
				</span>
			</a>
		{:else}
			<div
				class="flex items-center justify-between gap-3 rounded-xl border border-stone-100 p-3 text-stone-400"
			>
				<span>
					<span class="font-medium">{c.label}</span>
					{#if c.detail}<span class="block text-sm">{c.detail}</span>{/if}
				</span>
				<span class="shrink-0 text-sm">0</span>
			</div>
		{/if}
	</li>
{/snippet}

<main class="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6">
	<h1 class="text-xl font-semibold">Review and cram</h1>

	<form method="GET" class="flex flex-col gap-3 rounded-xl border border-stone-200 p-4 text-sm">
		<fieldset class="flex flex-wrap gap-4">
			<legend class="mb-1 text-stone-500">Direction</legend>
			<label class="flex items-center gap-1">
				<input type="radio" name="dir" value="en_de" checked={data.direction === 'en_de'} />
				English → German
			</label>
			<label class="flex items-center gap-1">
				<input type="radio" name="dir" value="de_en" checked={data.direction === 'de_en'} />
				German → English
			</label>
		</fieldset>
		<fieldset class="flex flex-wrap gap-4">
			<legend class="mb-1 text-stone-500">Order</legend>
			<label class="flex items-center gap-1">
				<input
					type="radio"
					name="order"
					value="oldest_first"
					checked={data.order === 'oldest_first'}
				/>
				Oldest first
			</label>
			<label class="flex items-center gap-1">
				<input type="radio" name="order" value="shuffled" checked={data.order === 'shuffled'} />
				Shuffled
			</label>
		</fieldset>
		{#if data.allTags.length}
			<fieldset class="flex flex-wrap gap-3">
				<legend class="mb-1 text-stone-500">Tags (any)</legend>
				{#each data.allTags as tag (tag)}
					<label class="flex items-center gap-1">
						<input type="checkbox" name="tag" value={tag} checked={data.tags.includes(tag)} />
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
					<option value={p} selected={data.pos === p}>{p}</option>
				{/each}
			</select>
		</label>
		<fieldset class="flex flex-wrap items-center gap-2">
			<legend class="mb-1 text-stone-500">Custom range (first seen)</legend>
			<input
				type="date"
				name="from"
				value={data.custom?.from ?? ''}
				max={data.today}
				aria-label="From"
				class="rounded-lg border border-stone-300 px-2 py-1"
			/>
			<span>to</span>
			<input
				type="date"
				name="to"
				value={data.custom?.to ?? ''}
				max={data.today}
				aria-label="To"
				class="rounded-lg border border-stone-300 px-2 py-1"
			/>
		</fieldset>
		<div>
			<button class="rounded-lg bg-stone-900 px-3 py-1.5 font-medium text-white">
				Update counts
			</button>
		</div>
	</form>

	<section class="flex flex-col gap-2">
		<h2 class="font-medium">Review</h2>
		<p class="text-sm text-stone-600">
			Cards by the day you first saw them. Cards you already reviewed today are left out.
		</p>
		<ul class="flex flex-col gap-2">
			{#each data.reviews as c (c.label)}{@render choiceRow(c)}{/each}
			{#if data.customChoice}{@render choiceRow(data.customChoice)}{/if}
		</ul>
	</section>

	<section class="flex flex-col gap-2">
		<h2 class="font-medium">Cram</h2>
		<p class="text-sm text-stone-600">Everything, ignoring the schedule.</p>
		<ul class="flex flex-col gap-2">
			{#each data.cram as c (c.label)}{@render choiceRow(c)}{/each}
		</ul>
	</section>
</main>
