<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Otto</title>
</svelte:head>

<main class="mx-auto max-w-3xl px-4 py-6">
	<h1 class="mb-6 text-xl font-semibold">Hallo, {data.user?.username}</h1>
	<div class="grid gap-4 sm:grid-cols-2">
		<a
			href={resolve('/search')}
			class="rounded-xl border border-stone-200 p-4 hover:bg-stone-50 sm:col-span-2"
		>
			<h2 class="font-medium">Add words</h2>
			<p class="mt-1 text-sm text-stone-600">
				Search the dictionary in German or English and pick the meanings to learn.
			</p>
		</a>
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
