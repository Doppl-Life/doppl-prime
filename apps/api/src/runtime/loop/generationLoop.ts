import type {
  Agenome,
  CandidateIdea,
  GenerationStatus,
  ModelGatewayRequest,
  ModelGatewayResponse,
  RunEventType,
} from '@doppl/contracts';
import { CURRENT_SCHEMA_VERSION } from '@doppl/contracts';
import type { AppendInput, AppendResult, EventStore, RunEventRow } from '../../event-store';
import type { AppConfig } from '../config/configSchema';
import { enforceCap } from '../caps/capEnforcer';
import { canTransitionGeneration } from '../state/generationStateMachine';
import { materializeGen0 } from '../seed/gen0SeedSet';
import { createSeededRng, readRngSeed } from '../rng/seededRng';
import { createLiveOutcomeSource, type OutcomeSource } from '../rng/persistOutcomes';

/**
 * P3.10b — the generation-loop SKELETON (ARCHITECTURE.md §5/§3/§4/§6, KEY SAFETY RULES #1/#2/#9).
 *
 * The bounded happy-path control flow that drives a run's generations through the §3 generation lifecycle
 * via the P3.2 guards, APPENDS every KERNEL-owned event (generation.* lifecycle + the 3 operation-start
 * markers + the tool_call relay + agenome.spawned + candidate.created) through the P1.3 append path,
 * produces candidates through the gateway (`population_generator`), and DELEGATES verify/score/reproduce to
 * INJECTED seam ports whose events it consumes as DATA, NEVER authors (option-b: selection P5 is not in
 * cody, verifier retired — the loop is pure orchestration + ports; the real seam impls are the demo/
 * integration track's job). Bounded by maxGenerations + maxPopulation via the P3.4 cap enforcer (rule #1).
 *
 * §5 ownership: the loop is the SOLE emitter of authoritative lifecycle events; the substrate (guards,
 * caps, RNG, seed set) stays pure decide/compute. The loop NEVER critiques/checks/scores itself.
 *
 * Happy path only. Deliberately OUT (named, not silent): energy.spent emission + scrub + provider_call_
 * failed (10d) · kill/cap-breach/wall-clock abort + drain + latching halt (10e) · partial-failure / zero-
 * survivors / degenerate-reproduction edges (10c) · run.started/completed + terminal classification
 * (P3.11) · the worker that calls the loop (P3.12) · successor-population threading (the seam's reproduced
 * offspring → the next generation's population — deferred to a tracked later slice; gen-0 persists here).
 */

/** A provider tool call surfaced by the gateway for the loop to relay (observability — §4/§12). */
export interface ToolCallObservation {
  readonly toolName: string;
}

/**
 * The gateway result the loop consumes. A runtime-local port that COMPOSES the frozen ModelGateway: the
 * frozen `ModelGatewayResponse` carries the structured-output result; tool calls are observability and are
 * NOT representable on it, so they ride alongside. The real impl (surfacing the provider's tool calls)
 * lives in the gateway/adapter layer (deferred — gateway wiring); the loop only relays what it surfaces.
 */
export interface GenerateResult {
  readonly response: ModelGatewayResponse;
  readonly toolCalls?: readonly ToolCallObservation[];
}

/** The runtime-local generation gateway port (composes the frozen ModelGateway; no vendor type, rule #9). */
export interface GenerationGateway {
  generate(request: ModelGatewayRequest): Promise<GenerateResult>;
}

/** The context a seam receives — the run/generation correlation + the append port (the seam emits its own). */
export interface SeamContext {
  readonly runId: string;
  readonly generationId: string;
  readonly append: EventStore['append'];
}

/** Reproduce additionally receives the eligible parents, the LIVE outcome source (rule #7), + scored events. */
export interface ReproduceContext extends SeamContext {
  readonly parents: readonly Agenome[];
  readonly outcomes: OutcomeSource;
  readonly scoredEvents: readonly RunEventRow[];
}

/**
 * The injected subsystem seams. Each APPENDS its own events (the loop reads them back via `readByRun` and
 * never authors them — the §2.5 subsystem boundary as code shape, option-b). Faked in tests; the real
 * impls are the verifier/selection subsystems' job, wired behind these ports later.
 */
export type VerifySeam = (candidates: readonly CandidateIdea[], ctx: SeamContext) => Promise<void>;
export type ScoreSeam = (candidates: readonly CandidateIdea[], ctx: SeamContext) => Promise<void>;
export type ReproduceSeam = (ctx: ReproduceContext) => Promise<void>;

export interface GenerationSeams {
  readonly verify: VerifySeam;
  readonly score: ScoreSeam;
  readonly reproduce: ReproduceSeam;
}

export interface GenerationLoopDeps {
  readonly runId: string;
  readonly config: AppConfig;
  readonly eventStore: EventStore;
  readonly gateway: GenerationGateway;
  readonly seams: GenerationSeams;
}

export interface GenerationLoopResult {
  readonly generationsRun: number;
}

/** Thrown when the loop would drive a generation through an out-of-lifecycle transition (rule #2 + P3.2). */
export class IllegalGenerationTransitionError extends Error {
  constructor(
    public readonly from: GenerationStatus,
    public readonly to: GenerationStatus,
  ) {
    super(`illegal generation transition: ${from} → ${to}`);
    this.name = 'IllegalGenerationTransitionError';
  }
}

/**
 * Validate a generation transition through the P3.2 guard BEFORE the loop appends — an illegal transition
 * is a kernel error (throw), never a forced append. Returns the target status on success (so the loop
 * threads the validated status forward).
 */
