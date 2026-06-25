// Reads one node from the vault (the configured ../agarden/flow) so the kernel's input is the garden,
// not a fixture. Parses enough to grow the next stage: id, stage, headline, portable synopsis, prev_id.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type VaultNode = {
  id: string;
  stage: string;
  headline: string;
  synopsis: string; // the portable synopsis copied into a child's Trace
  prevId: string | null;
};

function frontmatter(text: string): string {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : '';
}

function fmField(fm: string, key: string): string | null {
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
}

export function readNode(vaultDir: string, slug: string): VaultNode | null {
  const path = join(vaultDir, 'flow', slug, `${slug}.md`);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const fm = frontmatter(text);
  const stage = fmField(fm, 'stage') ?? 'case_study';
  const headline = (text.match(/^#\s+(.+)$/m)?.[1] ?? fmField(fm, 'name') ?? slug).trim();

  let prevId: string | null = null;
  const prevMatch = text.match(/^prev_id:\s*(.+)$/m);
  if (prevMatch) {
    const wl = prevMatch[1].match(/\[\[([^\]]+)\]\]/);
    prevId = wl ? wl[1] : null;
  }

  // A case study's portable synopsis is its `## Synopsis`; every other stage's is its headline.
  let synopsis = headline;
  if (stage === 'case_study') {
    const syn = text.match(/##\s+Synopsis\s*\n+([\s\S]*?)(?:\n##\s|\n#\s|$)/);
    if (syn) synopsis = syn[1].trim();
  }

  return { id: fmField(fm, 'id') ?? slug, stage, headline, synopsis, prevId };
}
