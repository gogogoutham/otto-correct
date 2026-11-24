<script lang="ts">
	import { actionUrl } from '#lib/url.js';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import DictionaryEntry from '#lib/components/DictionaryEntry.svelte';
	import GrammarFields from '#lib/components/GrammarFields.svelte';
	import PosLabel from '#lib/components/PosLabel.svelte';
	import {
		GRAMMAR_FIELDS,
		grammarDefaults,
		grammarSummary,
		meaningFields,
		type Grammar
	} from '#lib/grammar.js';
	import { meaningUsage } from '#lib/card-back.js';
	import { page } from '$app/state';
	import type { DictionaryHit } from '#lib/server/search.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const w = $derived(data.word);
	const grammar = $derived(w.grammar as Grammar);
	const summary = $derived(grammarSummary(w.pos, grammar, w.headword));
	const fields = $derived(GRAMMAR_FIELDS[w.pos]);
	/** Where to go back to when this page was opened from a study session. */
	const returnTo = $derived.by(() => {
		const r = page.url.searchParams.get('return') ?? '';
		return r.startsWith('/study') || r.startsWith('/cards/')
			? // One member of the union: resolve() can't take the whole union at once.
				(r as `/study?${string}`)
			: null;
	});

	const day = (d: Date | string | null) =>
		d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';

	const STATUS_LABEL = { studying: 'Studying', known: 'Known', not_in_deck: 'Not in deck' };

	const more = $derived<DictionaryHit | null>(
		w.dictWordId && data.sourceSenses.length
			? {
					id: w.dictWordId,
					headword: w.headword,
					pos: w.pos,
					grammar,
					wordId: w.id,
					match: 'headword',
					senses: data.sourceSenses.map((s) => ({
						id: s.id,
						glosses: s.glosses,
						details: s.details as Record<string, unknown>,
						example: null,
						inCollection: false
					}))
				}
			: null
	);
	const homographs = $derived([
		...data.homographs.collection.map((h) => ({
			key: `w${h.id}`,
			label: h.headword,
			pos: h.pos,
			href: resolve('/words/[id]', { id: String(h.id) }),
			note: 'in your collection'
		})),
		...data.homographs.dictionary.map((h) => ({
			key: `d${h.id}`,
			label: h.headword,
			pos: h.pos,
			href: resolve(`/search?q=${encodeURIComponent(h.headword)}`),
			note: h.firstGloss ?? ''
		}))
	]);

	const inputClass = 'rounded-lg border border-stone-300 px-3 py-1.5';
	const buttonClass = 'rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white';
</script>

<svelte:head>
	<title>{w.headword} · Otto</title>
</svelte:head>

