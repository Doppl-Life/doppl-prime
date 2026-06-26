import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { KernelRun, KnowledgePacketItem } from '../boundary.ts';
import { slugId } from '../compile/slug.ts';
import { parseJsonObjectResponse, type ModelClient } from '../model/model-gateway.ts';

// A load-bearing fact in a rendered stock field (contracts/stock.md).
type AdmittedFact = { anchor: string; claim: string; synopsis: string; grounded: string };

// The web material a run reached outward for, before the admission gate. The judge (discovery.md
// step 3) decides which of these clear the bar and become durable stock.
function discoveredWebItems(run: KernelRun): KnowledgePacketItem[] {
  return run.knowledgePacket.items.filter((item) => item.trustTier === 'web-firecrawl');
}

// The admission gate (discovery.md step 3): the judge reads what discovery surfaced and decides
// what clears the bar — high-signal, grounded, non-duplicate against existing stock. A gate, set
// high. Returns the anchors to admit; everything else is dropped.
export type StockAdmissionJudge = {
  admit(input: {
    caseTitle: string;
    candidates: AdmittedFact[];
    existing: AdmittedFact[];
  }): Promise<ReadonlySet<string>>;
};

export function createModelStockAdmissionJudge(client: ModelClient, model: string): StockAdmissionJudge {
  return {
    async admit({ caseTitle, candidates, existing }) {
      if (candidates.length === 0) return new Set();
      const prompt = [
        'You gate findings entering a durable knowledge store. The bar is HIGH.',
        'Admit ONLY findings that are high-signal, concretely grounded, and NOT duplicates or',
        'restatements of the existing stock below. When in doubt, reject.',
        `Case: ${caseTitle}`,
        'Existing stock facts (do not re-admit duplicates):',
        existing.map((fact) => `- ${fact.claim}`).join('\n') || '(none)',
        'Candidate findings:',
        candidates.map((fact) => `[${fact.anchor}] ${fact.claim} — ${fact.synopsis}`).join('\n'),
        'Return JSON only: {"admit": ["anchor", ...]} listing the anchors that clear the bar.',
      ].join('\n');
      const response = await client.complete({
        runId: 'stock_admission',
        purpose: 'stock_admission',
        prompt,
        model,
        responseFormat: 'json_object',
      });
      const parsed = parseJsonObjectResponse(response.outputText);
      const admit = Array.isArray(parsed.admit) ? parsed.admit : [];
      return new Set(admit.filter((anchor): anchor is string => typeof anchor === 'string'));
    },
  };
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
// Existing facts are kept and deduped by anchor, so stock grows across runs. When a judge is
// supplied, only the findings it admits (discovery.md step 3) become durable stock; without one
// (e.g. a run that did no web discovery, or a test), the surfaced findings pass through unchanged.
export async function admitDiscoveredStock(
  vaultDir: string,
  runs: KernelRun[],
  judge?: StockAdmissionJudge,
): Promise<string[]> {
  const stockDir = path.join(vaultDir, 'stock');
  const byCase = new Map<string, { name: string; items: KnowledgePacketItem[] }>();
  for (const run of runs) {
    const items = discoveredWebItems(run);
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
    const candidates = items.map(factFromItem);
    const admitted = judge
      ? await judge.admit({ caseTitle: name, candidates, existing: [...facts.values()] })
      : undefined;
    for (const fact of candidates) {
      if (admitted && !admitted.has(fact.anchor)) continue;
      facts.set(fact.anchor, fact);
    }
    await writeFile(filePath, renderStockField(fieldId, name, [...facts.values()], created, now), 'utf8');
    written.push(filePath);
  }
  return written;
}
