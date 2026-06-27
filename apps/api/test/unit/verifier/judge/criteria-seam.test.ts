import { describe, expect, test } from 'vitest';
import { validCandidateIdeaCrossDomain, validProviderMeta } from '@doppl/contracts';
import type { ModelGateway } from '../../../../src/model-gateway';
import { JUDGE_AXIS_CRITERIA, loadJudgeCriteria } from '../../../../src/verifier/judge/judge-core';
import { buildJudgeInstruction, runJudge } from '../../../../src/verifier/judge/judge-call';
import {
  buildComparativeJudgeInstruction,
  runComparativeJudge,
} from '../../../../src/verifier/judge/comparative-judge';

/**
 * Phase J — Slice Js: the criteria-injection seam (`criteriaSource`). BEHAVIOR-PRESERVING infra (rule #6):
 * `JUDGE_AXIS_CRITERIA` is now injectable, defaulting to the frozen const (byte-identical) so a v4 criteria
 * can be A/B'd WITHOUT flipping the default — mirroring the existing `rubricSource` seam. No `policyVersion`
 * bump, no behavior change on the default path. The default source stays an agent-unwritable frozen const
 * (rule #6 / §40); `loadJudgeCriteria` enforces it is a real non-empty string (the load-path discipline).
 */

const ALT_CRITERIA =
  'ZZZ_ALTERNATE_CRITERIA_MARKER — score every axis 0–10 strictly by named checkable evidence.';
const RUN_CONTEXT = { runId: 'run_1', generationId: 'gen_1', candidateId: 'cand_1' };
const PER_AXIS_OUTPUT = {
  grounding: 4,
  novelty: 3,
  feasibility: 5,
  falsification_survival: 2,
  subtype_check_pass: 4,
};
const COMPARATIVE_OUTPUT = {
  candidates: [
    { ref: '1', ...PER_AXIS_OUTPUT },
    { ref: '2', ...PER_AXIS_OUTPUT },
  ],
};

/** A test-local judge gateway returning a canned accepted output. */
function gatewayReturning(output: unknown): ModelGateway {
  return {
    call: () =>
      Promise.resolve({
        accepted: true,
        validationResult: 'accepted' as const,
        output,
        providerMeta: validProviderMeta,
      }),
    capabilityFor: () => ({ structuredOutputs: true, embeddings: true }),
  };
}

function recordingGateway(inner: ModelGateway) {
  const requests: Parameters<ModelGateway['call']>[0][] = [];
  const gateway: ModelGateway = {
    call(request) {
      requests.push(request);
      return inner.call(request);
    },
    capabilityFor: (role) => inner.capabilityFor(role),
  };
  return { gateway, requests };
}

function noopStore() {
  return {
    append: () => Promise.resolve({ id: 'x', runId: 'run_1', sequence: 0 }),
    readByRun: () => Promise.resolve([]),
  };
}

function systemMessageOf(requests: Parameters<ModelGateway['call']>[0][]): string {
  return (requests[0]?.messages ?? []).find((m) => m.role === 'system')?.content ?? '';
}

describe('loadJudgeCriteria — validates the trusted criteria source (rule #6 load discipline)', () => {
  test('test_accepts_the_default_criteria', () => {
    // positive guard first (lesson 10) — a vanished export would throw, not false-pass.
    expect(loadJudgeCriteria(JUDGE_AXIS_CRITERIA)).toBe(JUDGE_AXIS_CRITERIA);
  });

  test('test_accepts_a_valid_alternate_string', () => {
    expect(loadJudgeCriteria(ALT_CRITERIA)).toBe(ALT_CRITERIA);
  });

  test('test_rejects_non_string', () => {
    expect(() => loadJudgeCriteria(undefined)).toThrow();
    expect(() => loadJudgeCriteria(123)).toThrow();
    expect(() => loadJudgeCriteria({ criteria: 'x' })).toThrow();
    expect(() => loadJudgeCriteria(null)).toThrow();
  });

  test('test_rejects_empty_or_whitespace', () => {
    expect(() => loadJudgeCriteria('')).toThrow();
    expect(() => loadJudgeCriteria('   ')).toThrow();
  });
});

describe('build*Instruction — the criteria is injected into the trusted instruction', () => {
  test('test_single_default_carries_criteria_and_framing', () => {
    const inst = buildJudgeInstruction(JUDGE_AXIS_CRITERIA);
    expect(inst).toContain(JUDGE_AXIS_CRITERIA);
    expect(inst).toContain('held-out final judge');
    expect(inst).toContain('alter the rubric');
  });

  test('test_single_injected_alternate_replaces_default', () => {
    const inst = buildJudgeInstruction(ALT_CRITERIA);
    expect(inst).toContain(ALT_CRITERIA);
    expect(inst).not.toContain(JUDGE_AXIS_CRITERIA);
  });

  test('test_comparative_default_carries_criteria_and_framing', () => {
    const inst = buildComparativeJudgeInstruction(JUDGE_AXIS_CRITERIA);
    expect(inst).toContain(JUDGE_AXIS_CRITERIA);
    expect(inst).toContain('Score EACH candidate');
  });

  test('test_comparative_injected_alternate_replaces_default', () => {
    const inst = buildComparativeJudgeInstruction(ALT_CRITERIA);
    expect(inst).toContain(ALT_CRITERIA);
    expect(inst).not.toContain(JUDGE_AXIS_CRITERIA);
  });
});

describe('runJudge / runComparativeJudge — criteriaSource threads to the system instruction', () => {
  test('test_single_default_request_uses_the_default_criteria', async () => {
    const { gateway, requests } = recordingGateway(gatewayReturning(PER_AXIS_OUTPUT));
    await runJudge({
      gateway,
      store: noopStore(),
      candidate: validCandidateIdeaCrossDomain,
      runContext: RUN_CONTEXT,
    });
    expect(systemMessageOf(requests)).toContain(JUDGE_AXIS_CRITERIA);
  });

  test('test_single_injected_criteria_reaches_the_system_message', async () => {
    const { gateway, requests } = recordingGateway(gatewayReturning(PER_AXIS_OUTPUT));
    await runJudge({
      gateway,
      store: noopStore(),
      candidate: validCandidateIdeaCrossDomain,
      runContext: RUN_CONTEXT,
      criteriaSource: ALT_CRITERIA,
    });
    const sys = systemMessageOf(requests);
    expect(sys).toContain(ALT_CRITERIA);
    expect(sys).not.toContain(JUDGE_AXIS_CRITERIA);
  });

  test('test_comparative_injected_criteria_reaches_the_system_message', async () => {
    const { gateway, requests } = recordingGateway(gatewayReturning(COMPARATIVE_OUTPUT));
    await runComparativeJudge({
      gateway,
      store: noopStore(),
      candidates: [
        { ...validCandidateIdeaCrossDomain, id: 'c1' },
        { ...validCandidateIdeaCrossDomain, id: 'c2' },
      ],
      runContext: { runId: 'run_1', generationId: 'gen_1' },
      criteriaSource: ALT_CRITERIA,
    });
    const sys = systemMessageOf(requests);
    expect(sys).toContain(ALT_CRITERIA);
    expect(sys).not.toContain(JUDGE_AXIS_CRITERIA);
  });
});
