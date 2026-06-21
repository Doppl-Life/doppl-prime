import { describe, expect, test } from 'vitest';
import {
  Agenome,
  CRITIC_INPUT_SENTINEL,
  CURRENT_SCHEMA_VERSION,
  ReproductionEvent,
  validAgenome,
} from '@doppl/contracts';
import type { ModelGatewayRequest, RunEventEnvelope } from '@doppl/contracts';
import { createFakeGateway } from '../../../../src/model-gateway';
import type { ModelGateway } from '../../../../src/model-gateway';
import { applyFusion, fuse } from '../../../../src/selection/reproduction/fuse';
import type { FuseInput, FusionEmitter } from '../../../../src/selection/reproduction/fuse';

type Emitted = Omit<RunEventEnvelope, 'sequence' | 'occurredAt'>;

function recorder(): { emit: FusionEmitter; events: Emitted[] } {
  const events: Emitted[] = [];
  let seq = 0;
  const emit: FusionEmitter = (env) => {
    events.push(env);
    return Promise.resolve({ sequence: seq++ });
  };
  return { emit, events };
}

function idFactory(): () => string {
  let n = 0;
  return () => `child_${n++}`;
}

function spy(base: ModelGateway): {
  gateway: ModelGateway;
  calls: () => number;
  lastRequest: () => ModelGatewayRequest | undefined;
} {
  let calls = 0;
  let last: ModelGatewayRequest | undefined;
  return {
    gateway: {
      call: (req) => {
        calls += 1;
        last = req;
        return base.call(req);
      },
      capabilityFor: base.capabilityFor,
    },
    calls: () => calls,
    lastRequest: () => last,
  };
}

function fparent(id: string, systemPrompt: string, vector: readonly number[]) {
  return { agenome: { ...validAgenome, id, systemPrompt }, noveltyVector: vector };
}

function baseInput(): FuseInput {
  return {
    runId: 'run_1',
    generationId: 'gen_2',
    seed: 42,
    parents: [
      fparent('agn_A', 'prompt A', [1, 0, 0, 0, 0, 0, 0, 0]),
      fparent('agn_B', 'prompt B', [0, 0, 0, 0, 0, 0, 0, 1]),
    ],
  };
}

/**
 * fuse / applyFusion (P5.9, §8/§4/§14) — two-level fusion (crossover + gateway synthesis) with
 * distant-lineage preference. fuse emits [fusion.started, agenome.fused] + persists every outcome;
 * applyFusion replays a bit-exact child from the persisted event with zero gateway calls (rule #7).
 */
