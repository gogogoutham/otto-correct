/**
 * Optional AI drafting: example sentences and the prefix meaning a verb uses. Everything
 * here is on demand and editable afterwards; without ANTHROPIC_API_KEY the app simply
 * doesn't offer it.
 */
import Anthropic from '@anthropic-ai/sdk';
import { and, eq, inArray, sql } from 'drizzle-orm';
import * as table from './db/schema.js';
import type { Db } from './dictionary/store.js';
import { ownMeaning } from './collection.js';
import { prefixMeaningsForWord, setPrefixMeaning } from './groups.js';

export const AI_MODEL = 'claude-opus-5-5';

/** A failure to show the learner, e.g. "AI is busy right now". */
export class AiError extends Error {}

/** The part of the SDK client this module uses, so tests can pass a stub. */
export type AiClient = Pick<Anthropic, 'messages'>;

let shared: { key: string; client: AiClient } | undefined;

/** The client for the configured key, or null when AI drafting is off. */
export function aiClient(apiKey: string | undefined): AiClient | null {
	if (!apiKey) return null;
	if (shared?.key !== apiKey) shared = { key: apiKey, client: new Anthropic({ apiKey }) };
	return shared.client;
}

/** One request with a JSON-schema response, returned parsed. */
async function askJson<T>(
	client: AiClient,
	system: string,
	prompt: string,
	schema: Record<string, unknown>
): Promise<T> {
	let res: Anthropic.Message;
	try {
		res = await client.messages.create({
			model: AI_MODEL,
			max_tokens: 4000,
			system,
			messages: [{ role: 'user', content: prompt }],
			output_config: { effort: 'low', format: { type: 'json_schema', schema } }
		});
	} catch (e) {
		if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError)
			throw new AiError('The AI is busy right now. Try again in a minute.');
		if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
			throw new AiError('The AI key was rejected. Check ANTHROPIC_API_KEY.');
		if (e instanceof Anthropic.APIConnectionError)
			throw new AiError('Could not reach the AI. Try again.');
		if (e instanceof Anthropic.APIError) throw new AiError(`The AI request failed (${e.status}).`);
		throw e;
	}
	if (res.stop_reason === 'refusal') throw new AiError('The AI declined to draft this one.');
	if (res.stop_reason === 'max_tokens') throw new AiError('The AI answer was cut off. Try again.');
	const text = res.content.find((b) => b.type === 'text')?.text;
	if (!text) throw new AiError('The AI gave no answer. Try again.');
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new AiError('The AI answer was malformed. Try again.');
	}
}

export interface ExampleRequest {
	headword: string;
	pos: string;
	glosses: string[];
	contextLabel?: string | null;
	/** e.g. "Akk", "sich", "trennbar" — whatever helps pin the sense down. */
	usage?: string[];
	/** Sentences the learner already has, to avoid repeats. */
	existing?: string[];
}

export interface DraftedExample {
	german: string;
	english: string;
}

const EXAMPLE_SYSTEM =
	'You write example sentences for a German learner’s flashcards (CEFR A2–B1). ' +
	'Each sentence uses the given word in the given sense, in natural everyday German, ' +
	'5 to 12 words long, with correct grammar, case and word order. Inflect the word as the ' +
	'sentence needs; separable verbs may split. Give a faithful, natural English translation.';

export async function draftExample(client: AiClient, req: ExampleRequest): Promise<DraftedExample> {
	const lines = [
		`Word: ${req.headword} (${req.pos})`,
		`Sense: ${req.glosses.join('; ')}`,
		req.contextLabel ? `Context: ${req.contextLabel}` : '',
		req.usage?.length ? `Usage: ${req.usage.join(', ')}` : '',
		req.existing?.length
			? `Already used (write something different):\n${req.existing.join('\n')}`
			: ''
	].filter(Boolean);
	const out = await askJson<DraftedExample>(client, EXAMPLE_SYSTEM, lines.join('\n'), {
		type: 'object',
		properties: {
			german: { type: 'string', description: 'The German sentence.' },
			english: { type: 'string', description: 'Its English translation.' }
		},
		required: ['german', 'english'],
		additionalProperties: false
	});
	const german = out.german?.trim();
	if (!german) throw new AiError('The AI gave no sentence. Try again.');
	return { german, english: out.english?.trim() ?? '' };
}

export interface PrefixMeaningRequest {
	headword: string;
	prefix: string;
	glosses: string[];
	options: { label: string; note?: string | null; examples?: string[] }[];
}

