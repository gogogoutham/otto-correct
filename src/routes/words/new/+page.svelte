<script lang="ts">
	import { enhance } from '$app/forms';
	import GrammarFields from '#lib/components/GrammarFields.svelte';
	import { GRAMMAR_FIELDS, PARTS_OF_SPEECH, type PartOfSpeech } from '#lib/grammar.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pos = $state<PartOfSpeech>('noun');
	const inputClass = 'rounded-lg border border-stone-300 px-3 py-2';
</script>

<svelte:head>
	<title>New word · Otto</title>
</svelte:head>

<datalist id="tag-options">
	{#each data.tags as tag (tag)}<option value={tag}></option>{/each}
</datalist>

<main class="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 pb-24">
	<h1 class="text-xl font-semibold">Create a word by hand</h1>
	<p class="text-sm text-stone-600">
		For words the dictionary doesn't have. Every field you fill in counts as your own and is never
		overwritten.
	</p>
	{#if form?.message}<p class="text-red-700" role="alert">{form.message}</p>{/if}

	<form method="POST" use:enhance class="flex flex-col gap-4">
		<div class="grid gap-3 sm:grid-cols-[1fr_auto]">
			<label class="flex flex-col gap-1">
				<span class="text-sm text-stone-600">Word</span>
				<input
					name="headword"
					value={data.headword}
					required
					data-german
					autocapitalize="none"
					class={inputClass}
				/>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm text-stone-600">Part of speech</span>
				<select name="pos" bind:value={pos} class={inputClass}>
					{#each PARTS_OF_SPEECH as p (p)}<option value={p}>{p}</option>{/each}
				</select>
			</label>
		</div>

		{#if GRAMMAR_FIELDS[pos].length}
			<fieldset class="rounded-xl border border-stone-200 p-4">
				<legend class="px-1 text-sm text-stone-600">Grammar</legend>
				{#key pos}<GrammarFields fields={GRAMMAR_FIELDS[pos]} />{/key}
			</fieldset>
		{/if}

		<label class="flex flex-col gap-1">
			<span class="text-sm text-stone-600">
				Translation <span class="text-stone-400">(separate several with ;)</span>
			</span>
			<input name="gloss" required class={inputClass} />
		</label>
		<label class="flex flex-col gap-1">
			<span class="text-sm text-stone-600">Context label (optional)</span>
			<input name="contextLabel" class={inputClass} />
		</label>
		<input
			name="exampleGerman"
			placeholder="Example in German (optional)"
			data-german
			class={inputClass}
		/>
		<input name="exampleEnglish" placeholder="Example in English (optional)" class={inputClass} />
		<input
			name="tags"
			list="tag-options"
			placeholder="Tags, comma separated"
			autocapitalize="none"
			class={inputClass}
		/>
		<div class="flex items-center gap-3">
			<select name="status" aria-label="Deck status" class={inputClass}>
				<option value="studying">Study</option>
				<option value="known">Known</option>
			</select>
			<button class="rounded-lg bg-stone-900 px-4 py-2 font-medium text-white">Create word</button>
		</div>
	</form>
</main>
