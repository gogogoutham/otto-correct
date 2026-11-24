<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const TYPES = [
		{
			type: 'separable',
			title: 'Separable',
			blurb: 'Stressed. Splits off in main clauses; ge- and zu go between prefix and verb.',
			example: 'Ich komme an. angekommen, anzukommen'
		},
		{
			type: 'inseparable',
			title: 'Inseparable',
			blurb: 'Unstressed. Never splits. No ge- in Partizip II.',
			example: 'Ich verstehe. verstanden'
		},
		{
			type: 'either',
			title: 'Either (meaning decides)',
			blurb: 'Separable meanings are usually literal; inseparable ones figurative.',
			example: 'übersetzen: ferry across (übergesetzt) vs translate (übersetzt)'
		}
	] as const;
</script>

<svelte:head>
	<title>Verb prefixes · Otto</title>
</svelte:head>

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
	<a href={resolve('/groups')} class="text-sm text-blue-700 hover:underline">← Groups</a>
	<h1 class="text-xl font-semibold">Verb prefixes</h1>

	{#each TYPES as t (t.type)}
		<section class="flex flex-col gap-2">
			<h2 class="font-medium">{t.title}</h2>
			<p class="text-sm text-stone-600">{t.blurb} <i>{t.example}</i></p>
			<ul class="flex flex-wrap gap-2">
				{#each data.prefixes.filter((p) => p.type === t.type) as p (p.prefix)}
					<li>
						<a
							href={resolve('/prefixes/[prefix]', { prefix: p.prefix })}
							class="inline-flex items-baseline gap-1 rounded-lg border border-stone-200 px-3 py-1.5 hover:bg-stone-50"
						>
							<span class="font-medium">{p.prefix}-</span>
							{#if p.verbs}<span class="text-xs text-stone-500">{p.verbs}</span>{/if}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
	<p class="text-sm text-stone-500">
		The number is how many verbs with that prefix are in your words.
	</p>
</main>
