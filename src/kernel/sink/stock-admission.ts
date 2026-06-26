import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { KernelRun, KnowledgePacketItem } from '../boundary.ts';
import { slugId } from '../compile/slug.ts';

// A load-bearing fact in a rendered stock field (contracts/stock.md).
type AdmittedFact = { anchor: string; claim: string; synopsis: string; grounded: string };

// Discovery output worth remembering: the web material this run reached outward for. (The
// novelty × grounding admission gate is deferred — this admits what discovery surfaced.)
function admittedWebItems(run: KernelRun): KnowledgePacketItem[] {
  return run.knowledgePacket.items.filter((item) => item.trustTier === 'web-firecrawl');
}

function factFromItem(item: KnowledgePacketItem): AdmittedFact {
  const lines = item.text.split('\n');
  const claim = (lines[0] ?? item.citeHandle).trim();
  const synopsis = lines.slice(1).join(' ').trim() || claim;
  return {
    anchor: item.citeHandle.replace(/[^A-Za-z0-9_-]/g, '-'),
    claim,
    synopsis,
    grounded: `web source · ${item.citation}`,
  };
}

const FACT_RE = /^### (.+)\n\n([\s\S]*?)\n_Grounded: (.+?)_ \^([A-Za-z0-9_-]+)/gm;

function parseExistingFacts(markdown: string): Map<string, AdmittedFact> {
  const facts = new Map<string, AdmittedFact>();
  for (const match of markdown.matchAll(FACT_RE)) {
    const anchor = match[4] ?? '';
    if (!anchor) continue;
    facts.set(anchor, {
      anchor,
      claim: (match[1] ?? '').trim(),
      synopsis: (match[2] ?? '').trim(),
      grounded: (match[3] ?? '').trim(),
    });
  }
  return facts;
}

const STOP = new Set(['the','and','for','that','this','with','from','into','over','than','they','have','are','was','not','its','can','will','would','could','how']);

function keywordsFrom(facts: AdmittedFact[]): string[] {
  const freq = new Map<string, number>();
  for (const fact of facts) {
    const words = `${fact.claim} ${fact.synopsis}`.toLowerCase().split(/[^a-z0-9]+/);
    for (const w of words) {
      if (w.length > 3 && !STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w);
}

function renderStockField(
  fieldId: string,
  name: string,
  facts: AdmittedFact[],
  created: string,
  updated: string,
): string {
  const keywords = keywordsFrom(facts);
  const kwYaml = `[${keywords.map((k) => `"${k}"`).join(', ')}]`;
  const body = facts
    .map((fact) => `### ${fact.claim}\n\n${fact.synopsis}\n_Grounded: ${fact.grounded}_ ^${fact.anchor}`)
    .join('\n\n');
  return `---
id: ${fieldId}
name: ${JSON.stringify(name)}
keywords: ${kwYaml}
discoveries: ${facts.length}
finds_screened: ${facts.length}
created: ${created}
updated: ${updated}
---

# ${name}

## Load-bearing facts

${body}
`;
}

// Admit the runs' discovered web material into agarden stock, one durable field per case.
// Existing facts are kept and deduped by anchor, so stock grows across runs.
export async function admitDiscoveredStock(vaultDir: string, runs: KernelRun[]): Promise<string[]> {
  const stockDir = path.join(vaultDir, 'stock');
  const byCase = new Map<string, { name: string; items: KnowledgePacketItem[] }>();
  for (const run of runs) {
    const items = admittedWebItems(run);
    if (!items.length) continue;
    const entry = byCase.get(run.caseStudy.id) ?? { name: run.caseStudy.title, items: [] };
    entry.items.push(...items);
    byCase.set(run.caseStudy.id, entry);
  }
  if (byCase.size === 0) return [];

  await mkdir(stockDir, { recursive: true });
  const now = new Date().toISOString();
  const written: string[] = [];
  for (const [caseId, { name, items }] of byCase) {
    const fieldId = slugId(`${name} discoveries`, `stock\n${caseId}`);
    const filePath = path.join(stockDir, `${fieldId}.md`);
    let created = now;
    const facts = new Map<string, AdmittedFact>();
    try {
      const prior = await readFile(filePath, 'utf8');
      created = prior.match(/^created:\s*(.+)$/m)?.[1]?.trim() ?? now;
      for (const [anchor, fact] of parseExistingFacts(prior)) facts.set(anchor, fact);
    } catch {
      // first admission for this field
    }
    for (const item of items) {
      const fact = factFromItem(item);
      facts.set(fact.anchor, fact);
    }
    await writeFile(filePath, renderStockField(fieldId, name, [...facts.values()], created, now), 'utf8');
    written.push(filePath);
  }
  return written;
}
