import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { AI_MODEL, AiError, draftExample, suggestPrefixMeaning, type AiClient } from './ai.js';
import { glossesMatchLabel } from './groups.js';

/** A client whose create() answers with the given text (or throws the given error). */
function stubClient(reply: string | Error, stop_reason = 'end_turn') {
	const create = vi.fn(() => {
		if (reply instanceof Error) return Promise.reject(reply);
		return Promise.resolve({ stop_reason, content: [{ type: 'text', text: reply }] });
	});
	return { client: { messages: { create } } as unknown as AiClient, create };
}

describe('draftExample', () => {
	it('asks for a JSON sentence and returns it trimmed', async () => {
		const { client, create } = stubClient(
			JSON.stringify({ german: ' Ich wohne in Berlin. ', english: 'I live in Berlin.' })
		);
		const out = await draftExample(client, {
			headword: 'wohnen',
			pos: 'verb',
			glosses: ['to live, to reside'],
			existing: ['Wir wohnen hier.']
		});
		expect(out).toEqual({ german: 'Ich wohne in Berlin.', english: 'I live in Berlin.' });
		const req = (create.mock.calls[0] as unknown[])[0] as Anthropic.MessageCreateParams;
		expect(req.model).toBe(AI_MODEL);
		expect(req.output_config?.effort).toBe('low');
		expect(req.output_config?.format?.type).toBe('json_schema');
		expect(JSON.stringify(req.messages)).toContain('Wir wohnen hier.');
	});

	it('turns refusals, truncation and API errors into AiError', async () => {
		const req = { headword: 'x', pos: 'noun', glosses: ['x'] };
		await expect(draftExample(stubClient('', 'refusal').client, req)).rejects.toThrow('declined');
		await expect(draftExample(stubClient('{"ger', 'max_tokens').client, req)).rejects.toThrow(
			'cut off'
		);
		await expect(draftExample(stubClient('not json').client, req)).rejects.toBeInstanceOf(AiError);
		const limited = new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers());
		await expect(draftExample(stubClient(limited).client, req)).rejects.toThrow('busy');
	});
});

describe('suggestPrefixMeaning', () => {
	const req = {
		headword: 'verlaufen',
		prefix: 'ver',
		glosses: ['to get lost'],
		options: [{ label: 'wrongly, astray' }, { label: 'away, used up', note: 'verbrauchen' }]
	};

	it('offers only the given labels or none', async () => {
		const { client, create } = stubClient('{"choice":"wrongly, astray"}');
		expect(await suggestPrefixMeaning(client, req)).toBe('wrongly, astray');
		const r = (create.mock.calls[0] as unknown[])[0] as Anthropic.MessageCreateParams;
		const schema = r.output_config?.format?.schema as {
			properties: { choice: { enum: string[] } };
		};
		expect(schema.properties.choice.enum).toEqual(['wrongly, astray', 'away, used up', 'none']);
	});

	it('returns null for none or an unknown label', async () => {
		expect(await suggestPrefixMeaning(stubClient('{"choice":"none"}').client, req)).toBeNull();
		expect(await suggestPrefixMeaning(stubClient('{"choice":"other"}').client, req)).toBeNull();
	});
});

describe('glossesMatchLabel', () => {
	it('matches a translation to a group label, ignoring parentheticals', () => {
		expect(glossesMatchLabel(['to know (a fact)'], 'to know')).toBe(true);
		expect(glossesMatchLabel(['know'], 'to know')).toBe(true);
		expect(glossesMatchLabel(['to', 'toward'], 'to (a place)')).toBe(true);
		expect(glossesMatchLabel(['in, inside'], 'at / in (a place)')).toBe(true);
		expect(glossesMatchLabel(['to know how'], 'to know')).toBe(false);
		expect(glossesMatchLabel(['whenever'], 'when')).toBe(false);
	});
});
