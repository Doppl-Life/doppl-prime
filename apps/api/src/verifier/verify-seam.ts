import type { CandidateIdea, CheckRunnerRegistry } from '@doppl/contracts';
import type { EventStore, RunEventRow } from '../event-store';
import type { ModelGateway } from '../model-gateway';
import { readRngSeed } from '../runtime';
import type { AppConfig } from '../runtime/config/configSchema';
import type { SeamContext, VerifySeam } from '../runtime/loop/generationLoop';
import { runCheck } from '../check-runners/run-check';
import { runCouncil } from './council/run-council';
import { selectCriticMandates } from './council/rotation';
import { runJudge } from './judge/judge-call';

/**
 * P4.12 — the unified verifier VerifySeam adapter (ARCHITECTURE.md §7/§5/§2.5/§4). `createVerifySeam(deps)`
 * returns the kernel generation loop's frozen `verify` port and, per candidate handed in as DATA, drives
 * the three verifier subsystems by COMPOSING the already-shipped runners behind the port — the rotating
 * critic council (P4.6/P4.7), the subtype-matched allowlisted check-runners (P4.5/P4.9/P4.10), and the
 * held-out final judge (P4.8). It rebuilds none of them and adds NO new safety logic — the inherited
 * invariants live in the composed modules: rule #5 (candidate reaches critics/judge only as
 * sentinel-delimited DATA via the isolation seam), #3 (checks run only through the frozen allowlist gate),
 * #6 (the judge/rubric/policy is immutable to agents), #8 (markers + failed attempts debit no energy),
 * #7/#9 (provider calls only via the ModelGateway port; replay re-reads persisted outcomes).
 *
 * The seam is the §2.5 composition point: selection injects it as `seams.verify` at its boot composition
 * root (cross-track, after the track/verifier→cody merge). It emits ONLY through the per-generation
 * `ctx.append` it is handed — never `deps.eventStore.append`; the deps store is consulted READ-ONLY, for
 * the authoritative per-generation index. It authors no kernel-owned lifecycle event (the loop owns those)
 * and changes no contract.
 */

export interface VerifySeamDeps {
  /** The provider seam the council + judge call (`.call`); distinct from the loop's population generator. */
  readonly gateway: ModelGateway;
  /**
   * READ-ONLY for the seam: `readByRun` supplies the authoritative per-generation index (Option A — the
   * persisted `generation.started{index}`, never the opaque generationId string). Emission flows
   * EXCLUSIVELY through `ctx.append`; `deps.eventStore.append` is never called.
   */
  readonly eventStore: EventStore;
  /** The frozen allowlist registry — the seam runs the descriptors whose `subtype` matches the candidate. */
  readonly registry: CheckRunnerRegistry;
  /** The composed app config — the seam reads only `runConfig` (for the persisted run RNG seed). */
  readonly config: AppConfig;
  /** Held-out judge rubric SOURCE — defaults inside `runJudge` to the immutable `DEFAULT_JUDGE_RUBRIC`. */
  readonly rubricSource?: unknown;
  /** Active critic-set size K — defaults inside `selectCriticMandates` to `DEFAULT_ACTIVE_CRITIC_COUNT`. */
  readonly activeCount?: number;
}

/**
 * Read the authoritative generation index from the persisted `generation.started{generationId,index}`
 * (Option A — replay-safe + decoupled from the loop's private id-string format; IDs are opaque). The loop
 * always emits this marker before invoking the verify seam, so its absence is an invariant violation —
 * fail loud rather than silently rotate on a wrong index.
 */
function readGenerationIndex(rows: readonly RunEventRow[], generationId: string): number {
  for (const row of rows) {
    if (row.type === 'generation.started' && row.generationId === generationId) {
      const index = (row.payload as { index?: unknown }).index;
      if (typeof index === 'number' && Number.isInteger(index) && index >= 0) return index;
    }
  }
  throw new Error(
    `createVerifySeam: no persisted generation.started{index} for generation ${generationId}`,
  );
}

export function createVerifySeam(deps: VerifySeamDeps): VerifySeam {
  return async (candidates: readonly CandidateIdea[], ctx: SeamContext): Promise<void> => {
    // 1. The per-generation index — the authoritative persisted marker, NOT the generationId string.
    const rows = await deps.eventStore.readByRun(ctx.runId);
    const generationIndex = readGenerationIndex(rows, ctx.generationId);

    // 2. The active mandate set, selected ONCE per generation (pure, replay-faithful K-of-N over the
    //    persisted run seed + generation index). The SAME set is used for every candidate this generation.
    const rngSeed = readRngSeed(deps.config.runConfig);
    const mandates = selectCriticMandates({
      rngSeed,
      generationIndex,
      ...(deps.activeCount !== undefined ? { activeCount: deps.activeCount } : {}),
    });

    // 3. The per-generation emit shim: the sub-runners take a full EventStore but call only `.append` — so
    //    route their writes through the injected `ctx.append` (the seam contract); reads delegate harmlessly.
    const store: EventStore = { append: ctx.append, readByRun: deps.eventStore.readByRun };

    // 4. Per candidate (DATA): council → subtype-matched allowlisted checks → held-out judge.
    for (const candidate of candidates) {
      const runContext = {
        runId: ctx.runId,
        generationId: ctx.generationId,
        candidateId: candidate.id,
      };

      // 4a. Critic council — the rotating active mandate set (P4.6/P4.7).
      await runCouncil({ gateway: deps.gateway, store, candidate, mandates, runContext });

      // 4b. Allowlisted checks — STRICT subtype match (subtype-less descriptors never auto-apply, so the
      //     P4.5 placeholders emit no spurious check.completed into the authoritative log). The candidate's
      //     subtype payload is the DATA the deterministic adapters parse; retrieval is not threaded, so
      //     grounding adapters record skipped{retrieval_unavailable} (retrieval-FETCH is a future slice).
      const candidatePayload = JSON.stringify(candidate.subtypePayload);
      for (const descriptor of Object.values(deps.registry)) {
        if (descriptor.subtype !== candidate.subtype) continue;
        await runCheck({
          store,
          registry: deps.registry,
          request: {
            adapterId: descriptor.id,
            checkType: descriptor.checkType,
            resultId: `check:${ctx.runId}:${candidate.id}:${descriptor.id}`,
            candidate: candidatePayload,
          },
          runContext,
        });
      }

      // 4c. Held-out final judge (P4.8) — emits judge.reviewed←JudgeResult keyed by candidateId (§2.5 seam).
      await runJudge({
        gateway: deps.gateway,
        store,
        candidate,
        runContext,
        ...(deps.rubricSource !== undefined ? { rubricSource: deps.rubricSource } : {}),
      });
    }
  };
}
