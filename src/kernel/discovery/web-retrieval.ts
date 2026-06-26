import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { KnowledgePacketItem } from '../boundary.ts';

const runCommand = promisify(execFile);

// A retrieved knowledge item, before the gateway stamps it with the run's case + visibility.
export type RetrievedItem = Omit<KnowledgePacketItem, 'sourceCase' | 'visibility'>;

// Discovery's outward reach: given the case query, return fresh source material as packet items.
export type WebRetrieval = (query: string, maxItems: number) => Promise<RetrievedItem[]>;

type FirecrawlResult = { title?: string; url?: string; description?: string };
type FirecrawlResponse = { data?: { web?: FirecrawlResult[] } };

function handleFromTitle(title: string, index: number): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `web-${slug || `result-${index + 1}`}`;
}

// Live web discovery via the firecrawl CLI (`firecrawl search <query> --json`). Best-effort:
// the gateway treats a thrown/empty retrieval as "no fresh material" and falls back to stock.
export function createFirecrawlRetrieval(command = 'firecrawl'): WebRetrieval {
  return async (query, maxItems) => {
    const limit = Math.max(1, maxItems);
    const { stdout } = await runCommand(command, ['search', query, '--json', '--limit', String(limit)], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 90_000,
    });
    const parsed = JSON.parse(stdout) as FirecrawlResponse;
    const web = parsed.data?.web ?? [];
    return web.slice(0, limit).map((result, index) => {
      const title = result.title?.trim() || `Result ${index + 1}`;
      const handle = handleFromTitle(title, index);
      return {
        recordId: handle,
        citeHandle: handle,
        text: `${title}\n${result.description?.trim() ?? ''}`.trim(),
        citation: result.url ?? 'firecrawl',
        trustTier: 'web-firecrawl',
      };
    });
  };
}
