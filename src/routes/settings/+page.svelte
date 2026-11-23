<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const zones = Intl.supportedValuesOf('timeZone');
	// Edited locally; a save reloads the page data.
	// svelte-ignore state_referenced_locally
	let timeZone = $state(data.settings.timeZone);
	let device = $state('');
	onMount(() => (device = Intl.DateTimeFormat().resolvedOptions().timeZone));
</script>

<svelte:head>
	<title>Settings · Otto</title>
</svelte:head>

<main class="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6">
	<h1 class="text-xl font-semibold">Settings</h1>

	{#if form?.message}
		<p class="rounded-lg bg-red-50 px-4 py-2 text-red-900" role="alert">{form.message}</p>
	{:else if form?.saved}
		<p class="rounded-lg bg-green-50 px-4 py-2 text-green-900" role="status">Saved.</p>
	{/if}

	<form
		method="POST"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
		class="flex flex-col gap-5"
	>
		<label class="flex flex-col gap-1">
			<span class="font-medium">New cards per day</span>
			<input
				type="number"
				name="dailyNewLimit"
				min="0"
				max="100"
				value={data.settings.dailyNewLimit}
				class="w-24 rounded-lg border border-stone-300 px-3 py-1.5"
			/>
			<span class="text-sm text-stone-600">
				Missed days don't add up: each day offers this many at most.
			</span>
		</label>

		<fieldset class="flex flex-col gap-1">
			<legend class="mb-1 font-medium">Default review order</legend>
			<label class="flex items-center gap-2">
				<input
					type="radio"
					name="reviewOrder"
					value="oldest_first"
					checked={data.settings.reviewOrder === 'oldest_first'}
				/> Oldest first-seen first
			</label>
			<label class="flex items-center gap-2">
				<input
					type="radio"
					name="reviewOrder"
					value="shuffled"
					checked={data.settings.reviewOrder === 'shuffled'}
				/> Shuffled
			</label>
		</fieldset>

		<label class="flex flex-col gap-1">
			<span class="font-medium">Time zone</span>
			<input
				name="timeZone"
				list="time-zones"
				bind:value={timeZone}
				autocomplete="off"
				class="rounded-lg border border-stone-300 px-3 py-1.5"
			/>
			<datalist id="time-zones">
				{#each zones as z (z)}<option value={z}></option>{/each}
			</datalist>
			<span class="text-sm text-stone-600">
				Your day, and so your new cards, starts at midnight here.
			</span>
			{#if device && device !== timeZone}
				<button
					type="button"
					class="self-start text-sm text-blue-700 hover:underline"
					onclick={() => (timeZone = device)}
				>
					Use this device's time zone ({device})
				</button>
			{/if}
		</label>

		<div>
			<button class="rounded-lg bg-stone-900 px-4 py-2 font-medium text-white">Save</button>
		</div>
	</form>
</main>
