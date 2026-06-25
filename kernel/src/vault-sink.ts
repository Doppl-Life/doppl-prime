// The canonical vault: where compiled flow nodes and admitted stock land as the durable artifact.
// Layout is the contract shape — flow/<slug>/<slug>.md and stock/<slug>.md. One vault is one
// directory (also a git repo, e.g. ../agarden); lineage lives in the node body, not the directory.
// This is the single module that owns canonical vault writes.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type CompiledNode = { id: string; stage: string; markdown: string };

export interface Sink {
  readStock(fieldId: string): string | null;
  writeStock(fieldId: string, markdown: string): void;
  writeNode(node: CompiledNode): string;
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
      const path = join(dir, 'flow', node.id, `${node.id}.md`);
      put(path, node.markdown);
      return path;
    },
  };
}

// Write a run's canonical flow nodes into the vault. Returns the written paths.
export function writeFlowNodes(vaultDir: string, nodes: CompiledNode[]): string[] {
  const sink = createVaultSink(vaultDir);
  return nodes.map((node) => sink.writeNode(node));
}
