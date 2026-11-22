<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Card from '#lib/components/Card.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let flipped = $state(false);
	const here = $derived(page.url.pathname + page.url.search);
	const dirHref = (dir: string) =>
		resolve(`/cards/[id]?dir=${dir}`, { id: String(data.card.meaningId) });
</script>

<svelte:head>
	<title>{data.card.headword} card · Otto</title>
</svelte:head>

<main class="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6 pb-24">
	<nav class="flex items-center justify-between text-sm">
		<a
			href={resolve('/words/[id]', { id: String(data.card.wordId) })}
			class="text-blue-700 hover:underline"
		>
			← {data.card.headword}
		</a>
		<span class="flex gap-3">
			<a
				href={dirHref('en_de')}
				class={data.direction === 'en_de' ? 'font-medium' : 'text-blue-700 hover:underline'}
				onclick={() => (flipped = false)}
			>
				English → German
			</a>
			<a
				href={dirHref('de_en')}
				class={data.direction === 'de_en' ? 'font-medium' : 'text-blue-700 hover:underline'}
				onclick={() => (flipped = false)}
			>
				German → English
			</a>
		</span>
	</nav>
	<Card card={data.card} direction={data.direction} {flipped} returnTo={here} />
	<button
		class="rounded-lg bg-stone-900 px-4 py-3 font-medium text-white"
		onclick={() => (flipped = !flipped)}
	>
		{flipped ? 'Show front only' : 'Flip'}
	</button>
</main>
