<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import UmlautBar from '#lib/components/UmlautBar.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const q = $derived(page.url.pathname === '/search' ? (page.url.searchParams.get('q') ?? '') : '');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<header class="border-b border-stone-200">
		<nav class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
			<a href={resolve('/')} class="font-semibold">Otto</a>
			<form method="GET" action={resolve('/search')} class="min-w-0 flex-1" role="search">
				<input
					name="q"
					type="search"
					value={q}
					placeholder="Search or add a word"
					aria-label="Search"
					autocapitalize="none"
					autocomplete="off"
					spellcheck="false"
					data-german
					class="w-full rounded-lg border border-stone-300 px-3 py-1.5"
				/>
			</form>
			<form method="POST" action="/logout">
				<button class="text-sm text-stone-600 hover:text-stone-900">Log out</button>
			</form>
		</nav>
	</header>
	<UmlautBar />
{/if}

{@render children()}
