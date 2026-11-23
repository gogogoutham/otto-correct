<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const c = $derived(data.counts);
</script>

<svelte:head>
	<title>Otto</title>
</svelte:head>

<main class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-6 text-xl font-semibold">Hallo, {data.user?.username}</h1>

	{#if data.timeZone === 'UTC'}
		<p class="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-900">
			Your day starts at midnight UTC. <a href={resolve('/settings')} class="underline">
				Set your time zone
			</a> so new cards arrive at your midnight.
		</p>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2">
		<a
			href={resolve('/study?type=new')}
			class="flex flex-col gap-1 rounded-xl border border-stone-200 p-4 hover:bg-stone-50"
		>
			<h2 class="flex items-baseline justify-between font-medium">
				New cards <span class="text-2xl font-semibold">{c.newToday}</span>
			</h2>
			<p class="text-sm text-stone-600">
				{#if c.newToday}
					Ready today, up to {data.dailyNewLimit} a day.
				{:else}
					Done for today. More arrive tomorrow.
				{/if}
			</p>
		</a>
		<a
			href={resolve('/review')}
			class="flex flex-col gap-1 rounded-xl border border-stone-200 p-4 hover:bg-stone-50"
		>
			<h2 class="flex items-baseline justify-between font-medium">
				Review
				{#if c.neverRevisited}<span class="text-2xl font-semibold">{c.neverRevisited}</span>{/if}
			</h2>
			<p class="text-sm text-stone-600">
				{#if c.neverRevisited}
					{c.neverRevisited === 1 ? 'card' : 'cards'} seen once and never revisited. Pick a window or
					cram.
				{:else}
					Pick a window by when you first saw the cards, or cram.
				{/if}
			</p>
		</a>
		<a
			href={resolve('/search')}
			class="rounded-xl border border-stone-200 p-4 hover:bg-stone-50 sm:col-span-2"
		>
			<h2 class="font-medium">Add words</h2>
			<p class="mt-1 text-sm text-stone-600">
				Search the dictionary in German or English and pick the meanings to learn.
			</p>
		</a>
	</div>

	<p class="mt-6 text-sm text-stone-500">
		{c.studying} studying · {c.known} known · {c.reviewedToday} reviewed today
	</p>
</main>
