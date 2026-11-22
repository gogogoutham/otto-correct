<!-- Edit inputs for a set of grammar fields. Fields edited by hand are marked. -->
<script lang="ts">
	import { fieldText, type Grammar, type GrammarField } from '#lib/grammar.js';

	let {
		fields,
		values = {},
		manual = [],
		prefix = ''
	}: { fields: GrammarField[]; values?: Grammar; manual?: string[]; prefix?: string } = $props();
</script>

<div class="grid gap-3 sm:grid-cols-2">
	{#each fields as f (f.key)}
		{@const name = prefix + f.key}
		{@const edited = manual.includes(f.key)}
		{#if f.kind.type === 'bool'}
			<label class="flex items-center gap-2">
				<input type="checkbox" {name} checked={values[f.key] === true} />
				<span>{f.label}</span>
				{#if edited}<span class="text-xs text-amber-700">edited</span>{/if}
			</label>
		{:else if f.kind.type === 'multi'}
			<fieldset class="flex flex-col gap-1">
				<legend class="text-sm text-stone-600">
					{f.label}{#if edited}<span class="ml-1 text-xs text-amber-700">edited</span>{/if}
				</legend>
				<div class="flex flex-wrap gap-3">
					{#each f.kind.options as o (o.value)}
						{@const current = Array.isArray(values[f.key]) ? (values[f.key] as string[]) : []}
						<label class="flex items-center gap-1">
							<input type="checkbox" {name} value={o.value} checked={current.includes(o.value)} />
							{o.label}
						</label>
					{/each}
				</div>
			</fieldset>
		{:else}
			<label class="flex flex-col gap-1">
				<span class="text-sm text-stone-600">
					{f.label}{#if f.kind.type === 'list'}<span class="text-stone-400">
							(comma separated)
						</span>{/if}{#if edited}<span class="ml-1 text-xs text-amber-700">edited</span>{/if}
				</span>
				{#if f.kind.type === 'choice'}
					<select {name} class="rounded-lg border border-stone-300 px-2 py-1.5">
						<option value="">—</option>
						{#each f.kind.options as o (o.value)}
							<option value={o.value} selected={values[f.key] === o.value}>{o.label}</option>
						{/each}
					</select>
				{:else}
					<input
						{name}
						value={fieldText(values[f.key])}
						data-german={f.german ? '' : undefined}
						autocapitalize="none"
						class="rounded-lg border border-stone-300 px-3 py-1.5"
					/>
				{/if}
			</label>
		{/if}
	{/each}
</div>
