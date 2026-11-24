<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const p = $derived(data.prefix);
	const wordHref = (id: number) => resolve('/words/[id]', { id: String(id) });
</script>

<svelte:head>
	<title>{p.prefix}- · Otto</title>
</svelte:head>

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
	<a href={resolve('/prefixes')} class="text-sm text-blue-700 hover:underline">← Verb prefixes</a>
	<header class="flex flex-col gap-1">
		<h1 class="text-2xl font-semibold">{p.prefix}-</h1>
		<p class="text-stone-600">{p.type === 'either' ? 'separable or inseparable' : p.type}</p>
		{#if p.note}<p class="text-stone-700">{p.note}</p>{/if}
	</header>

	{#each p.meanings as g (g.id)}
		<section class="flex flex-col gap-2">
			<h2 class="font-medium">
				<a href={resolve('/groups/[id]', { id: String(g.id) })} class="hover:underline">
					{g.label}
				</a>
				{#if g.qualifiedAt}<span class="text-sm font-normal text-green-700">· card</span>{/if}
			</h2>
			<ul class="flex flex-col gap-1 text-sm">
				{#each g.members as m (m.id)}
					<li class={m.deckStatus === 'not_in_deck' ? 'text-stone-400' : ''}>
						<a href={wordHref(m.wordId)} class="font-medium hover:underline">{m.display}</a>
						{#if m.prefixType}<span class="text-xs"> ({m.prefixType})</span>{/if}
						— {m.glosses.join('; ')}
						{#if m.deckStatus === 'not_in_deck'}
							<form method="POST" action="?/addToDeck" use:enhance class="inline">
								<input type="hidden" name="meaningId" value={m.meaningId} />
								<button class="text-xs text-blue-700 hover:underline">add to deck</button>
							</form>
						{:else if m.deckStatus === 'known'}<span class="text-xs text-green-700">known</span>
						{/if}
					</li>
				{:else}
					<li class="text-stone-400">No verbs yet.</li>
				{/each}
			</ul>
		</section>
	{/each}

	{#if p.otherVerbs.length}
		<section class="flex flex-col gap-2">
			<h2 class="font-medium">Your other {p.prefix}- verbs</h2>
			<p class="text-sm text-stone-600">
				Pick their prefix meaning on the word page to add them to a meaning above.
			</p>
			<ul class="flex flex-col gap-1 text-sm">
				{#each p.otherVerbs as v (v.wordId)}
					<li class={v.deckStatus === 'not_in_deck' ? 'text-stone-400' : ''}>
						<a href={wordHref(v.wordId)} class="font-medium hover:underline">{v.headword}</a>
						{#if v.gloss}— {v.gloss}{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<form method="POST" action="?/meaning" class="flex flex-wrap items-end gap-2">
		<label class="flex flex-col gap-1 text-sm">
			<span class="text-stone-500">New meaning of {p.prefix}-</span>
			<input name="label" class="rounded-lg border border-stone-300 px-3 py-1.5" />
		</label>
		<button class="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">Add</button>
	</form>
	{#if form?.message}<p class="text-sm text-red-700" role="alert">{form.message}</p>{/if}
</main>
