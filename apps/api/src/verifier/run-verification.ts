import type { SubtypeName } from "@doppl/contracts";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  type CheckRegistry,
  TRANSFER_ADAPTER_IDS,
  ZEITGEIST_ADAPTER_IDS,
  runCheck,
} from "../check-runners/index.js";
import type { CheckCtx } from "../check-runners/registry.js";
import { appendEvent } from "../event-store/append.js";
import type { ModelGateway } from "../model-gateway/gateway.js";
import type { PersistedCandidate } from "../runtime/generation-loop.js";
import { assignCriticsForGeneration } from "./council/rotation.js";
import { runCouncil } from "./council/run-council.js";

/**
 * `makeVerifyHook` (U9) — bridges Phase 4 into Phase 3's
 * `runGeneration.deps.verifyHook` injection point. Given persisted
 * candidates from a generation, runs the critic council (U4) for all 5
 * mandates per candidate AND the subtype-appropriate check adapters
 * (U7/U8). All evidence is persisted as `critic.reviewed` and
 * `check.completed` events; the hook returns void.
 *
 * The generationIndex is not in the Phase 3 verifyHook signature, so we
 * take it via the `getCurrentGenerationIndex` callback. The caller
 * (worker, processRun) updates a captured counter each generation
 * before invoking runGeneration.
 */

export interface MakeVerifyHookDeps {
  // biome-ignore lint/suspicious/noExplicitAny: drizzle's tx generic varies by dialect
  db: NodePgDatabase<any>;
  gateway: ModelGateway;
  registry: CheckRegistry;
  runId: string;
  runSeed: string;
  enabledSubtypes: readonly SubtypeName[];
  criticAgenomeIds: readonly string[];
  everyNGenerations: number;
  rubricByMandate: Record<
    | "factual_grounding"
    | "novelty_prior_art"
    | "feasibility"
    | "falsification"
    | "subtype_specific",
    string
  >;
  getCurrentGenerationIndex: () => number;
  /** Optional dependency carry-bag forwarded to check adapters. */
  checkCtxDeps?: Record<string, unknown>;
}

export type VerifyHook = (candidates: PersistedCandidate[]) => Promise<void>;

/**
 * PersistedCandidate.rawOutput is the LLM's response — usually a JSON
 * string from the gateway adapter, but the test path sometimes passes
 * a pre-parsed object. Normalize to "object if parseable" so check
 * adapters and critics see the candidate's actual fields (subtypePayload,
 * title, summary, etc) instead of a string.
 */
function parseRawOutput(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function adapterIdsForSubtype(subtype: SubtypeName): readonly string[] {
  switch (subtype) {
    case "cross_domain_transfer":
      return TRANSFER_ADAPTER_IDS;
    case "zeitgeist_synthesis":
      return ZEITGEIST_ADAPTER_IDS;
  }
}

export function makeVerifyHook(deps: MakeVerifyHookDeps): VerifyHook {
  const appendEventBound = (input: Parameters<typeof appendEvent>[1]) =>
    appendEvent(deps.db, input);

  const ctx: CheckCtx = {
    mode: "recorded",
    ...(deps.checkCtxDeps !== undefined ? { deps: deps.checkCtxDeps } : {}),
  };

  return async (candidates: PersistedCandidate[]) => {
    if (candidates.length === 0) {
      return;
    }
    const generationIndex = deps.getCurrentGenerationIndex();
    const generationId = `gen_${generationIndex}`;

    // ---- Council pass ----
    const { assignment } = assignCriticsForGeneration({
      generationIndex,
      runSeed: deps.runSeed,
      criticAgenomeIds: deps.criticAgenomeIds,
      everyNGenerations: deps.everyNGenerations,
    });

    // PersistedCandidate.rawOutput is the LLM's response — a JSON
    // string from the gateway adapter. Critics and check adapters
    // both expect an OBJECT with .subtypePayload (etc), so without
    // parsing every check skipped with "missing_subtype_payload" and
    // every critic was reasoning about a string-of-JSON instead of
    // the candidate. Parse once per candidate and pass the object.
    const candidatesWithParsed = candidates.map((c) => ({
      ...c,
      parsed: parseRawOutput(c.rawOutput),
    }));

    await runCouncil({
      gateway: deps.gateway,
      appendEvent: appendEventBound,
      candidates: candidatesWithParsed.map((c) => ({
        candidateId: c.candidateId,
        candidate: c.parsed,
      })),
      criticAssignment: assignment,
      rubricByMandate: deps.rubricByMandate,
      runId: deps.runId,
      generationId,
      correlationIdFor: (candidateId, mandate) => `verify_${candidateId}_${mandate}`,
    });

    // ---- Subtype-check pass ----
    // For each enabled subtype's adapters, dispatch via the registry.
    // Candidates from Phase 3's generation-loop don't yet carry an
    // explicit subtype on the PersistedCandidate (only rawOutput); we
    // run every enabled-subtype's adapter set. Adapters return
    // skipped+reason when the candidate's payload shape doesn't match
    // their target subtype, so the unwanted-subtype runs cost only the
    // skip event and zero gateway/retrieval spend.
    for (const subtype of deps.enabledSubtypes) {
      const adapterIds = adapterIdsForSubtype(subtype);
      for (const candidate of candidatesWithParsed) {
        for (const adapterId of adapterIds) {
          await runCheck({
            db: deps.db,
            registry: deps.registry,
            adapterId,
            candidateId: candidate.candidateId,
            candidate: candidate.parsed,
            ctx,
            runId: deps.runId,
            correlationId: `verify_${candidate.candidateId}_${adapterId}`,
            generationId,
            agenomeId: candidate.agenomeId,
          });
        }
      }
    }
  };
}
