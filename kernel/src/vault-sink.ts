// The canonical vault: where compiled flow nodes and admitted stock land as the durable artifact.
// Layout is the contract shape — flow/<slug>/<slug>.md and stock/<slug>.md. One vault is one
// directory (also a git repo, e.g. ../agarden); lineage lives in the node body, not the directory.
// This is the single module that owns canonical vault writes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProposalNodeArtifact } from './node-compiler.ts';

export type CompiledNode = { id: string; stage: string; markdown: string };

export interface Sink {
  readStock(fieldId: string): string | null;
  writeStock(fieldId: string, markdown: string): void;
  writeNode(node: CompiledNode): void;
}

export function createVaultSink(dir: string): Sink {
  const put = (path: string, content: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  };
  return {
    readStock(fieldId) {
      const path = join(dir, 'stock', `${fieldId}.md`);
      return existsSync(path) ? readFileSync(path, 'utf8') : null;
    },
    writeStock(fieldId, markdown) {
      put(join(dir, 'stock', `${fieldId}.md`), markdown);
    },
    writeNode(node) {
      put(join(dir, 'flow', node.id, `${node.id}.md`), node.markdown);
    },
  };
}

// Write a run's canonical flow nodes into the vault. Returns the written paths.
export function writeFlowNodes(vaultDir: string, nodes: ProposalNodeArtifact[]): string[] {
  const sink = createVaultSink(vaultDir);
  return nodes.map((node) => {
    sink.writeNode({ id: node.id, stage: node.stage, markdown: node.markdown });
    return join(vaultDir, 'flow', node.id, `${node.id}.md`);
  });
}
