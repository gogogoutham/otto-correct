import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	DATABASE_URL: { description: 'Postgres connection string (Neon pooled URL in production).' },
	ADMIN_USERNAME: {
		description: 'Username for the first account. Only used while no account exists.',
		schema: optional
	},
	ADMIN_PASSWORD: {
		description:
			'Password for the first account. Only used while no account exists; remove it once you have logged in.',
		schema: optional
	},
	ANTHROPIC_API_KEY: {
		description:
			'Optional Claude API key. Turns on AI-drafted examples and prefix-meaning suggestions.',
		schema: optional
	}
});
