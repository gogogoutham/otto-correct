<script lang="ts">
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Otto</title>
</svelte:head>

<main class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-6 text-xl font-semibold">Hallo, {data.user?.username}</h1>
	<div class="grid gap-4 sm:grid-cols-2">
		<section class="rounded-xl border border-stone-200 p-4">
			<h2 class="font-medium">New cards</h2>
			<p class="mt-1 text-sm text-stone-600">Daily new cards arrive in Milestone 5.</p>
		</section>
		<section class="rounded-xl border border-stone-200 p-4">
			<h2 class="font-medium">Review</h2>
			<p class="mt-1 text-sm text-stone-600">Review sessions arrive in Milestone 5.</p>
		</section>
	</div>
</main>
