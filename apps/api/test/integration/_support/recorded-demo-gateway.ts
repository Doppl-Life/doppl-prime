import { randomUUID } from 'node:crypto';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  CURRENT_SCHEMA_VERSION,
  validCandidateIdeaCrossDomain,
  validProviderMeta,
  type RunConfig,
} from '@doppl/contracts';
import { createGateway, type ModelGateway, type ProviderCallFn } from '../../../src/model-gateway';
import { createEventStore } from '../../../src/event-store';
import { CHECK_RUNNER_REGISTRY } from '../../../src/check-runners/registry';
import { listRunIds } from '../../../src/projections/run-list';
import { composeRunWorkerDeps } from '../../../src/boot/composeRuntime';
import { runWorker } from '../../../src/runtime';
import { loadConfig } from '../../../src/runtime/config/loadConfig';
import { dumpReplayToFile, type ReplayFixture } from '../../../src/event-store/scripts/dump-replay';

/**
 * Shared loop-capable RECORDED demo gateway (no live SDK — rule #7). Extracted from the PD.3
 * `main-boot.test.ts` harness so BOTH the boot integration tests AND the PD.8a capture/demo-smoke use ONE
 * source (LESSON §5 — single-source the test double). `createFakeGateway`'s per-role fixtures satisfy the
 * gateway DISCIPLINE but do not shape a `CandidateIdea`, so they can't drive the generation loop — this
 * multi-role fake returns role-appropriate structured outputs that DO drive a full run to a terminal with a
 * scored survivor (→ `run.completed.finalIdeaRef` → a `'selected'` winner via the PD.11 bridge). It is the
 * creds-free stand-in for providers (which replay never calls anyway, rule #7).
 */

/** The loop-driving candidate content the `population_generator` role returns (a valid CandidateIdea body). */
export const CANDIDATE_CONTENT = {
  title: validCandidateIdeaCrossDomain.title,
  summary: validCandidateIdeaCrossDomain.summary,
  claims: validCandidateIdeaCrossDomain.claims,
  evidenceRefs: validCandidateIdeaCrossDomain.evidenceRefs,
  subtype: validCandidateIdeaCrossDomain.subtype,
  subtypePayload: validCandidateIdeaCrossDomain.subtypePayload,
};

/** A deterministic multi-role `ProviderCallFn` — role-appropriate structured outputs, no network. */
export function recordedDemoProviderCall(opts: { onCall?: () => void } = {}): ProviderCallFn {
  return (request) => {
    opts.onCall?.();
    let output: unknown;
    if (request.role === 'embedding') {
      output = { vector: [0.1, 0.2, 0.3], embeddingModelId: 'fake-embed', dimension: 3 };
    } else if (request.role === 'final_judge') {
      output = {
        grounding: 4,
        novelty: 3,
        feasibility: 5,
        falsification_survival: 2,
        subtype_check_pass: 4,
      };
    } else if (request.role === 'fusion_synthesis') {
      output = { synthesis: 'a merged child system prompt' };
    } else if (request.role === 'population_generator') {
      output = CANDIDATE_CONTENT;
    } else {
      output = { critique: 'stub critique', confidence: 0.5, scores: { grounding: 4 } };
    }
    return Promise.resolve({ output, providerMeta: validProviderMeta });
  };
}

/** The recorded demo gateway = the real `createGateway` discipline over the multi-role fake provider call. */
export function recordedDemoGateway(opts: { onCall?: () => void } = {}): ModelGateway {
  return createGateway({
    providerCall: recordedDemoProviderCall(opts),
    capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
  });
}

/** The stable, human-readable runId baked into the committed demo fixture (referenced by the runbook). */
export const DEMO_FIXTURE_RUN_ID = 'demo-recorded-001';

/** Placeholder creds — recorded/replay never USE provider keys, but `loadConfig` fail-fast needs them
 *  PRESENT (§15 stays intact; the values are fake + low-entropy, never persisted by the recorded gateway). */
function captureEnv(databaseUrl: string): Record<string, string | undefined> {
  return {
    OPENROUTER_API_KEY: 'or-placeholder-not-used',
    OPENAI_API_KEY: 'oai-placeholder-not-used',
    DATABASE_URL: databaseUrl,
    DOPPL_MAX_GENERATIONS: '1',
    DOPPL_MAX_POPULATION: '2',
  };
}

export interface CaptureDemoFixtureDeps {
  readonly db: NodePgDatabase;
  /** Used only for `loadConfig` fail-fast (placeholder); the db handle is the real write target. */
  readonly databaseUrl: string;
  /** The committed fixtures dir to write `<runId>.json` into (repo `fixtures/replay/`). */
  readonly dir: string;
  readonly runId?: string;
}

/**
 * Capture the committed demo fixture: drive a FULL run to a run-terminal through the REAL production loop
 * (`composeRunWorkerDeps` → `runWorker`) on the recorded gateway (no creds), then `dump-replay` it to
 * `<dir>/<runId>.json`. A FIXED runId keeps the artifact + the runbook's `DOPPL_SEED_FIXTURE=<runId>`
 * stable. One-time (re-record on a schemaVersion bump, §17 — never upcast). Returns the dump result.
 */
export async function captureDemoFixture(
  deps: CaptureDemoFixtureDeps,
): Promise<{ path: string; fixture: ReplayFixture }> {
  const runId = deps.runId ?? DEMO_FIXTURE_RUN_ID;
  const env = captureEnv(deps.databaseUrl);
  const config = loadConfig({ env, fileSources: {} });
  const eventStore = createEventStore({ db: deps.db, secretValues: [] });

  // Append the authoritative run.configured (the operator-initiated write the route makes), then drive the
  // production worker for this fixed runId to a terminal. The recorded RunConfig == the boot ceiling caps.
  const runConfig: RunConfig = { ...config.runConfig, caps: config.caps };
  await eventStore.append({
    id: `${runId}-configured`,
    runId,
    type: 'run.configured',
    actor: 'operator',
    payload: { ...runConfig } as Record<string, unknown>,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  });
  await runWorker(
    composeRunWorkerDeps({
      config,
      modelGateway: recordedDemoGateway(),
      eventStore,
      checkRegistry: CHECK_RUNNER_REGISTRY,
      listRunIds: () => listRunIds(deps.db),
      newId: () => randomUUID(),
      runId,
    }),
  );
  return dumpReplayToFile({ store: eventStore, runId, dir: deps.dir });
}
