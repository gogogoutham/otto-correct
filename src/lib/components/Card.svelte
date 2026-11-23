<!--
	One flashcard: the front in the chosen direction, and the back once flipped. Other
	meanings and homographs on the back link to their word page, which links back here.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { actionUrl } from '#lib/url.js';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { CardView, Direction } from '#lib/server/cards.js';

	let {
		card,
		direction,
		flipped,
		returnTo
	}: { card: CardView; direction: Direction; flipped: boolean; returnTo: string } = $props();

	const back = $derived(card.back);
	const frame = $derived([card.contextLabel, ...back.usage].filter(Boolean).join(' · '));
	const headword = $derived(
		back.title.startsWith('sich ') ? `sich ${card.headword}` : card.headword
	);
	const wordHref = (id: number) =>
		resolve(`/words/[id]?return=${encodeURIComponent(returnTo)}`, { id: String(id) });
	const searchHref = (q: string) => resolve(`/search?q=${encodeURIComponent(q)}`);
	const others = $derived(card.others.filter((o) => o.status !== 'not_in_deck'));
	const unseen = $derived(card.others.filter((o) => o.status === 'not_in_deck'));
</script>

<section class="flex flex-col gap-4 rounded-2xl border border-stone-200 p-5 shadow-sm">
	<div class="flex flex-col items-center gap-1 py-4 text-center">
		{#if direction === 'en_de'}
			<p class="text-2xl font-medium">{card.glosses.join('; ')}</p>
			<p class="text-sm text-stone-500">
				{card.posLabel}{#if card.contextLabel}&ensp;·&ensp;{card.contextLabel}{/if}
			</p>
			{#if back.recall.length}
				<p class="text-xs text-stone-400">Recall: {back.recall.join(', ')}</p>
			{/if}
		{:else}
			<p class="text-2xl font-medium">{headword}</p>
			<p class="text-sm text-stone-500">
				{card.posLabel}{#if frame}&ensp;·&ensp;{frame}{/if}
			</p>
		{/if}
	</div>

	{#if flipped}
		<div class="flex flex-col gap-4 border-t border-stone-200 pt-4">
			<div class="flex flex-col gap-1">
				{#if direction === 'de_en'}
					<p class="text-xl font-medium">{card.glosses.join('; ')}</p>
				{/if}
				<p class={direction === 'en_de' ? 'text-2xl font-semibold' : 'text-lg font-semibold'}>
					{back.title}
				</p>
				{#if back.labels.length}
					<ul class="flex flex-wrap gap-1">
						{#each back.labels as label (label)}
							<li class="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">{label}</li>
						{/each}
					</ul>
				{/if}
			</div>

			{#if back.lines.length || back.usage.length}
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
					{#each back.lines as line (line.label)}
						<dt class="text-sm text-stone-500">{line.label}</dt>
						<dd>{line.value}</dd>
					{/each}
					{#if back.usage.length}
						<dt class="text-sm text-stone-500">Usage</dt>
						<dd>{back.usage.join(' · ')}</dd>
					{/if}
				</dl>
			{/if}

			{#if back.table}
				<table class="w-fit text-sm">
					<caption class="text-left text-stone-500">{back.table.caption}</caption>
					<tbody>
						{#each back.table.rows as [person, form] (person)}
							<tr>
								<td class="pr-4 text-stone-500">{person}</td>
								<td>{form}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

			{#if card.examples.length}
				<ul class="flex flex-col gap-1 text-sm">
					{#each card.examples as ex, i (i)}
						<li>
							<span class="italic">{ex.german}</span>
							{#if ex.english}<span class="text-stone-500">&ensp;{ex.english}</span>{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if others.length || unseen.length}
				<div class="flex flex-col gap-1 text-sm">
					<p class="text-stone-500">Also:</p>
					<ul class="flex flex-col gap-1">
						{#each others as o (o.meaningId)}
							<li>
								<a href={wordHref(card.wordId)} class="hover:underline">{o.gloss}</a>
								{#if o.status === 'known'}
									<span class="ml-1 rounded bg-green-50 px-1.5 text-xs text-green-800">known</span>
								{/if}
							</li>
						{/each}
						{#each unseen as o (`${o.meaningId}-${o.senseId}`)}
							<li class="flex flex-wrap items-baseline gap-x-2 text-stone-400">
								<span>{o.gloss}</span>
								<span class="text-xs">not yet encountered</span>
								<form
									method="POST"
									action={actionUrl(page.url.search, 'addToDeck')}
									use:enhance
									class="inline"
								>
									{#if o.meaningId}<input type="hidden" name="meaningId" value={o.meaningId} />{/if}
									{#if o.senseId}<input type="hidden" name="senseId" value={o.senseId} />{/if}
									<input type="hidden" name="wordId" value={card.wordId} />
									<button class="text-xs text-blue-700 hover:underline">add to deck</button>
								</form>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if card.homographs.length}
				<p class="text-sm">
					<span class="text-stone-500">Same spelling:</span>
					{#each card.homographs as h, i (`${h.title}-${h.pos}-${i}`)}
						{#if i},
						{/if}<a
							href={h.wordId ? wordHref(h.wordId) : searchHref(card.headword)}
							class="text-blue-700 hover:underline"
						>
							{h.title}{#if h.gloss}&nbsp;= {h.gloss}{/if}
						</a>{#if !h.wordId}<span class="text-xs text-stone-400"> (not in your words)</span>{/if}
					{/each}
				</p>
			{/if}
		</div>
	{/if}
</section>