describe('fuse / applyFusion — two-level fusion', () => {
  // 9 — spec(§8)/rule #9: synthesis calls role 'fusion_synthesis' through the injected gateway port.
  test('fuse_synthesis_via_gateway_port_role', async () => {
    const { gateway, lastRequest } = spy(createFakeGateway({ mode: 'valid' }));
    const { emit } = recorder();
    await fuse(baseInput(), { gateway, emit, newId: idFactory() });
    expect(lastRequest()?.role).toBe('fusion_synthesis');
  });

  // 10 — KEY SAFETY RULE #5: parent text reaches the synthesis call ONLY as sentinel-wrapped DATA (in a
  // user message); the system instruction never interpolates parent text.
  test('fuse_parent_text_wrapped_as_data', async () => {
    const { gateway, lastRequest } = spy(createFakeGateway({ mode: 'valid' }));
    const { emit } = recorder();
    await fuse(baseInput(), { gateway, emit, newId: idFactory() });
    const req = lastRequest();
    const messages = req?.messages ?? [];
    const userMsg = messages.find((m) => m.role === 'user');
    const systemMsg = messages.find((m) => m.role === 'system');
    expect(userMsg?.content).toContain(CRITIC_INPUT_SENTINEL); // parent text wrapped as data
    expect(userMsg?.content).toContain('prompt A');
    expect(systemMsg?.content).not.toContain('prompt A'); // instruction free of parent text
  });

  // 11 — spec(§4/§12): exactly [fusion.started, agenome.fused] in order; agenome.fused payload parses
  // against the frozen ReproductionEvent (explicit validate, not the generic fall-through).
  test('fuse_emits_started_then_fused_in_order', async () => {
    const { emit, events } = recorder();
    await fuse(baseInput(), {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    expect(events.map((e) => e.type)).toEqual(['fusion.started', 'agenome.fused']);
    const fused = events.find((e) => e.type === 'agenome.fused')!;
    expect(fused.actor).toBe('selection_controller');
    expect(fused.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(() => ReproductionEvent.parse(fused.payload)).not.toThrow();
  });

  // 12 — spec(§8/§3): child records both parentIds + mode; Agenome.parse(child) ok.
  test('fuse_child_records_both_parents_and_mode', async () => {
    const { emit } = recorder();
    const { child, reproductionEvent } = await fuse(baseInput(), {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    expect(child.parentIds.sort()).toEqual(['agn_A', 'agn_B']);
    expect(child.status).toBe('seeded');
    expect(reproductionEvent.mode).toBe('fusion');
    expect(() => Agenome.parse(child)).not.toThrow();
  });

  // 13 — rule #7: the synthesis output + crossoverPoints are persisted in the ReproductionEvent.
  test('fuse_persists_synthesis_and_points', async () => {
    const { emit } = recorder();
    const { child, reproductionEvent } = await fuse(baseInput(), {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    expect(Array.isArray(reproductionEvent.crossoverPoints)).toBe(true);
    // the synthesis output is persisted in mutationSummary AND is the child's systemPrompt.
    expect(reproductionEvent.mutationSummary.synthesisOutput).toBe('stub fusion synthesis');
    expect(child.systemPrompt).toBe('stub fusion synthesis');
  });

  // 14 — KEY SAFETY RULE #7 (the safety pin): applyFusion reconstructs a child deep-equal to fuse's from
  // the persisted event alone. applyFusion takes NO gateway — replay is STRUCTURALLY provider-free
  // (stronger than a call-count assertion): the child is rebuilt purely from crossoverPoints +
  // mutationSummary, never re-calling the synthesis model.
  test('REPLAY_applyFusion_reconstructs_no_gateway', async () => {
    const { emit } = recorder();
    const { child, reproductionEvent } = await fuse(baseInput(), {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    const replayed = applyFusion(baseInput().parents, reproductionEvent);
    expect(replayed).toEqual(child);
  });

  // 15 — replay-faithful: same (parents, seed) → identical child + event.
  test('fuse_deterministic_given_seed', async () => {
    const a = await fuse(baseInput(), {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit: recorder().emit,
      newId: idFactory(),
    });
    const b = await fuse(baseInput(), {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit: recorder().emit,
      newId: idFactory(),
    });
    expect(a.child).toEqual(b.child);
    expect(a.reproductionEvent).toEqual(b.reproductionEvent);
  });

  // 16 — KEY SAFETY RULE #8: the two emitted types are exactly the markers, no energy.spent.
  test('fuse_marker_no_energy', async () => {
    const { emit, events } = recorder();
    await fuse(baseInput(), {
      gateway: createFakeGateway({ mode: 'valid' }),
      emit,
      newId: idFactory(),
    });
    expect(events.some((e) => e.type === 'energy.spent')).toBe(false);
  });

  // 17 — KEY SAFETY RULE #5 (output side): a REJECTED (unvalidated) synthesis output must NEVER enter
  // the event log. On rejection fuse degrades to crossover-only: child systemPrompt = a parent's (NOT the
  // rejected output), mode 'crossover', the rejected text never persisted. The child still forms (graceful,
  // mirrors the P5.3 novelty degrade). Test 10 pins the input side; this pins the output side.
  test('fuse_synthesis_rejected_degrades_to_crossover', async () => {
    const { emit, events } = recorder();
    const { child, reproductionEvent } = await fuse(baseInput(), {
      gateway: createFakeGateway({ mode: 'reject' }),
      emit,
      newId: idFactory(),
    });
    expect(reproductionEvent.mode).toBe('crossover');
    expect(['prompt A', 'prompt B']).toContain(child.systemPrompt);
    expect(child.systemPrompt).not.toBe('stub fusion synthesis');
    expect(reproductionEvent.mutationSummary.synthesisOutput).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual(['fusion.started', 'agenome.fused']);
    expect(() => Agenome.parse(child)).not.toThrow();

    // applyFusion reconstructs the crossover-mode child too (structurally gateway-free), deep-equal.
    const replayed = applyFusion(baseInput().parents, reproductionEvent);
    expect(replayed).toEqual(child);
  });

  // 18 — KEY SAFETY RULE #7 replay-integrity (fail-loud, never silently fold): a fusion-mode event whose
  // persisted mutationSummary is missing synthesisOutput (a corrupted/tampered log — unreachable via the
  // append-only writer, which writes synthesisOutput atomically with mode 'fusion') must FAIL LOUD on
  // replay rather than coerce String(undefined)='undefined' into the child's systemPrompt.
  test('applyFusion_fails_loud_on_corrupted_fusion_event', () => {
    const corrupt = ReproductionEvent.parse({
      id: 'rep_x',
      runId: 'run_1',
      parentAgenomeIds: ['agn_A', 'agn_B'],
      childAgenomeId: 'child_x',
      mode: 'fusion',
      crossoverPoints: [1, 1],
      mutationSummary: {
        decompositionPolicy_from: 'A',
        spawnBudget_from: 'A',
        systemPrompt_from: 'A',
        childGenerationId: 'gen_2',
        // synthesisOutput intentionally absent — fusion mode requires it.
      },
    });
    expect(() => applyFusion(baseInput().parents, corrupt)).toThrow();
  });
});