const PREFIX_SYSTEM =
	'You classify German prefixed verbs. Given a verb in one sense and the meanings its prefix ' +
	'can add, pick the one that this sense of the verb shows. Answer "none" when the verb is ' +
	'lexicalised and none of them fits well.';

/** The label of the prefix meaning this sense shows, or null for none. */
export async function suggestPrefixMeaning(
	client: AiClient,
	req: PrefixMeaningRequest
): Promise<string | null> {
	const labels = req.options.map((o) => o.label);
	const options = req.options
		.map((o) => {
			const extra = [o.note, o.examples?.length ? `e.g. ${o.examples.join(', ')}` : '']
				.filter(Boolean)
				.join('; ');
			return `- ${o.label}${extra ? ` (${extra})` : ''}`;
		})
		.join('\n');
	const prompt = `Verb: ${req.headword}\nSense: ${req.glosses.join('; ')}\nMeanings of ${req.prefix}-:\n${options}`;
	const out = await askJson<{ choice: string }>(client, PREFIX_SYSTEM, prompt, {
		type: 'object',
		properties: { choice: { type: 'string', enum: [...labels, 'none'] } },
		required: ['choice'],
		additionalProperties: false
	});
	return labels.includes(out.choice) ? out.choice : null;
}

/** Drafts an example for a collection meaning and saves it, labelled as AI. */
export async function addAiExample(
	db: Db,
	client: AiClient,
	userId: string,
	meaningId: number
): Promise<DraftedExample> {
	const m = await ownMeaning(db, userId, meaningId);
	const [w] = await db
		.select({ headword: table.word.headword, pos: table.word.pos })
		.from(table.word)
		.where(eq(table.word.id, m.wordId));
	const existing = await db
		.select({ german: table.example.german })
		.from(table.example)
		.where(eq(table.example.meaningId, meaningId));
	const grammar = (m.grammar ?? {}) as Record<string, unknown>;
	const usage = Object.entries(grammar).flatMap(([k, v]) =>
		v === true ? [k] : typeof v === 'string' ? [`${k}: ${v}`] : []
	);
	const drafted = await draftExample(client, {
		headword: w.headword,
		pos: w.pos,
		glosses: m.glosses,
		contextLabel: m.contextLabel,
		usage,
		existing: existing.map((e) => e.german)
	});
	await db.insert(table.example).values({
		userId,
		meaningId,
		german: drafted.german,
		english: drafted.english || null,
		source: 'ai',
		position: existing.length
	});
	return drafted;
}

/**
 * Asks which prefix meaning a verb meaning shows and records it (the learner can change it).
 * Returns the chosen group's label, or null when none fits.
 */
export async function applyPrefixSuggestion(
	db: Db,
	client: AiClient,
	userId: string,
	meaningId: number
): Promise<string | null> {
	const m = await ownMeaning(db, userId, meaningId);
	const info = await prefixMeaningsForWord(db, userId, m.wordId);
	if (!info?.options.length) return null;
	const [w] = await db
		.select({ headword: table.word.headword })
		.from(table.word)
		.where(eq(table.word.id, m.wordId));
	const ids = info.options.map((o) => o.id);
	const [notes, members] = await Promise.all([
		db
			.select({ id: table.group.id, note: table.group.note })
			.from(table.group)
			.where(inArray(table.group.id, ids)),
		db
			.select({ groupId: table.groupMember.groupId, headword: table.word.headword })
			.from(table.groupMember)
			.innerJoin(table.meaning, eq(table.meaning.id, table.groupMember.meaningId))
			.innerJoin(table.word, eq(table.word.id, table.meaning.wordId))
			.where(and(inArray(table.groupMember.groupId, ids), sql`${table.word.id} <> ${m.wordId}`))
	]);
	const label = await suggestPrefixMeaning(client, {
		headword: w.headword,
		prefix: info.prefix,
		glosses: m.glosses,
		options: info.options.map((o) => ({
			label: o.label,
			note: notes.find((n) => n.id === o.id)?.note,
			examples: [
				...new Set(members.filter((x) => x.groupId === o.id).map((x) => x.headword))
			].slice(0, 4)
		}))
	});
	const chosen = info.options.find((o) => o.label === label);
	if (chosen) await setPrefixMeaning(db, userId, meaningId, chosen.id);
	return chosen?.label ?? null;
}
