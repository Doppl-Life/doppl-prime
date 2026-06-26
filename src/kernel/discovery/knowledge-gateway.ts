import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { assertKnowledgePacket, type KnowledgePacket } from '../boundary.ts';

export type KnowledgePacketRequest = {
  runId: string;
  targetCase: string;
  maxItems: number;
};

export type KnowledgeGateway = {
  selectPacket(request: KnowledgePacketRequest): Promise<KnowledgePacket>;
};

export async function createJsonKnowledgeGateway(packetFile: string): Promise<KnowledgeGateway> {
  const packet = JSON.parse(await readFile(packetFile, 'utf8')) as KnowledgePacket;
  assertKnowledgePacket(packet);
  return {
    async selectPacket(request) {
      return assertKnowledgePacket({
        ...packet,
        id: packet.id || `packet:${request.runId}:${request.targetCase}`,
        targetCase: request.targetCase,
        items: packet.items.slice(0, request.maxItems),
      });
    },
  };
}

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

export async function createAgardenStockKnowledgeGateway(vaultDir: string): Promise<KnowledgeGateway> {
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
      return assertKnowledgePacket({
        id: `stock:${request.runId}:${request.targetCase}`,
        targetCase: request.targetCase,
        items: items.slice(0, request.maxItems),
        excluded: items.slice(request.maxItems).map((item) => ({
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
