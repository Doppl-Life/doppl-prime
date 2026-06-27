import { describe, expect, test } from 'vitest';
import type { EventStore } from '../../src/event-store';
import {
  createLiveGateway,
  createModelRegistry,
  createOpenRouterClient,
  loadModelRegistry,
  type ModelGateway,
} from '../../src/model-gateway';
import { DEFAULT_MODEL_REGISTRY } from '../../src/config/model-registry.config';
import { runComparativeJudge } from '../../src/verifier/judge/comparative-judge';
import { GOLD_SET, goldCandidateIdea, goldProblemIds } from './gold-set/gold-set';
import { computeDiscrimination, meansInBand, passesGate, type ScoredEntry } from './discrimination';
import { JUDGE_AXIS_CRITERIA_V4 } from './criteria-v4';

/**
 * Phase J — J2 LIVE discrimination harness (eval-tested, NOT a unit test; `.eval.ts` so the unit glob skips
 * it). Runs the REAL held-out judge over the 15 signed-off gold candidates and measures whether it
 * DISCRIMINATES the tiers (plan §7-J). OPT-IN: `skipIf` keyless so `/preflight` + CI stay free + green — the
 * non-vacuous metric LOGIC is pinned keyless in `discrimination.test.ts` (the gold targets pass; a flat
 * distribution fails). This harness is the paid operator run that captures the BEFORE (mvp-3, expected to
 * FAIL) and, once v4 criteria are authored (J3), the AFTER (injected via the Slice-Js `criteriaSource` seam,
 * expected to PASS).
 *
 * Run: `OPENROUTER_API_KEY=… pnpm vitest run --config <eval-config> test/eval/judge-calibration.eval.ts`
 * (a dedicated eval config is the J2 follow-up; for now it runs via an explicit vitest invocation).
 */

const JUDGE_ACCEPTANCE_MAX = 50; // 5 axes × 0–10, all weights 1 — the runner's maxValue basis.

function inMemoryStore(): EventStore {
  let seq = 0;
  const append: EventStore['append'] = (envelope) =>
    Promise.resolve({ ...envelope, sequence: seq++ } as Awaited<ReturnType<EventStore['append']>>);
  return { append, readByRun: () => Promise.resolve([]) } as unknown as EventStore;
}

function liveGateway(): ModelGateway {
  const registry = createModelRegistry(loadModelRegistry({ defaults: DEFAULT_MODEL_REGISTRY }));
  const client = createOpenRouterClient(process.env);
  return createLiveGateway({ registry, client });
}

/**
 * Score the whole corpus with the live judge: each problem's 5 tiered candidates are judged TOGETHER
 * (peer context, the comparative path), then pooled. An optional `criteriaSource` injects a v4 criteria
 * without flipping the default (Slice Js). Returns one ScoredEntry per non-rejected candidate.
 */
async function scoreCorpus(gateway: ModelGateway, criteriaSource?: string): Promise<ScoredEntry[]> {
  const store = inMemoryStore();
  const scored: ScoredEntry[] = [];
  for (const problemId of goldProblemIds()) {
    const entries = GOLD_SET.filter((e) => e.problemId === problemId);
    const candidates = entries.map((e) => goldCandidateIdea(e));
    const byId = new Map(entries.map((e) => [`gold:${e.problemId}:${e.tier}`, e]));
    const results = await runComparativeJudge({
      gateway,
      store,
      candidates,
      runContext: { runId: `gold_${problemId}`, generationId: 'gold_gen' },
      ...(criteriaSource !== undefined ? { criteriaSource } : {}),
    });
    for (const [candidateId, result] of results) {
      const entry = byId.get(candidateId);
      if (result === null || entry === undefined) continue;
      scored.push({
        problemId,
        tier: entry.tier,
        acceptance: result.acceptance / JUDGE_ACCEPTANCE_MAX,
      });
    }
  }
  return scored;
}

function logReport(label: string, scored: ScoredEntry[]): void {
  const report = computeDiscrimination(scored);
  const gate = passesGate(report);
  // Per-tier mean [min–max] + each problem's score, so a within-tier outlier (the candidate driving the band)
  // is visible at a glance — that is what diagnoses a within-tier-band failure.
  const tierLines = (['weak', 'mediocre', 'good', 'excellent', 'gamed'] as const)
    .map((t) => {
      const s = report.tierStats[t];
      if (s === undefined) return `    ${t.padEnd(9)} —`;
      const members = scored
        .filter((e) => e.tier === t)
        .map((e) => `${e.problemId} ${e.acceptance.toFixed(2)}`)
        .join(', ');
      return `    ${t.padEnd(9)} mean ${s.mean.toFixed(3)} [${s.min.toFixed(2)}–${s.max.toFixed(2)}]  (${members})`;
    })
    .join('\n');
  console.log(
    `\n[judge-calibration ${label}] scored=${scored.length}/15\n` +
      `${tierLines}\n` +
      `  spread=${report.spread?.toFixed(3)} minGap=${report.minGap?.toFixed(3)} ` +
      `monotone=${report.monotone} gamedBelowMediocre=${report.gamedBelowMediocre} ` +
      `maxWithinTierBand=${report.maxWithinTierBand?.toFixed(3)}\n` +
      `  meansInBand=${JSON.stringify(meansInBand(report))}\n` +
      `  GATE: ${gate.pass ? 'PASS' : 'FAIL'}${gate.failures.length ? ' — ' + gate.failures.join('; ') : ''}`,
  );
}

describe.skipIf(!process.env.OPENROUTER_API_KEY)(
  'judge-calibration — LIVE held-out judge over the gold set',
  () => {
    test('baseline_mvp3_is_characterized_not_asserted_to_pass', async () => {
      const scored = await scoreCorpus(liveGateway());
      logReport('mvp-3 BASELINE', scored);
      // BASELINE: we capture mvp-3's behavior; it is EXPECTED to fail discrimination (flat ~0.53). The only
      // hard assertion is that the run actually produced scores (most candidates judged, not all rejected).
      expect(scored.length).toBeGreaterThanOrEqual(12);
    }, 180_000);

    // J3 — the DRAFT v4 criteria injected via the Slice-Js `criteriaSource` seam (default NOT flipped). v4
    // is EXPECTED to pass the discrimination gate; this is the AFTER to the mvp-3 baseline's BEFORE. If it
    // fails, the failures name which gate check (spread / monotone / gamed leak) so the criteria can be tuned.
    test('v4_criteria_pass_the_discrimination_gate', async () => {
      const scored = await scoreCorpus(liveGateway(), JUDGE_AXIS_CRITERIA_V4);
      logReport('v4 (Slice-Js injected, default NOT flipped)', scored);
      const gate = passesGate(computeDiscrimination(scored));
      expect(gate.failures).toEqual([]);
      expect(gate.pass).toBe(true);
    }, 180_000);
  },
);
