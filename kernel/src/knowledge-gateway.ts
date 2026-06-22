import { readFile } from 'node:fs/promises';
import type { KnowledgePacket } from './contracts.ts';

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
  return {
    async selectPacket(request) {
      return {
        ...packet,
        id: packet.id || `packet:${request.runId}:${request.targetCase}`,
        targetCase: request.targetCase,
        items: packet.items.slice(0, request.maxItems),
      };
    },
  };
}

export function createReplayKnowledgeGateway(
  packet: KnowledgePacket,
): KnowledgeGateway & { freshRetrievals(): number } {
  return {
    async selectPacket() {
      return packet;
    },
    freshRetrievals() {
      return 0;
    },
  };
}
