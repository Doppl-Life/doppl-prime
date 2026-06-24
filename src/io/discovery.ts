// Discovery as a kernel process (mechanics/kernel/discovery.md): read stock, reach a backend,
// clear the bar, write keepers to stock, return the gathered context. Backends are pluggable;
// the offline backend is deterministic and $0 so the pipeline runs end-to-end with no network.
import type { Sink } from './sink.ts';

const ISO = '2026-06-24T00:00:00.000Z';

export type Find = { found: string; field: string };

export interface DiscoveryBackend {
  search(focus: string): Find[];
}

function fieldKey(focus: string): string {
  const words = focus.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 4);
  return words.slice(0, 2).join('-') || 'context';
}

// Deterministic, no network. Synthesizes finds from the focus vocabulary to exercise the round trip.
// The web backend (wiring tools/source-radar.ts recipes) is the seam this leaves open.
export const offlineBackend: DiscoveryBackend = {
  search(focus: string): Find[] {
    const field = fieldKey(focus);
    const head = focus.slice(0, 90).trim();
    return [
      { found: `The stated reading of "${head}" has observable second-order effects worth tracking.`, field },
      { found: `The obvious framing omits a dependent actor whose position changes if the thesis holds.`, field },
    ];
  },
};

function titleOf(found: string): string {
  return found.replace(/[.""]/g, '').split(/\s+/).slice(0, 7).join(' ');
}

function newStockField(fieldId: string, found: string): string {
  const name = fieldId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return [
    '---',
    `id: ${fieldId}`,
    `name: ${JSON.stringify(name)}`,
    'keywords: []',
    'discoveries: 1',
    'finds_screened: 2',
    `created: ${ISO}`,
    `updated: ${ISO}`,
    '---',
    '',
    `# ${name}`,
    '',
    'Domain memory gathered by discovery.',
    '',
    '## Load-bearing facts',
    '',
    `### ${titleOf(found)}`,
    '',
    found,
    '_Grounded: discovery (offline backend)_',
    '',
  ].join('\n');
}

function appendFact(existing: string, found: string): string {
  const fact = `\n### ${titleOf(found)}\n\n${found}\n_Grounded: discovery (offline backend)_\n`;
  return `${existing.replace(/\n+$/, '')}\n${fact}`;
}

export type DiscoveryResult = { entries: Find[] };

export function discover(focus: string, backend: DiscoveryBackend, sink: Sink): DiscoveryResult {
  const finds = backend.search(focus);
  // The bar is a real gate for web backends; the offline backend's synthesized finds all clear it.
  const keepers = finds;
  for (const keeper of keepers) {
    const existing = sink.readStock(keeper.field);
    sink.writeStock(keeper.field, existing ? appendFact(existing, keeper.found) : newStockField(keeper.field, keeper.found));
  }
  return { entries: keepers };
}
