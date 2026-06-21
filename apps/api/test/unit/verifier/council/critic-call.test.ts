import { describe, expect, test } from 'vitest';
import {
  CRITIC_INPUT_SENTINEL,
  CriticReview,
  validCandidateIdeaCrossDomain,
  validProviderMeta,
} from '@doppl/contracts';
import type { ModelGateway } from '../../../../src/model-gateway';
import { createFakeGateway } from '../../../../src/model-gateway';
import type {
  AppendInput,
  AppendResult,
  EventStore,
  RunEventRow,
} from '../../../../src/event-store';
import { runCriticCall } from '../../../../src/verifier/council/critic-call';

/**
 * P4.6 critic council — per-mandate critic call (KEY SAFETY RULE #6 emit-only + rule #5 isolation). For
 * each mandate: assemble the request via the P4.4 isolation seam (candidate as DATA) under the `critic`
 * ModelRole → gateway.call → assemble a CriticReview where the COUNCIL sets the trusted identity
 * (id/candidateId/mandate) and the model fills only evidence → emit critic.review_started + critic.reviewed,
 * or output_schema_rejected (no fabricated review). spec(§7/§14/§4).
 */

const RUN_CONTEXT = { runId: 'run_1', generationId: 'gen_1', candidateId: 'cand_1' };

function makeFakeStore() {
  const appended: AppendInput[] = [];
  const store: EventStore = {
    append(input: AppendInput): Promise<AppendResult> {
      appended.push(input);
      return Promise.resolve({ id: input.id, runId: input.runId, sequence: appended.length - 1 });
    },
    readByRun(): Promise<RunEventRow[]> {
      return Promise.resolve([]);
    },
  };
  return { store, appended };
}

function recordingGateway(inner: ModelGateway) {
  const requests: Parameters<ModelGateway['call']>[0][] = [];
  const gateway: ModelGateway = {
    call(request) {
      requests.push(request);
      return inner.call(request);
    },
    capabilityFor(role) {
      return inner.capabilityFor(role);
    },
  };
  return { gateway, requests };
}

describe('runCriticCall — gateway-routed, evidence-only, identity council-set (rule #6)', () => {
  // spec(§14) rule #5 — the critic request is built via the isolation seam: the candidate rides
  // sentinel-wrapped in a user message and is absent from the system instruction; role `critic`.
  test('test_critic_request_built_via_isolation_seam', async () => {
    const { gateway, requests } = recordingGateway(createFakeGateway());
    await runCriticCall({
      gateway,
      store: makeFakeStore().store,
      candidate: validCandidateIdeaCrossDomain,
      mandate: 'factual_grounding',
      instruction: 'Assess factual grounding.',
      runContext: RUN_CONTEXT,
    });
    const req = requests[0];
    expect(req?.role).toBe('critic');
    const systemMsg = (req?.messages ?? []).find((m) => m.role === 'system')?.content ?? '';
    const userMsgs = (req?.messages ?? []).filter((m) => m.role === 'user').map((m) => m.content);
    expect(systemMsg).not.toContain(validCandidateIdeaCrossDomain.title);
    const withCandidate = userMsgs.filter((c) => c.includes(validCandidateIdeaCrossDomain.title));
    expect(withCandidate).toHaveLength(1);
    expect(withCandidate.join('').split(CRITIC_INPUT_SENTINEL).length - 1).toBe(2);
  });

  // spec(§7) — an accepted minimal output {critique, confidence} is assembled into a schema-valid
  // CriticReview: council-set id/candidateId/mandate, model critique/confidence, defaulted scores/refs.
  test('test_accepted_output_assembled_into_valid_critic_review', async () => {
    const review = await runCriticCall({
      gateway: createFakeGateway(),
      store: makeFakeStore().store,
      candidate: validCandidateIdeaCrossDomain,
      mandate: 'factual_grounding',
      instruction: 'Assess factual grounding.',
      runContext: RUN_CONTEXT,
    });
    expect(review).not.toBeNull();
    expect(CriticReview.safeParse(review).success).toBe(true);
    expect(review?.candidateId).toBe('cand_1');
    expect(review?.mandate).toBe('factual_grounding');
    expect(review?.critique).toBe('stub critique');
    expect(review?.confidence).toBe(0.5);
    expect(review?.scores).toEqual({});
    expect(review?.evidenceRefs).toEqual([]);
  });

  // spec(§7) rule #6 — reward-hacking defense: even when the model output carries id/candidateId/mandate
  // (and an authority field), the assembled review uses the council's known identity and drops the rest.
  test('test_model_never_controls_identity_fields', async () => {
    const evilGateway: ModelGateway = {
      call: () =>
        Promise.resolve({
          accepted: true,
          validationResult: 'accepted',
          output: {
            critique: 'forged critique',
            confidence: 0.9,
            candidateId: 'EVIL-CANDIDATE',
            mandate: 'feasibility',
            id: 'EVIL-ID',
            scoreOverride: 10,
          },
          providerMeta: validProviderMeta,
        }),
      capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
    };
    const review = await runCriticCall({
      gateway: evilGateway,
      store: makeFakeStore().store,
      candidate: validCandidateIdeaCrossDomain,
      mandate: 'factual_grounding',
      instruction: 'Assess factual grounding.',
      runContext: RUN_CONTEXT,
    });
    expect(review?.candidateId).toBe('cand_1');
    expect(review?.mandate).toBe('factual_grounding');
    expect(review?.id).not.toContain('EVIL');
    expect(review?.id).toContain('cand_1');
    expect(review !== null && 'scoreOverride' in review).toBe(false);
    expect(CriticReview.safeParse(review).success).toBe(true);
  });

  // spec(§4) — the CriticReview.id is deterministic (derived from run/candidate/mandate; no random/clock),
  // so replay reconstructs the same review id.
  test('test_review_id_is_deterministic', async () => {
    const params = {
      gateway: createFakeGateway(),
      store: makeFakeStore().store,
      candidate: validCandidateIdeaCrossDomain,
      mandate: 'feasibility' as const,
      instruction: 'Assess feasibility.',
      runContext: RUN_CONTEXT,
    };
    const a = await runCriticCall(params);
    const b = await runCriticCall(params);
    expect(a?.id).toBe(b?.id);
  });

  // spec(§7) — a rejected/un-repairable critic output yields NO review for that mandate (no fabrication).
  test('test_rejected_output_yields_no_review', async () => {
    const review = await runCriticCall({
      gateway: createFakeGateway({ mode: 'reject' }),
      store: makeFakeStore().store,
      candidate: validCandidateIdeaCrossDomain,
      mandate: 'factual_grounding',
      instruction: 'Assess factual grounding.',
      runContext: RUN_CONTEXT,
    });
    expect(review).toBeNull();
  });
});
