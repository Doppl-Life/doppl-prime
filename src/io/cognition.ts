// Cognition router — the kernel can't think, so it shells out to a CLI per task and matches the
// tool to the call. Every routed task has a preference chain with fail-safe fallback: try the first
// wired tool, and on "not wired / errored" log it and fall to the next, ending at the reasoning
// provider doing its own search. Nothing throws — a run degrades, it does not crash.
import { spawnSync } from 'node:child_process';
import { loadConfig } from './config.ts';

export type InvokeResult = { ok: boolean; out: string; note: string };

function onPath(cmd: string): boolean {
  return spawnSync('command', ['-v', cmd], { shell: true }).status === 0;
}

// Run a configured tool headlessly with one prompt; capture stdout. Failures are reported, not thrown.
export function invoke(tool: string, prompt: string): InvokeResult {
  const spec = loadConfig().tools[tool];
  if (!spec) return { ok: false, out: '', note: `${tool}: not configured` };
  if (!onPath(spec.cmd)) return { ok: false, out: '', note: `${tool}: '${spec.cmd}' not on PATH (not wired)` };
  const r = spawnSync(spec.cmd, [...spec.headless, prompt], { encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  if (r.error) return { ok: false, out: '', note: `${tool}: ${r.error.message}` };
  if (r.status !== 0) return { ok: false, out: (r.stdout ?? '').trim(), note: `${tool}: exit ${r.status} ${(r.stderr ?? '').trim().slice(0, 160)}` };
  return { ok: true, out: (r.stdout ?? '').trim(), note: `${tool}: ok` };
}

export type RouteResult = { tool: string; out: string; tried: string[] };

// Route a discovery scenario to the first wired tool in its chain; fall back through the chain; the
// final fallback is the configured reasoning provider doing its own search. `tried` is the audit log
// (which tools were attempted and why each was skipped) — the "scream at whichever isn't wired".
export function route(scenario: string, prompt: string): RouteResult {
  const cfg = loadConfig();
  const chain = [...(cfg.discovery[scenario] ?? []), cfg.cognition.reasoning];
  const tried: string[] = [];
  for (const tool of chain) {
    const r = invoke(tool, prompt);
    tried.push(r.note);
    if (r.ok && r.out) return { tool, out: r.out, tried };
  }
  return { tool: 'none', out: '', tried };
}

// Reasoning cognition (recover a problem, generate doppls) via the configured provider.
export function reason(prompt: string): InvokeResult {
  return invoke(loadConfig().cognition.reasoning, prompt);
}

function tryParse<T>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch { return null; }
}

// Pull a JSON value out of a model reply (tolerates ```json fences and surrounding prose).
export function extractJSON<T>(text: string): T | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { const v = tryParse<T>(fence[1].trim()); if (v !== null) return v; }
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
  if (start >= 0 && end > start) { const v = tryParse<T>(text.slice(start, end + 1)); if (v !== null) return v; }
  return tryParse<T>(text.trim());
}

// Ask a specific provider for a JSON answer; null on unavailable/unparseable so the caller can fall back.
export function askJSON<T>(providerKey: string, prompt: string): { value: T | null; note: string } {
  const r = invoke(providerKey, `${prompt}\n\nReturn ONLY JSON — no prose, no markdown fences.`);
  if (!r.ok) return { value: null, note: r.note };
  return { value: extractJSON<T>(r.out), note: r.note };
}
