<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<header class="border-b border-stone-200">
		<nav class="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
			<a href={resolve('/')} class="font-semibold">Otto</a>
			<form method="POST" action="/logout">
				<button class="text-sm text-stone-600 hover:text-stone-900">Log out</button>
			</form>
		</nav>
	</header>
{/if}

{@render children()}
