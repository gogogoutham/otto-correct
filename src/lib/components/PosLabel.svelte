<script lang="ts">
	import { articles, type Grammar, type PartOfSpeech } from '#lib/grammar.js';

	let { headword, pos, grammar }: { headword: string; pos: PartOfSpeech; grammar: Grammar } =
		$props();
	const article = $derived(pos === 'noun' ? articles(grammar) : '');
</script>

<span class="font-semibold">
	{#if article}<span class="mr-1 font-normal text-stone-500">{article}</span>{/if}{headword}
</span>
<span class="ml-1 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">{pos}</span>
