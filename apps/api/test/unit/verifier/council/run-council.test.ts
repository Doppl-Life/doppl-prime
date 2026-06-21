import { describe, expect, test } from 'vitest';
import { CriticReview, validCandidateIdeaCrossDomain } from '@doppl/contracts';
import { createFakeGateway } from '../../../../src/model-gateway';
import type { AppendInput, AppendResult, EventStore, RunEventRow } from '../../../../src/event-store';
import { runCouncil } from '../../../../src/verifier/council/run-council';

/**
 * P4.6 critic council orchestrator — runs the INJECTED active mandate set and returns the CriticReview[]
 * ONLY (KEY SAFETY RULE #6 emit-only). It can never select a winner, mutate candidates/lineage, or alter
 * scoring policy. spec(§7).
 */

const RUN_CONTEXT = { runId: 'run_1', generationId: 'gen_1', candidateId: 'cand_1' };

const CRITIC_REVIEW_FIELDS = [
  'candidateId',
  'confidence',
  'critique',
  'evidenceRefs',
  'id',
  'mandate',
  'scores',
];

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

describe('runCouncil — returns CriticReview[] only, no selection/mutation (rule #6)', () => {
  // spec(§7) rule #6 — positive guard first (lesson 10): the council returns a CriticReview[] for the
  // injected mandate set, and each review carries EXACTLY the 7 evidence fields (no winner/selection/
  // authority surface is representable).
  test('test_council_returns_only_reviews_no_selection', async () => {
    const reviews = await runCouncil({
      gateway: createFakeGateway(),
      store: makeFakeStore().store,
      candidate: validCandidateIdeaCrossDomain,
      mandates: ['factual_grounding', 'feasibility'],
      runContext: RUN_CONTEXT,
    });
    expect(Array.isArray(reviews)).toBe(true);
    expect(reviews).toHaveLength(2);
    for (const review of reviews) {
      expect(CriticReview.safeParse(review).success).toBe(true);
      expect(Object.keys(review).sort()).toEqual(CRITIC_REVIEW_FIELDS);
    }
    expect(reviews.map((r) => r.mandate)).toEqual(['factual_grounding', 'feasibility']);
  });

  // spec(§7) — a rejected mandate contributes NO review: the council omits it from the returned set
  // (never a fabricated review).
  test('test_council_omits_rejected_mandates', async () => {
    const reviews = await runCouncil({
      gateway: createFakeGateway({ mode: 'reject' }),
      store: makeFakeStore().store,
      candidate: validCandidateIdeaCrossDomain,
      mandates: ['factual_grounding', 'feasibility'],
      runContext: RUN_CONTEXT,
    });
    expect(reviews).toEqual([]);
  });
});
