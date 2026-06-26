import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertKnowledgePacket, type KnowledgePacket } from '../boundary.ts';
import type { WebRetrieval } from './web-retrieval.ts';

export type KnowledgePacketRequest = {
  runId: string;
  targetCase: string;
  maxItems: number;
  // The case text the packet is for. When present, stock is ranked by relevance to it
  // instead of returned in filename order.
  queryText?: string;
};

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'into', 'under', 'over', 'than', 'then',
  'they', 'them', 'their', 'what', 'when', 'where', 'which', 'while', 'have', 'has', 'are', 'was',
  'not', 'but', 'its', 'his', 'her', 'how', 'why', 'who', 'can', 'will', 'would', 'could', 'should',
]);

function significantTerms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9-]+/)
      .filter((term) => term.length > 3 && !STOPWORDS.has(term)),
  );
}

// Relevance = how many of the case's significant terms the fact contains. Zero query text
// means no signal — fall back to the original order.
function relevanceScore(queryTerms: Set<string>, factText: string): number {
  if (queryTerms.size === 0) return 0;
  const factTerms = significantTerms(factText);
  let shared = 0;
  for (const term of queryTerms) if (factTerms.has(term)) shared += 1;
  return shared;
}

export type KnowledgeGateway = {
  selectPacket(request: KnowledgePacketRequest): Promise<KnowledgePacket>;
};

function frontmatterField(markdown: string, field: string): string | undefined {
  const match = markdown.match(new RegExp(`^${field}:\\s*"?([^"\\n]+)"?`, 'm'));
  return match?.[1]?.trim();
}

function stockFactBlocks(markdown: string): Array<{ title: string; body: string; anchor?: string }> {
  const matches = [...markdown.matchAll(/^###\s+(.+?)\n([\s\S]*?)(?=\n###\s+|\n##\s+|(?![\s\S]))/gm)];
  return matches.map((match) => {
    const rawBody = (match[2] || '').trim();
    const anchor = rawBody.match(/\^([A-Za-z0-9_-]+)\s*$/m)?.[1];
    return {
      title: (match[1] || '').trim(),
      body: rawBody.replace(/\s*\^[A-Za-z0-9_-]+\s*$/m, '').trim(),
      anchor,
    };
  }).filter((block) => block.title && block.body);
}

export async function createAgardenStockKnowledgeGateway(
  vaultDir: string,
  retrieve?: WebRetrieval,
): Promise<KnowledgeGateway> {
  const stockDir = path.join(vaultDir, 'stock');
  let files: string[];
  try {
    files = (await readdir(stockDir)).filter((file) => file.endsWith('.md')).sort();
  } catch (error) {
    throw new Error(`configured agarden stock directory is required: ${stockDir}`, { cause: error });
  }
  const stockFiles = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(stockDir, file);
      return {
        file,
        filePath,
        markdown: await readFile(filePath, 'utf8'),
      };
    }),
  );
  return {
    async selectPacket(request) {
      const items = stockFiles.flatMap(({ file, filePath, markdown }) => {
        const fieldId = frontmatterField(markdown, 'id') || file.replace(/\.md$/, '');
        const fieldName = frontmatterField(markdown, 'name') || fieldId;
        return stockFactBlocks(markdown).map((fact, index) => ({
          recordId: fact.anchor || `${fieldId}:${index + 1}`,
          citeHandle: fact.anchor || `S${index + 1}_${fieldId}`,
          text: `${fieldName}: ${fact.title}\n${fact.body}`,
          sourceCase: request.targetCase,
          citation: path.relative(process.cwd(), filePath),
          trustTier: 'agarden-stock',
          visibility: 'problem_recovery',
        }));
      });
      const queryTerms = significantTerms(request.queryText ?? '');
      const ranked = items
        .map((item, index) => ({ item, index, score: relevanceScore(queryTerms, item.text) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((entry) => entry.item);
      // Reach outward only after stock: fresh web material (relevant by construction) leads,
      // ranked stock backfills the remaining slots. Retrieval is best-effort.
      let webItems: KnowledgePacket['items'] = [];
      if (retrieve && request.queryText) {
        try {
          const retrieved = await retrieve(request.queryText, request.maxItems);
          webItems = retrieved.map((item) => ({
            ...item,
            sourceCase: request.targetCase,
            visibility: 'problem_recovery',
          }));
        } catch {
          webItems = [];
        }
      }
      const merged = [...webItems, ...ranked];
      return assertKnowledgePacket({
        id: `stock:${request.runId}:${request.targetCase}`,
        targetCase: request.targetCase,
        items: merged.slice(0, request.maxItems),
        excluded: merged.slice(request.maxItems).map((item) => ({
          reason: 'max_items',
          recordId: item.recordId,
        })),
      });
    },
  };
}

export function createReplayKnowledgeGateway(
  packet: KnowledgePacket,
): KnowledgeGateway & { freshRetrievals(): number } {
  return {
    async selectPacket() {
      return assertKnowledgePacket(packet);
    },
    freshRetrievals() {
      return 0;
    },
  };
}
