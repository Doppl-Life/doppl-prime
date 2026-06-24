// The output destination — one config, easily changed. Edit doppl.config.json's `vault` to retarget
// every producer. The kernel writes the vault through the sink (src/io/sink.ts) in contract shape.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type DopplConfig = {
  vault: string; // the vault directory (also a git repo), e.g. ../agarden
};

const DEFAULTS: DopplConfig = { vault: '../agarden' };

export function loadConfig(): DopplConfig {
  const path = join(process.cwd(), 'doppl.config.json');
  if (!existsSync(path)) return DEFAULTS;
  return { ...DEFAULTS, ...(JSON.parse(readFileSync(path, 'utf8')) as Partial<DopplConfig>) };
}
