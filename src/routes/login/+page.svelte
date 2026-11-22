<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head>
	<title>Log in · Otto</title>
</svelte:head>

<main class="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
	<h1 class="mb-6 text-2xl font-semibold">Otto</h1>
	<form method="POST" use:enhance class="flex flex-col gap-4">
		<label class="flex flex-col gap-1">
			<span class="text-sm text-stone-600">Username</span>
			<input
				name="username"
				autocomplete="username"
				autocapitalize="none"
				required
				value={form?.username ?? ''}
				class="rounded-lg border border-stone-300 px-3 py-2 text-base"
			/>
		</label>
		<label class="flex flex-col gap-1">
			<span class="text-sm text-stone-600">Password</span>
			<input
				name="password"
				type="password"
				autocomplete="current-password"
				required
				class="rounded-lg border border-stone-300 px-3 py-2 text-base"
			/>
		</label>
		{#if form?.message}
			<p class="text-sm text-red-700" role="alert">{form.message}</p>
		{/if}
		<button class="rounded-lg bg-stone-900 px-4 py-2 font-medium text-white">Log in</button>
	</form>
</main>
