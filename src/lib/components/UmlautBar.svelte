<!--
	On-screen ä ö ü ß keys. Appears while any input or textarea marked `data-german` has
	focus, and types into it at the cursor. The keys never take focus away from the field.
-->
<script lang="ts">
	let target = $state<HTMLInputElement | HTMLTextAreaElement | null>(null);
	let upper = $state(false);

	const isGerman = (el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement =>
		(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
		el.dataset.german !== undefined;

	function onfocusin(e: FocusEvent) {
		target = isGerman(e.target) ? e.target : null;
	}
	function onfocusout(e: FocusEvent) {
		if (!isGerman(e.relatedTarget)) target = null;
	}

	function type(char: string) {
		const el = target;
		if (!el) return;
		const start = el.selectionStart ?? el.value.length;
		const end = el.selectionEnd ?? start;
		el.setRangeText(char, start, end, 'end');
		el.dispatchEvent(new Event('input', { bubbles: true }));
		upper = false;
	}

	const keys = $derived(upper ? ['Ä', 'Ö', 'Ü', 'ẞ'] : ['ä', 'ö', 'ü', 'ß']);
</script>

<svelte:document {onfocusin} {onfocusout} />

{#if target}
	<div
		class="fixed inset-x-0 bottom-0 z-20 flex justify-center gap-2 border-t border-stone-200 bg-white/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg"
		role="toolbar"
		aria-label="German characters"
	>
		<button
			type="button"
			class="h-10 w-12 rounded-lg border text-sm {upper
				? 'border-stone-900 bg-stone-900 text-white'
				: 'border-stone-300'}"
			aria-pressed={upper}
			aria-label="Capital letters"
			onmousedown={(e) => e.preventDefault()}
			onclick={() => (upper = !upper)}
		>
			⇧
		</button>
		{#each keys as key (key)}
			<button
				type="button"
				class="h-10 w-12 rounded-lg border border-stone-300 text-lg"
				onmousedown={(e) => e.preventDefault()}
				onclick={() => type(key)}
			>
				{key}
			</button>
		{/each}
	</div>
{/if}
