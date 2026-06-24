// The output target: where compiled flow nodes and admitted stock discoveries are written.
// Pure src/*.ts stays compute-only; the sink is the I/O edge. One vault is one directory (which
// is also a git repo, e.g. ../agarden -> Doppl-Life/agarden); publishing to the remote is a seam.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type CompiledNode = {
  id: string; // SlugId
  stage: string;
  markdown: string;
};

export interface Sink {
  readStock(fieldId: string): string | null;
  writeStock(fieldId: string, markdown: string): void;
  writeNode(node: CompiledNode): void;
  publish(message: string): void;
}

// Writes the vault layout the contracts define: flow/<slug>/<slug>.md and stock/<slug>.md.
// Lineage is the body `prev_id` wikilink, not the directory — nodes are flat under flow/.
export function createVaultSink(dir: string): Sink {
  const put = (path: string, content: string): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  };
  return {
    readStock(fieldId: string): string | null {
      const path = join(dir, 'stock', `${fieldId}.md`);
      return existsSync(path) ? readFileSync(path, 'utf8') : null;
    },
    writeStock(fieldId: string, markdown: string): void {
      put(join(dir, 'stock', `${fieldId}.md`), markdown);
    },
    writeNode(node: CompiledNode): void {
      put(join(dir, 'flow', node.id, `${node.id}.md`), node.markdown);
    },
    publish(_message: string): void {
      // Seam: the vault dir is a git repo. Commit + push is an outward side effect, built
      // deliberately when wanted. For now, publish by committing/pushing the vault repo by hand.
      throw new Error('publish is a seam — commit and push the vault repo manually for now.');
    },
  };
}
