/** Writes the starter set as a readable table for review: npx tsx scripts/starter-review.ts > out.md */
import {
	STARTER_GROUPS,
	STARTER_PREFIX_MEANINGS,
	PREFIX_NOTES
} from '../src/lib/server/groups/starter.js';

const CASE: Record<string, string> = { accusative: 'Akk', dative: 'Dat', genitive: 'Gen' };
const name = (m: { de: string; governs?: string[] }) =>
	m.governs?.length === 1 ? `${m.de} + ${CASE[m.governs[0]]}` : m.de;
const cell = (s = '') => s.replace(/\|/g, '\\|');

const out: string[] = ['# Starter set for review', ''];
out.push(
	'Loaded from Groups → "Load starter groups". Every member comes in as "not in deck" (greyed out). ' +
		'"Gloss" is shown only where it replaces the Wiktionary gloss.',
	'',
	'## Contrast groups',
	''
);
for (const g of STARTER_GROUPS) {
	out.push(`### ${g.label}`, '');
	if (g.note) out.push(g.note, '');
	out.push('| German | When | Example | Gloss |', '| --- | --- | --- | --- |');
	for (const m of g.members)
		out.push(`| ${cell(name(m))} | ${cell(m.rule)} | ${cell(m.example)} | ${cell(m.gloss)} |`);
	out.push('');
}
out.push('## Prefix meanings', '');
let prefix = '';
for (const p of STARTER_PREFIX_MEANINGS) {
	if (p.prefix !== prefix) {
		prefix = p.prefix;
		out.push(`### ${prefix}-`, '');
		if (PREFIX_NOTES[prefix]) out.push(PREFIX_NOTES[prefix], '');
	}
	out.push(
		`- **${p.label}**: ${p.verbs.map((v) => v.de + (v.gloss ? ` (${v.gloss})` : '')).join(', ')}`
	);
}
out.push('');
for (const [p, note] of Object.entries(PREFIX_NOTES))
	if (!STARTER_PREFIX_MEANINGS.some((m) => m.prefix === p)) out.push(`- **${p}-**: ${note}`);
console.log(out.join('\n'));
