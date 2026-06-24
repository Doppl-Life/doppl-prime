// Run configuration — one file, easily changed. Picks the output vault, the cognition providers
// (which CLI/model recovers problems, generates doppls, judges), the discovery tool routing per
// scenario, and the per-run node cap. Mirrors the spike's provider section, config-driven.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type ToolSpec = {
  cmd: string; // the CLI binary, e.g. "claude"
  headless: string[]; // args that put it in non-interactive mode before the prompt, e.g. ["-p"]
};

export type DopplConfig = {
  vault: string; // the vault directory (also a git repo), e.g. ../agarden
  maxNodesPerRun: number; // cap on nodes a single run may emit (the agenome may fuse/split below this)
  cognition: {
    reasoning: string; // provider key (a tools[] entry) for generate / generate-doppls
    judge: string; // provider key for the judge
  };
  discovery: Record<string, string[]>; // scenario -> ordered tool preference; the router appends `reasoning` as the last-resort fallback
  tools: Record<string, ToolSpec>; // tool key -> how to invoke it headlessly
};

const DEFAULTS: DopplConfig = {
  vault: '../agarden',
  maxNodesPerRun: 2,
  cognition: { reasoning: 'claude', judge: 'claude' },
  discovery: { web: ['firecrawl'] },
  tools: { claude: { cmd: 'claude', headless: ['-p'] } },
};

export function loadConfig(): DopplConfig {
  const path = join(process.cwd(), 'doppl.config.json');
  if (!existsSync(path)) return DEFAULTS;
  return { ...DEFAULTS, ...(JSON.parse(readFileSync(path, 'utf8')) as Partial<DopplConfig>) };
}
