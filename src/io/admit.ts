// The admission judge — the deciding agent on our side. It reads what discovery retrieved and
// decides what clears the bar (high-signal, novel, grounded, not generic), then writes the keepers
// into stock through the sink, in the contracts/stock.md shape. This is the judge's second function
// (the first is rating Growth). Configured provider: cognition.judge.
import { askJSON } from './cognition.ts';
import { loadConfig } from './config.ts';
import type { Sink } from './sink.ts';

const ISO = '2026-06-24T00:00:00.000Z';

export type AdmittedFinding = {
  claim: string; // the load-bearing fact, one line
  synopsis: string; // mechanism + implication, 1–3 sentences
  field: string; // kebab domain slug
  grounded: string; // why it cleared the bar (source / signal)
};

function fieldSlug(s: string): string {
  return (s || 'field').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'field';
}

export function admit(focus: string, retrieved: string, sink: Sink): { admitted: AdmittedFinding[]; note: string } {
  if (!retrieved.trim()) return { admitted: [], note: 'admit: nothing retrieved' };
  const prompt = `You are the admission judge for a knowledge stock. Topic: "${focus}".
From the retrieved material, keep ONLY high-signal facts that clear the bar: novel (not obvious), grounded (sourced or mechanistic), load-bearing (not filler). Drop generic or unsupported claims.
For each kept fact: { "claim": one line, "synopsis": 1-3 sentences of mechanism + implication, "field": short kebab domain slug, "grounded": why it cleared the bar }.
Retrieved material:
"""
${retrieved.slice(0, 12000)}
"""
Return a JSON array (at most 5). If nothing clears the bar, return [].`;
  const { value, note } = askJSON<AdmittedFinding[]>(loadConfig().cognition.judge, prompt);
  if (!value || !Array.isArray(value)) return { admitted: [], note: `admit: ${note} (no parseable verdict)` };

  const admitted = value
    .filter((v) => v && v.claim && v.synopsis)
    .map((v) => ({ claim: v.claim, synopsis: v.synopsis, field: fieldSlug(v.field), grounded: v.grounded || 'judge-admitted' }));

  const byField = new Map<string, AdmittedFinding[]>();
  for (const a of admitted) {
    const arr = byField.get(a.field) ?? [];
    arr.push(a);
    byField.set(a.field, arr);
  }
  for (const [field, items] of byField) {
    sink.writeStock(field, renderStockField(field, items, sink.readStock(field)));
  }
  return { admitted, note: `admit: kept ${admitted.length} across ${byField.size} field(s)` };
}

function renderStockField(field: string, items: AdmittedFinding[], existing: string | null): string {
  const name = field.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const facts = items.map((i) => `### ${i.claim}\n\n${i.synopsis}\n_Grounded: ${i.grounded}_`).join('\n\n');
  if (existing) return `${existing.replace(/\n+$/, '')}\n\n${facts}\n`;
  return [
    '---',
    `id: ${field}`,
    `name: ${JSON.stringify(name)}`,
    'keywords: []',
    `discoveries: ${items.length}`,
    `finds_screened: ${items.length}`,
    `created: ${ISO}`,
    `updated: ${ISO}`,
    '---',
    '',
    `# ${name}`,
    '',
    'Domain memory admitted by the judge from discovery.',
    '',
    '## Load-bearing facts',
    '',
    facts,
    '',
  ].join('\n');
}
