<script lang="ts">
	import { resolve } from '$app/paths';
	import DictionaryEntry from '#lib/components/DictionaryEntry.svelte';
	import PosLabel from '#lib/components/PosLabel.svelte';
	import { grammarSummary } from '#lib/grammar.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const { collection, dictionary } = $derived(data.results);
	const newWordHref = $derived(resolve(`/words/new?headword=${encodeURIComponent(data.q)}`));
</script>

<svelte:head>
	<title>{data.q ? `${data.q} · ` : ''}Search · Otto</title>
</svelte:head>

<datalist id="tag-options">
	{#each data.tags as tag (tag)}<option value={tag}></option>{/each}
</datalist>

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-24">
	{#if !data.q}
		<p class="text-stone-600">
			Search in German or English. Umlauts are optional: <em>fuer</em> or <em>fur</em> finds
			<em>für</em>, and inflected forms like <em>fuhr</em> find <em>fahren</em>.
		</p>
	{:else}
		{#if form?.message}<p class="text-red-700" role="alert">{form.message}</p>{/if}

		{#if collection.length}
			<section>
				<h2 class="mb-2 text-sm font-medium tracking-wide text-stone-500 uppercase">
					In your collection
				</h2>
				<ul class="flex flex-col divide-y divide-stone-100 rounded-xl border border-stone-200">
					{#each collection as w (w.id)}
						<li>
							<a
								href={resolve('/words/[id]', { id: String(w.id) })}
								class="flex flex-wrap items-baseline gap-x-2 px-4 py-3 hover:bg-stone-50"
							>
								<PosLabel headword={w.headword} pos={w.pos} grammar={w.grammar} />
								<span class="text-sm text-stone-500">
									{grammarSummary(w.pos, w.grammar, w.headword)}
								</span>
								<span class="w-full truncate text-sm text-stone-700">
									{w.meanings.map((m) => m.glosses[0]).join(' · ')}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-medium tracking-wide text-stone-500 uppercase">Dictionary</h2>
			{#each dictionary as hit (hit.id)}
				<DictionaryEntry {hit} />
			{/each}

			{#if data.remote}
				{#await data.remote}
					<p class="text-stone-500">Looking up “{data.q}” on Wiktionary…</p>
				{:then remote}
					{#each remote.hits.filter((h) => !dictionary.some((d) => d.id === h.id)) as hit (hit.id)}
						<DictionaryEntry {hit} />
					{:else}
						{#if remote.unavailable}
							<p class="text-stone-600">
								Wiktionary couldn't be reached, so only the word bank was searched.
							</p>
						{:else if !dictionary.length}
							<p class="text-stone-600">No dictionary entry for “{data.q}”.</p>
						{/if}
					{/each}
				{/await}
			{:else if !dictionary.length}
				<p class="text-stone-600">No dictionary entry for “{data.q}”.</p>
			{/if}
		</section>

		<p class="text-sm text-stone-600">
			Not what you need? <a href={newWordHref} class="text-blue-700 hover:underline">
				Create “{data.q}” by hand
			</a>.
		</p>
	{/if}
</main>