export function transitionGenerationOrThrow(
  from: GenerationStatus,
  to: GenerationStatus,
): GenerationStatus {
  if (!canTransitionGeneration(from, to).allowed) {
    throw new IllegalGenerationTransitionError(from, to);
  }
  return to;
}

/**
 * Drive a run's generations (happy path). Returns the number of generations run (run-terminal
 * classification is P3.11, out of scope). BOUNDED by construction: an N-generation cap runs exactly N.
 */
export async function runGenerationLoop(deps: GenerationLoopDeps): Promise<GenerationLoopResult> {
  const { runId, config, eventStore, gateway, seams } = deps;
  const { caps } = config;

  let eventSeq = 0;
  const appendEvent = (
    type: RunEventType,
    payload: Record<string, unknown>,
    correlation: { generationId?: string; agenomeId?: string; candidateId?: string } = {},
  ): Promise<AppendResult> => {
    const input: AppendInput = {
      id: `${runId}-e${eventSeq}`,
      runId,
      type,
      actor: 'runtime',
      payload,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      ...correlation,
    };
    eventSeq += 1;
    return eventStore.append(input);
  };

  // Gen-0 population: materialized ONCE, clamped to maxPopulation; spawned once (agenome.spawned per
  // agenome, each gated by enforceCap('maxPopulation', …) — belt-and-suspenders with the materialize
  // clamp). The population persists across generations (successor-population threading deferred).
  const gen0Id = `${runId}-gen0`;
  const population = materializeGen0(config.seedSet, runId, gen0Id, caps.maxPopulation);
  let spawned = 0;
  for (const agenome of population) {
    if (!enforceCap('maxPopulation', spawned, 1, caps).allowed) break;
    await appendEvent(
      'agenome.spawned',
      { agenome },
      { generationId: gen0Id, agenomeId: agenome.id },
    );
    spawned += 1;
  }

  // One LIVE outcome source per run (from RunConfig.rngSeed) — the reproduce seam records its draws into
  // the agenome.fused/mutated payloads, so replay reconstructs them without re-sampling (rule #7 / P3.6).
  const outcomes = createLiveOutcomeSource(createSeededRng(readRngSeed(config.runConfig)));

  let generationsRun = 0;
  for (let g = 0; enforceCap('maxGenerations', g, 1, caps).allowed; g += 1) {
    const generationId = `${runId}-gen${g}`;
    let status: GenerationStatus = 'pending';

    status = transitionGenerationOrThrow(status, 'running');
    await appendEvent('generation.started', { generationId, index: g }, { generationId });

    // Produce candidates per agenome (happy path: all accepted). Each gateway call may surface tool calls,
    // which the loop relays verbatim (no energy debit — markers, §4/§12).
    const candidates: CandidateIdea[] = [];
    for (let a = 0; a < population.length; a += 1) {
      const agenome = population[a]!;
      const { response, toolCalls } = await gateway.generate({
        role: 'population_generator',
        prompt: agenome.systemPrompt,
      });
      for (const toolCall of toolCalls ?? []) {
        await appendEvent(
          'tool_call.started',
          { toolName: toolCall.toolName },
          {
            generationId,
            agenomeId: agenome.id,
          },
        );
        await appendEvent(
          'tool_call.finished',
          { toolName: toolCall.toolName },
          {
            generationId,
            agenomeId: agenome.id,
          },
        );
      }
      if (!response.accepted) continue; // happy path = accepted; repair/reject/failure → 10c/10d
      const candidateId = `${generationId}-c${a}`;
      // Kernel assigns id/runId/generationId/agenomeId/status; the model owns the content. The append path
      // validates the assembled object as a real CandidateIdea (candidate.created high-traffic narrowing).
      const candidatePayload: Record<string, unknown> = {
        ...(response.output as Record<string, unknown>),
        id: candidateId,
        runId,
        generationId,
        agenomeId: agenome.id,
        status: 'created',
      };
      candidates.push(candidatePayload as unknown as CandidateIdea);
      await appendEvent('candidate.created', candidatePayload, {
        generationId,
        agenomeId: agenome.id,
        candidateId,
      });
    }

    // Verify phase — marker on ENTRY (before the seam work, so live observability sees "phase started"),
    // then delegate to the injected seam (it appends critic.reviewed/check.completed; the loop never does).
    status = transitionGenerationOrThrow(status, 'verifying');
    await appendEvent('generation.verifying', { generationId }, { generationId });
    await seams.verify(candidates, { runId, generationId, append: eventStore.append });

    // Score phase — marker on entry, then delegate (seam appends novelty.scored/fitness.scored).
    status = transitionGenerationOrThrow(status, 'scoring');
    await appendEvent('generation.scoring', { generationId }, { generationId });
    await seams.score(candidates, { runId, generationId, append: eventStore.append });

    // Consume the seam events as DATA — read the run log back (never re-authoring a seam-owned event).
    const scoredEvents = await eventStore.readByRun(runId);

    // Reproduce phase — marker on entry, then delegate with the LIVE outcome source so RNG outcomes are
    // recorded into the offspring payloads (happy path: the population are the eligible parents).
    status = transitionGenerationOrThrow(status, 'reproducing');
    await appendEvent('generation.reproducing', { generationId }, { generationId });
    await seams.reproduce({
      runId,
      generationId,
      append: eventStore.append,
      parents: population,
      outcomes,
      scoredEvents,
    });

    // Complete — validate the terminal transition through the guard (no assign; status is not read after).
    transitionGenerationOrThrow(status, 'completed');
    await appendEvent('generation.completed', { generationId }, { generationId });

    generationsRun += 1;
  }

  return { generationsRun };
}
