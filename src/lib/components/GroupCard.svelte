<!--
	A group card: the English idea (or prefix meaning, or base verb) on the front, and the
	full table on the back. Only shown English → German.
-->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { actionUrl } from '#lib/url.js';
	import type { GroupView } from '#lib/server/groups.js';

	let { group, flipped, returnTo }: { group: GroupView; flipped: boolean; returnTo: string } =
		$props();

	const PROMPT: Record<string, string> = {
		contrast: 'Name every variant and when to use it',
		prefix_meaning: 'Name the verbs with this prefix meaning',
		verb_family: 'Name its prefixed verbs, their meanings and separability'
	};
	const KIND: Record<string, string> = {
		contrast: 'contrast group',
		prefix_meaning: 'prefix meaning',
		verb_family: 'verb family'
	};
	const wordHref = (id: number) =>
		resolve(`/words/[id]?return=${encodeURIComponent(returnTo)}`, { id: String(id) });
</script>

<section class="flex flex-col gap-4 rounded-2xl border border-stone-200 p-5 shadow-sm">
	<div class="flex flex-col items-center gap-1 py-4 text-center">
		<p class="text-2xl font-medium">{group.title}</p>
		<p class="text-sm text-stone-500">{KIND[group.kind]}</p>
		<p class="text-xs text-stone-400">{PROMPT[group.kind]}</p>
	</div>

	{#if flipped}
		<div class="flex flex-col gap-3 border-t border-stone-200 pt-4">
			{#if group.note}<p class="text-sm text-stone-700">{group.note}</p>{/if}
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<tbody>
						{#each group.members as m (m.id)}
							{@const unseen = m.deckStatus === 'not_in_deck'}
							<tr
								class="border-t border-stone-100 align-top first:border-0 {unseen
									? 'text-stone-400'
									: ''}"
							>
								<td class="py-1.5 pr-3">
									<a href={wordHref(m.wordId)} class="font-medium hover:underline">{m.display}</a>
									{#if m.prefixType}<span class="block text-xs">{m.prefixType}</span>{/if}
									{#if unseen}
										<form
											method="POST"
											action={actionUrl(page.url.search, 'addToDeck')}
											use:enhance
										>
											<input type="hidden" name="meaningId" value={m.meaningId} />
											<button class="text-xs text-blue-700 hover:underline">add to deck</button>
										</form>
									{/if}
								</td>
								<td class="py-1.5 pr-3">{m.rule ?? m.glosses.join('; ')}</td>
								<td class="py-1.5 italic">{m.example ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}
</section>
