<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { actionUrl } from '#lib/url.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let editing = $state(false);

	const g = $derived(data.group);
	const act = (name: string) => actionUrl(page.url.search, name);
	/** Back to the study session or card this page was opened from. */
	const returnTo = $derived.by(() => {
		const r = page.url.searchParams.get('return') ?? '';
		return r.startsWith('/study') || r.startsWith('/cards/') ? (r as `/study?${string}`) : null;
	});
	const here = $derived(page.url.pathname + page.url.search);
	const wordHref = (id: number) =>
		resolve(`/words/[id]?return=${encodeURIComponent(here)}`, { id: String(id) });
	const KIND: Record<string, string> = {
		contrast: 'Contrast group',
		prefix_meaning: 'Prefix meaning',
		verb_family: 'Verb family'
	};
	const related = $derived(new Set(g.related.map((r) => r.id)));
	const inputClass = 'rounded-lg border border-stone-300 px-2 py-1 text-sm';
</script>

<svelte:head>
	<title>{g.title} · Otto</title>
</svelte:head>

<main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 pb-24">
	{#if returnTo}
		<a href={resolve(returnTo)} class="text-sm text-blue-700 hover:underline">← Back to the card</a>
	{:else}
		<a href={resolve('/groups')} class="text-sm text-blue-700 hover:underline">← Groups</a>
	{/if}

	<header class="flex flex-col gap-1">
		<p class="text-sm text-stone-500">
			{KIND[g.kind]}{#if g.prefix}&ensp;·&ensp;<a
					href={resolve('/prefixes/[prefix]', { prefix: g.prefix.prefix })}
					class="text-blue-700 hover:underline"
				>
					{g.prefix.prefix}- ({g.prefix.type})
				</a>{/if}
		</p>
		<h1 class="text-2xl font-semibold">{g.title}</h1>
		{#if g.note}<p class="text-stone-700">{g.note}</p>{/if}
		<p class="text-sm text-stone-500">
			{#if g.qualifiedAt}
				Has a card since {g.qualifiedAt.toLocaleDateString()}.
			{:else}
				Gets a card once two members are in your deck{g.kind === 'verb_family'
					? ' (two different verbs)'
					: ''}.
			{/if}
		</p>
	</header>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 px-4 py-2 text-red-900" role="alert">{form.message}</p>
	{/if}

	<div class="overflow-x-auto">
		<table class="w-full text-left text-sm">
			<thead class="text-stone-500">
				<tr>
					<th class="py-1 pr-3 font-normal">German</th>
					<th class="py-1 pr-3 font-normal">{g.kind === 'contrast' ? 'When' : 'Meaning'}</th>
					<th class="py-1 font-normal">Example</th>
				</tr>
			</thead>
			<tbody>
				{#each g.members as m, i (m.id)}
					{@const unseen = m.deckStatus === 'not_in_deck'}
					<tr class="border-t border-stone-100 align-top {unseen ? 'text-stone-400' : ''}">
						<td class="py-2 pr-3">
							<a href={wordHref(m.wordId)} class="font-medium hover:underline">{m.display}</a>
							{#if m.prefixType}<span class="block text-xs">{m.prefixType}</span>{/if}
							{#if m.deckStatus === 'known'}<span class="block text-xs text-green-700">
									known
								</span>{/if}
							{#if unseen}
								<span class="block text-xs">not yet encountered</span>
								<form method="POST" action={act('addToDeck')} use:enhance>
									<input type="hidden" name="meaningId" value={m.meaningId} />
									<button class="text-xs text-blue-700 hover:underline">add to deck</button>
								</form>
							{/if}
						</td>
						<td class="py-2 pr-3">
							{#if editing}
								<form
									method="POST"
									action={act('updateMember')}
									use:enhance={() =>
										async ({ update }) =>
											update({ reset: false })}
									class="flex flex-col gap-1"
									id="member-{m.id}"
								>
									<input type="hidden" name="memberId" value={m.id} />
									<input
										name="rule"
										value={m.rule ?? ''}
										placeholder="When to use it"
										class={inputClass}
									/>
								</form>
								<span class="text-xs text-stone-400">{m.glosses.join('; ')}</span>
							{:else}
								{m.rule ?? m.glosses.join('; ')}
								{#if m.rule}<span class="block text-xs text-stone-400">
										{m.glosses.join('; ')}
									</span>{/if}
							{/if}
						</td>
						<td class="py-2 italic">
							{#if editing}
								<div class="flex flex-col gap-1 not-italic">
									<input
										name="example"
										form="member-{m.id}"
										value={m.example ?? ''}
										placeholder="Example"
										data-german
										class={inputClass}
									/>
									<div class="flex flex-wrap gap-2 text-xs">
										<button form="member-{m.id}" class="text-blue-700 hover:underline">Save</button>
										{#if form?.saved === `member-${m.id}`}<span class="text-green-700">
												Saved.
											</span>{/if}
										<form method="POST" action={act('move')} use:enhance class="inline">
											<input type="hidden" name="memberId" value={m.id} />
											<button
												name="dir"
												value="up"
												disabled={i === 0}
												class="text-blue-700 disabled:text-stone-300"
												aria-label="Move up"
											>
												↑
											</button>
											<button
												name="dir"
												value="down"
												disabled={i === g.members.length - 1}
												class="text-blue-700 disabled:text-stone-300"
												aria-label="Move down"
											>
												↓
											</button>
										</form>
										<form method="POST" action={act('removeMember')} use:enhance class="inline">
											<input type="hidden" name="memberId" value={m.id} />
											<button class="text-red-700 hover:underline">Remove</button>
										</form>
									</div>
								</div>
							{:else}
								{m.example ?? ''}
							{/if}
						</td>
					</tr>
				{:else}
					<tr><td colspan="3" class="py-2 text-stone-400">No members yet.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if g.related.length}
		<p class="text-sm">
			<span class="text-stone-500">Related:</span>
			{#each g.related as r, i (r.id)}{i ? ', ' : ''}<a
					href={resolve('/groups/[id]', { id: String(r.id) })}
					class="text-blue-700 hover:underline"
				>
					{r.title}
				</a>{/each}
		</p>
	{/if}

	<div>
		<button
			class="rounded-lg border border-stone-300 px-3 py-1.5 text-sm"
			onclick={() => (editing = !editing)}
		>
			{editing ? 'Done editing' : 'Edit group'}
		</button>
	</div>

	{#if editing}
		<section class="flex flex-col gap-3 rounded-xl border border-stone-200 p-4">
			<h2 class="font-medium">Add a member</h2>
			<form method="GET" class="flex gap-2" data-sveltekit-keepfocus>
				{#if returnTo}<input type="hidden" name="return" value={returnTo} />{/if}
				<input
					name="find"
					value={data.find}
					placeholder="A word in your collection, German or English"
					data-german
					class="{inputClass} min-w-0 flex-1"
				/>
				<button class="rounded-lg border border-stone-300 px-3 py-1 text-sm">Find</button>
			</form>
			{#if data.find && !data.found.length}
				<p class="text-sm text-stone-500">
					Nothing in your collection matches. <a
						href={resolve(`/search?q=${encodeURIComponent(data.find)}`)}
						class="text-blue-700 hover:underline"
					>
						Add the word first
					</a>.
				</p>
			{/if}
			<ul class="flex flex-col gap-2">
				{#each data.found as f (f.meaningId)}
					<li>
						<form
							method="POST"
							action={act('addMember')}
							use:enhance
							class="flex flex-wrap items-center gap-2 text-sm"
						>
							<input type="hidden" name="meaningId" value={f.meaningId} />
							<span class="min-w-40">
								<span class="font-medium">{f.headword}</span>
								<span class="text-stone-500">{f.gloss}</span>
							</span>
							<input name="rule" placeholder="When to use it" class={inputClass} />
							<input name="example" placeholder="Example" data-german class={inputClass} />
							<button class="text-blue-700 hover:underline">Add</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>

		<section class="flex flex-col gap-3 rounded-xl border border-stone-200 p-4">
			<h2 class="font-medium">Name and note</h2>
			<form
				method="POST"
				action={act('update')}
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: false })}
				class="flex flex-col gap-2"
			>
				<input name="label" value={g.label} class={inputClass} aria-label="Name" />
				<textarea name="note" rows="2" placeholder="Note" class={inputClass} aria-label="Note"
					>{g.note ?? ''}</textarea
				>
				<div class="flex items-center gap-3">
					<button class="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white">
						Save
					</button>
					{#if form?.saved === 'group'}<span class="text-sm text-green-700">Saved.</span>{/if}
				</div>
			</form>
		</section>

		{#if data.otherGroups.length}
			<section class="flex flex-col gap-2 rounded-xl border border-stone-200 p-4">
				<h2 class="font-medium">Related groups</h2>
				<ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
					{#each data.otherGroups as o (o.id)}
						<li>
							<form method="POST" action={act('related')} use:enhance>
								<input type="hidden" name="otherId" value={o.id} />
								<label class="flex items-center gap-1">
									<input
										type="checkbox"
										name="related"
										value="true"
										checked={related.has(o.id)}
										onchange={(e) => e.currentTarget.form?.requestSubmit()}
									/>
									{o.title}
								</label>
							</form>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<form method="POST" action={act('delete')}>
			<button class="text-sm text-red-700 hover:underline">Delete this group</button>
			<span class="text-sm text-stone-500">Its words stay in your collection.</span>
		</form>
	{/if}
</main>
