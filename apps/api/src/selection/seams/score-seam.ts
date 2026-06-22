import { CheckResult, CriticReview, EnergyEvent, JudgeResult } from '@doppl/contracts';
import type {
  AgenomeStatus,
  CandidateIdea,
  FinalJudgeRubric,
  ScoringPolicy,
} from '@doppl/contracts';
import type { EventStore, RunEventRow } from '../../event-store';
import type { ModelGateway } from '../../model-gateway';
import type { ScoreSeam } from '../../runtime';
import { scoreNovelty, type NoveltyComparison } from '../novelty/score-novelty';
import { energyEfficiency } from '../components/energy-efficiency';
import { criticScores } from '../components/critic-scores';
import { judgeAcceptance } from '../components/judge-acceptance';
import { scoreFitness } from '../fitness/score-fitness';
import { cull, type AgenomeFitness, type CullPolicy, type ScoredCandidate } from '../cull';

/**
 * createScoreSeam (P5.6/P5.7, ARCHITECTURE.md §8) — selection's real impl of the kernel's injected
 * `ScoreSeam` port (`generationLoop.ts:447`). It drives ONE generation's scoring end-to-end over the
 * real persisted log: per candidate (in the order received) `scoreNovelty` (gateway embedding →
 * `novelty.scored` / degrade) → read that candidate's verifier/energy evidence back from the log via
 * `readByRun` → compose the five decomposed fitness components (incl. the held-out-judge acceptance
 * `candidateId` join) → `scoreFitness` (→ `fitness.scored`) → after ALL candidates, `cull`
 * (→ at most one `lineage.culled`).
 *
 * This is the integration of the already-unit-pinned P5.2–P5.7 domain fns — NO new scoring math. It is
 * pure orchestration over INJECTED deps: it composes the domain fns, reads its cross-subsystem inputs
 * back from the PERSISTED log (rule #7 — never a live counter, so `fitness.scored` is reconstructable
 * on replay), and emits ONLY through the injected `ctx.append` (rule #2/#4 — never a direct event-table
 * write); it appends NO `energy.spent` (the markers are no-debit, rule #8). The immutable `policy` /
 * `rubric` are INJECTED (loaded from immutable config by the W3 boot root, never an agent-writable path
 * — rule #6/§14); the seam VALIDATES the rubric via the existing `judgeAcceptance` load gate (it does
 * not own the loader).
 */
export interface ScoreSeamDeps {
  readonly gateway: ModelGateway;
  readonly readByRun: EventStore['readByRun'];
  readonly policy: ScoringPolicy;
  readonly rubric: FinalJudgeRubric;
  readonly cullPolicy: CullPolicy;
  /** Injected id factory — keeps the seam free of `Math.random`/uuid (byte-deterministic, §24). */
  readonly newId: () => string;
}

/** A minimal structural view of a frozen contract's `safeParse` — re-parse persisted payloads
 * defensively (trust the write-time validation, lesson §20/§31) without coupling to the Zod type. */
interface SafeParser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/**
 * parsePayloads — Q4: filter the persisted rows by event `type` then the matching id (candidate-keyed
 * for critic/check/judge, agenome-keyed for energy — §4/§5), `safeParse`-ing each payload against its
 * frozen model and dropping any that fail (a corrupt row never poisons a component).
 */
function parsePayloads<T>(
  rows: readonly RunEventRow[],
  type: string,
  schema: SafeParser<T>,
  match: (row: RunEventRow) => boolean,
): T[] {
  const out: T[] = [];
  for (const row of rows) {
    if (row.type !== type || !match(row)) continue;
    const parsed = schema.safeParse(row.payload);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function createScoreSeam(deps: ScoreSeamDeps): ScoreSeam {
  return async (candidates: readonly CandidateIdea[], ctx): Promise<void> => {
    const { runId, generationId, append } = ctx;

    // Read the persisted verifier/energy evidence ONCE per run (rule #7 — every component derives from
    // the log, never a live counter). The verify seam appended this BEFORE the score seam runs.
    const rows = await deps.readByRun(runId);

    // Q1 — accumulate the comparison set in-seam: each happy-path NoveltyScore feeds the next
    // candidate's cosine. The just-emitted novelty.scored is also in the log, so the two are
    // equivalent; the local accumulator is the cleaner, byte-deterministic single source for the live
    // pass and avoids an O(n²) re-read.
    const comparison: NoveltyComparison[] = [];

    // Group scored candidates by agenome for the cull-after-all pass.
    const scoredByAgenome = new Map<string, ScoredCandidate[]>();

    for (const candidate of candidates) {
      // 1. Novelty — emits novelty.scoring_started + (novelty.scored | novelty_scoring_degraded).
      const novelty = await scoreNovelty(
        { runId, generationId, candidateId: candidate.id, summary: candidate.summary, comparison },
        { gateway: deps.gateway, emit: append, newId: deps.newId },
      );
      if (!novelty.degraded) {
        comparison.push({
          candidateId: candidate.id,
          vector: novelty.noveltyScore.vector,
          summary: candidate.summary,
        });
      }

      // 2. Read this candidate's evidence back from the persisted log (Q4).
      const energyEvents = parsePayloads(
        rows,
        'energy.spent',
        EnergyEvent,
        (row) => row.agenomeId === candidate.agenomeId,
      );
      const reviews = parsePayloads(
        rows,
        'critic.reviewed',
        CriticReview,
        (row) => row.candidateId === candidate.id,
      );
      const checkResults = parsePayloads(
        rows,
        'check.completed',
        CheckResult,
        (row) => row.candidateId === candidate.id,
      );
      const judgeResult = parsePayloads(
        rows,
        'judge.reviewed',
        JudgeResult,
        (row) => row.candidateId === candidate.id,
      )[0];

      // 3. Compose the five components → one fitness.scored (judge join by candidateId, rule #6;
      //    judgeAcceptance also enforces the immutable-rubric load gate, lesson §40).
      const fitness = await scoreFitness(
        {
          runId,
          generationId,
          candidateId: candidate.id,
          novelty,
          energyEfficiency: energyEfficiency(energyEvents),
          criticScores: criticScores(reviews),
          judgeAcceptance: judgeAcceptance(judgeResult, deps.rubric),
          checkResults,
        },
        deps.policy,
        { emit: append, newId: deps.newId },
      );

      // 4. Track for the cull pass. Q2 — status 'active': an agenome that produced a candidate THIS
      //    generation is non-terminal by construction at score time (the terminal-skip in `cull` guards
      //    the cross-generation reuse the score path doesn't hit).
      const scored = scoredByAgenome.get(candidate.agenomeId) ?? [];
      scored.push({ candidateId: candidate.id, total: fitness.total });
      scoredByAgenome.set(candidate.agenomeId, scored);
    }

    // 5. Cull weak lineages AFTER all candidates are scored (→ at most one lineage.culled).
    const agenomes: AgenomeFitness[] = [...scoredByAgenome.entries()].map(
      ([agenomeId, scored]) => ({
        agenomeId,
        status: 'active' as AgenomeStatus,
        candidates: scored,
      }),
    );
    await cull({ runId, generationId, agenomes }, deps.cullPolicy, {
      emit: append,
      newId: deps.newId,
    });
  };
}
