<!--
	A dictionary entry with its meanings. Pick, per meaning, whether to study it or mark it
	known, add tags, and add them all at once.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { grammarSummary, meaningGrammarSummary } from '#lib/grammar.js';
	import type { DictionaryHit } from '#lib/server/search.js';
	import PosLabel from './PosLabel.svelte';

	let {
		hit,
		action = '?/add',
		showHeader = true
	}: { hit: DictionaryHit; action?: string; showHeader?: boolean } = $props();

	let choice = $state<Record<number, '' | 'studying' | 'known'>>({});
	let busy = $state(false);
	const chosen = $derived(Object.values(choice).filter(Boolean).length);
	const summary = $derived(grammarSummary(hit.pos, hit.grammar));
	const open = $derived(hit.senses.filter((s) => !s.inCollection));

	const options = [
		{ value: '', label: 'Skip' },
		{ value: 'studying', label: 'Study' },
		{ value: 'known', label: 'Known' }
	] as const;
</script>

<article class="rounded-xl border border-stone-200 p-4">
	{#if showHeader}<header class="mb-2 flex flex-wrap items-baseline gap-x-2">
			<PosLabel headword={hit.headword} pos={hit.pos} grammar={hit.grammar} />
			{#if summary}<span class="text-sm text-stone-600">{summary}</span>{/if}
			{#if hit.wordId}
				<a
					href={resolve('/words/[id]', { id: String(hit.wordId) })}
					class="ml-auto text-sm text-blue-700 hover:underline"
				>
					In your collection →
				</a>
			{/if}
		</header>{/if}

	<form
		method="POST"
		{action}
		use:enhance={() => {
			busy = true;
			return async ({ update }) => {
				await update();
				busy = false;
			};
		}}
	>
		<input type="hidden" name="dictWordId" value={hit.id} />
		<ol class="flex flex-col divide-y divide-stone-100">
			{#each hit.senses as sense, i (sense.id)}
				{@const extra = meaningGrammarSummary(sense.details)}
				<li class="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between">
					<div class="min-w-0 {sense.inCollection ? 'text-stone-400' : ''}">
						<p>
							<span class="mr-1 text-sm text-stone-400">{i + 1}.</span>{sense.glosses.join('; ')}
							{#if extra}<span class="ml-1 text-sm text-stone-500">({extra})</span>{/if}
						</p>
						{#if sense.example}
							<p class="mt-0.5 text-sm text-stone-500 italic">
								{sense.example.german}{#if sense.example.english}
									<span class="not-italic">&ensp;{sense.example.english}</span>{/if}
							</p>
						{/if}
					</div>
					{#if sense.inCollection}
						<span class="shrink-0 text-sm text-stone-400">✓ added</span>
					{:else}
						<fieldset
							class="flex shrink-0 overflow-hidden rounded-lg border border-stone-300 text-sm"
						>
							<legend class="sr-only">Meaning {i + 1}</legend>
							{#each options as o (o.value)}
								<label
									class="cursor-pointer px-3 py-1.5 has-checked:bg-stone-900 has-checked:text-white"
								>
									<input
										type="radio"
										class="sr-only"
										name="sense-{sense.id}"
										value={o.value}
										checked={(choice[sense.id] ?? '') === o.value}
										onchange={() => (choice[sense.id] = o.value)}
									/>{o.label}
								</label>
							{/each}
						</fieldset>
					{/if}
				</li>
			{/each}
		</ol>

		{#if open.length}
			<div class="mt-3 flex flex-col gap-2 sm:flex-row">
				<input
					name="tags"
					list="tag-options"
					placeholder="Tags, comma separated"
					aria-label="Tags"
					autocapitalize="none"
					class="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2"
				/>
				<button
					disabled={busy}
					class="rounded-lg bg-stone-900 px-4 py-2 font-medium text-white disabled:opacity-40"
				>
					{busy ? 'Adding…' : chosen ? `Add ${chosen} meaning${chosen > 1 ? 's' : ''}` : 'Add'}
				</button>
			</div>
		{/if}
	</form>
</article>
