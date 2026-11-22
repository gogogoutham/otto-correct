# otto-correct

A browser-based German vocabulary flashcard app for one English-speaking learner.
Cards are built from individual meanings of words, with part-of-speech grammar on the German side.

The plan and requirements live in the project's shared docs. This README covers running and deploying the app.

## Stack

SvelteKit (TypeScript) on Vercel, Postgres on Neon, Drizzle ORM, Tailwind CSS, Vitest.

## Local development

Requires Node 22+ and a Postgres 16 database.

```sh
cp .env.example .env      # set DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD
npm install
npm run db:migrate        # apply migrations in ./drizzle
npm run dev
```

Log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`. That pair creates the first account, and is ignored once any account exists.

Checks: `npm run lint`, `npm run check`, `npm test`.

### Changing the schema

Edit `src/lib/server/db/schema.ts`, then run `npm run db:generate` and commit the new SQL file in `./drizzle`. Never edit an applied migration.

## Deploying (Vercel + Neon, free plans)

1. **Vercel:** sign up with GitHub, then **Add New → Project** and import this repo. The framework is detected as SvelteKit; `vercel.json` sets the build command.
2. **Neon:** in the Vercel project, open **Storage → Create Database → Neon** (or connect an existing Neon project). This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to the project's environment variables.
3. **Environment variables** (Vercel → Settings → Environment Variables, Production):
   - `ADMIN_USERNAME` and `ADMIN_PASSWORD`: your first login.
4. **Deploy.** Production builds run `npm run db:migrate` first; preview builds skip migrations so unmerged branches never change the database.
5. Log in at the production URL, then delete `ADMIN_PASSWORD` from Vercel.

## Data and licences

Dictionary data will come from English Wiktionary via [kaikki.org](https://kaikki.org) (CC BY-SA) and example sentences from [Tatoeba](https://tatoeba.org) (CC BY). An attribution page ships with V1.