<datalist id="tag-options">
	{#each data.tags as tag (tag)}<option value={tag}></option>{/each}
</datalist>

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-24">
	{#if returnTo}
		<a href={resolve(returnTo)} class="text-sm text-blue-700 hover:underline">← Back to the card</a>
	{/if}
	{#if data.added}
		<p class="rounded-lg bg-green-50 px-4 py-2 text-green-900" role="status">
			Added {data.added} meaning{data.added > 1 ? 's' : ''}.
		</p>
	{/if}
	{#if form && 'message' in form && form.message}
		<p class="text-red-700" role="alert">{form.message}</p>
	{/if}

	<header class="flex flex-col gap-1">
		<h1 class="text-2xl"><PosLabel headword={w.headword} pos={w.pos} {grammar} /></h1>
		{#if summary}<p class="text-stone-700">{summary}</p>{/if}
		<p class="text-sm text-stone-500">
			Added {day(w.createdAt)} ·
			{#if w.dictWordId}
				from Wiktionary{#if w.sourceSyncedAt}, synced {day(w.sourceSyncedAt)}{/if}
			{:else}
				created by hand
			{/if}
		</p>
		{#if homographs.length}
			<p class="text-sm">
				<span class="text-stone-500">Same spelling:</span>
				{#each homographs as h, i (h.key)}
					{#if i},
					{/if}<a href={h.href} class="text-blue-700 hover:underline">
						{h.label} ({h.pos})
					</a>{#if h.note}<span class="text-stone-500"> {h.note}</span>{/if}
				{/each}
			</p>
		{/if}
	</header>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-medium tracking-wide text-stone-500 uppercase">Meanings</h2>
		{#each data.meanings as m (m.id)}
			{@const extra = meaningUsage(m.grammar as Grammar).join(' · ')}
			<article class="flex flex-col gap-2 rounded-xl border border-stone-200 p-4">
				<div class="flex flex-wrap items-start justify-between gap-2">
					<div class="min-w-0">
						<p class="font-medium">{m.glosses.join('; ')}</p>
						{#if m.contextLabel || extra}
							<p class="text-sm text-stone-500">
								{[m.contextLabel, extra].filter(Boolean).join(' · ')}
							</p>
						{/if}
					</div>
					<form method="POST" action={actionUrl(page.url.search, 'status')} use:enhance>
						<input type="hidden" name="meaningId" value={m.id} />
						<select
							name="status"
							aria-label="Deck status"
							class="rounded-lg border border-stone-300 px-2 py-1 text-sm"
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						>
							{#each Object.entries(STATUS_LABEL) as [value, label] (value)}
								<option {value} selected={m.deckStatus === value}>{label}</option>
							{/each}
						</select>
					</form>
				</div>

				{#if data.prefixMeanings?.options.length}
					<form
						method="POST"
						action={actionUrl(page.url.search, 'prefixMeaning')}
						use:enhance
						class="flex flex-wrap items-center gap-2 text-sm"
					>
						<input type="hidden" name="meaningId" value={m.id} />
						<label for="prefix-meaning-{m.id}" class="text-stone-500">
							{data.prefixMeanings.prefix}- here means
						</label>
						<select
							id="prefix-meaning-{m.id}"
							name="groupId"
							class="rounded-lg border border-stone-300 px-2 py-1"
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						>
							<option value="">not set</option>
							{#each data.prefixMeanings.options as o (o.id)}
								<option value={o.id} selected={data.prefixMeanings.byMeaning[m.id] === o.id}>
									{o.label}
								</option>
							{/each}
						</select>
					</form>
				{/if}

				{#if data.groupsByMeaning[m.id]?.length}
					<p class="text-sm">
						<span class="text-stone-500">In groups:</span>
						{#each data.groupsByMeaning[m.id] as g, i (g.id)}{#if i},&#32;{/if}<a
								href={resolve('/groups/[id]', { id: String(g.id) })}
								class="text-blue-700 hover:underline"
							>
								{g.title}
							</a>{/each}
					</p>
				{/if}

				{#if m.tags.length}
					<ul class="flex flex-wrap gap-1">
						{#each m.tags as t (t)}
							<li class="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{t}</li>
						{/each}
					</ul>
				{/if}

				{#if m.examples.length}
					<ul class="flex flex-col gap-1">
						{#each m.examples as ex (ex.id)}
							<li class="flex items-start justify-between gap-2 text-sm">
								<span>
									<span class="italic">{ex.german}</span>
									{#if ex.english}<span class="text-stone-500">&ensp;{ex.english}</span>{/if}
								</span>
								<form
									method="POST"
									action={actionUrl(page.url.search, 'deleteExample')}
									use:enhance
								>
									<input type="hidden" name="exampleId" value={ex.id} />
									<button class="text-stone-400 hover:text-red-700" aria-label="Delete example">
										✕
									</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}

				<p class="text-xs text-stone-400">
					Added {day(m.addedAt)}{#if m.lastReviewedAt}
						· last reviewed {day(m.lastReviewedAt)}{/if}
				</p>

				<div class="flex flex-wrap gap-4 text-sm">
					<a
						href={resolve('/cards/[id]', { id: String(m.id) })}
						class="text-blue-700 hover:underline"
					>
						See the card
					</a>
					<details class="w-full">
						<summary class="cursor-pointer text-blue-700">Edit meaning</summary>
						<form
							method="POST"
							action={actionUrl(page.url.search, 'meaning')}
							use:enhance={() =>
								({ update }) =>
									update({ reset: false })}
							class="mt-2 flex flex-col gap-3"
						>
							<input type="hidden" name="meaningId" value={m.id} />
							<label class="flex flex-col gap-1">
								<span class="text-stone-600">
									Translations <span class="text-stone-400">
										(one per line)
									</span>{#if m.manualFields.includes('glosses')}<span
											class="ml-1 text-xs text-amber-700"
										>
											edited
										</span>{/if}
								</span>
								<textarea name="glosses" rows={Math.max(2, m.glosses.length)} class={inputClass}
									>{m.glosses.join('\n')}</textarea
								>
							</label>
							<label class="flex flex-col gap-1">
								<span class="text-stone-600">Context label</span>
								<input
									name="contextLabel"
									value={m.contextLabel ?? ''}
									placeholder="e.g. to (cities/countries)"
									class={inputClass}
								/>
							</label>
							<label class="flex flex-col gap-1">
								<span class="text-stone-600">Tags</span>
								<input
									name="tags"
									list="tag-options"
									value={m.tags.join(', ')}
									autocapitalize="none"
									class={inputClass}
								/>
							</label>
							<GrammarFields
								fields={meaningFields(w.pos)}
								values={m.grammar as Grammar}
								manual={m.manualFields}
								prefix="m-"
							/>
							<div><button class={buttonClass}>Save</button></div>
						</form>
					</details>
					<details class="w-full">
						<summary class="cursor-pointer text-blue-700">Add example</summary>
						<form
							method="POST"
							action={actionUrl(page.url.search, 'addExample')}
							use:enhance
							class="mt-2 flex flex-col gap-2"
						>
							<input type="hidden" name="meaningId" value={m.id} />
							<input
								name="german"
								placeholder="German sentence"
								required
								data-german
								class={inputClass}
							/>
							<input name="english" placeholder="English (optional)" class={inputClass} />
							<div><button class={buttonClass}>Add example</button></div>
						</form>
					</details>
				</div>
			</article>
		{:else}
			<p class="text-stone-600">No meanings yet.</p>
		{/each}
	</section>

	{#if more}
		<section class="flex flex-col gap-2">
			<h2 class="text-sm font-medium tracking-wide text-stone-500 uppercase">
				More meanings in the dictionary
			</h2>
			<DictionaryEntry
				hit={more}
				action={actionUrl(page.url.search, 'addSenses')}
				showHeader={false}
			/>
		</section>
	{/if}

	<details class="rounded-xl border border-stone-200 p-4">
		<summary class="cursor-pointer font-medium">Add your own meaning</summary>
		<form
			method="POST"
			action={actionUrl(page.url.search, 'addMeaning')}
			use:enhance
			class="mt-3 flex flex-col gap-3"
		>
			<input
				name="gloss"
				placeholder="Translation (separate several with ;)"
				required
				class={inputClass}
			/>
			<input name="contextLabel" placeholder="Context label (optional)" class={inputClass} />
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
				<select
					name="status"
					aria-label="Deck status"
					class="rounded-lg border border-stone-300 px-2 py-1.5"
				>
					<option value="studying">Study</option>
					<option value="known">Known</option>
				</select>
				<button class={buttonClass}>Add meaning</button>
			</div>
		</form>
	</details>

	<details class="rounded-xl border border-stone-200 p-4">
		<summary class="cursor-pointer font-medium">Edit word</summary>
		<form
			method="POST"
			action={actionUrl(page.url.search, 'grammar')}
			use:enhance={() =>
				({ update }) =>
					update({ reset: false })}
			class="mt-3 flex flex-col gap-3"
		>
			<label class="flex flex-col gap-1">
				<span class="text-sm text-stone-600">
					Spelling{#if w.manualFields.includes('headword')}<span
							class="ml-1 text-xs text-amber-700"
						>
							edited
						</span>{/if}
				</span>
				<input name="headword" value={w.headword} required data-german class={inputClass} />
			</label>
			<GrammarFields
				{fields}
				values={grammar}
				defaults={grammarDefaults(w.headword, w.pos)}
				manual={w.manualFields}
			/>
			<p class="text-xs text-stone-500">
				Fields you change are marked edited and are kept when the word is re-synced.
			</p>
			<div class="flex items-center gap-3">
				<button class={buttonClass}>Save</button>
				{#if form && 'saved' in form && form.saved === 'word'}<span class="text-sm text-green-800">
						Saved.
					</span>{/if}
			</div>
		</form>
		{#if w.dictWordId}
			<form
				method="POST"
				action={actionUrl(page.url.search, 'resync')}
				use:enhance
				class="mt-4 flex items-center gap-3"
			>
				<button class="rounded-lg border border-stone-300 px-3 py-1.5 text-sm">
					Re-sync from Wiktionary
				</button>
				{#if form && 'resynced' in form}
					<span class="text-sm text-stone-600">
						{form.resynced === 'source'
							? 'Updated from Wiktionary.'
							: 'Wiktionary was unreachable; re-applied the stored entry.'}
					</span>
				{/if}
			</form>
		{/if}
	</details>
</main>
