// P0.7 — CheckResult: the outcome of a subtype-specific objective check (ARCHITECTURE.md §7).
// SAFETY slice (rule #3). spec(§7): closed 3-state status; a skip is ALWAYS recorded with a reason
// (skipped⇒skipReason). The schema encodes SHAPE only; evidenceRefs[] may be empty (lesson §6).
import { describe, it, expect } from 'vitest';
import { CheckResult, CheckStatus } from '@doppl/contracts';

const validResult = {
  id: 'chk_1',
  candidateId: 'cand_1',
  checkType: 'citation_resolves',
  status: 'passed',
  score: 0.9,
  output: 'all 3 citations resolved',
  evidenceRefs: [{ kind: 'check_output', eventId: 'evt_3' }],
};

const STATUSES = ['passed', 'failed', 'skipped'] as const;
const REQUIRED_KEYS = ['id', 'candidateId', 'checkType', 'status', 'evidenceRefs'] as const;

describe('CheckResult — objective-check outcome (spec §7)', () => {
  it('check_status_closed_3_union', () => {
    // spec(§7): the 3 statuses parse; any other value rejected (closed union).
    for (const s of STATUSES) {
      expect(CheckStatus.parse(s)).toBe(s);
    }
    expect(STATUSES).toHaveLength(3);
    expect(() => CheckStatus.parse('errored')).toThrow();
    expect(() => CheckStatus.parse('')).toThrow();
  });

  it('check_result_accepts_valid_and_strict', () => {
    // spec(§7): a full result round-trips; a minimal result (only the 5 required fields) parses;
    // unknown top-level field rejected; each required field mandatory.
    expect(CheckResult.parse(validResult)).toEqual(validResult);
    const minimal = {
      id: 'chk_2',
      candidateId: 'cand_2',
      checkType: 'feasible',
      status: 'failed',
      evidenceRefs: [],
    };
    expect(CheckResult.parse(minimal)).toEqual(minimal);
    expect(() => CheckResult.parse({ ...validResult, bogus: 1 })).toThrow();
    for (const k of REQUIRED_KEYS) {
      const clone: Record<string, unknown> = { ...validResult };
      delete clone[k];
      expect(() => CheckResult.parse(clone), `missing ${k}`).toThrow();
    }
    expect(REQUIRED_KEYS).toHaveLength(5);
  });

  it('check_result_skipreason_iff_skipped', () => {
    // spec(§7, rule #3): skipReason is tied IFF to `skipped`. Forward: a skipped result WITHOUT a
    // non-empty skipReason is rejected (a skip is ALWAYS recorded with a reason). Reverse: a
    // passed/failed result carrying a skipReason is rejected — that state is nonsensical and made
    // unrepresentable (defensive superset of the spec's forward requirement).
    const skipped = {
      id: 'chk_3',
      candidateId: 'cand_3',
      checkType: 'exec_required',
      status: 'skipped',
      skipReason: 'execution_requiring_check_not_allowed',
      evidenceRefs: [],
    };
    expect(CheckResult.parse(skipped)).toEqual(skipped);
    // FORWARD — skipped without skipReason → rejected.
    const noReason: Record<string, unknown> = { ...skipped };
    delete noReason.skipReason;
    expect(() => CheckResult.parse(noReason)).toThrow();
    // skipped with an empty skipReason → rejected (must be a real reason).
    expect(() => CheckResult.parse({ ...skipped, skipReason: '' })).toThrow();
    // passed/failed do NOT require skipReason.
    const passedNoReason = {
      id: 'chk_4',
      candidateId: 'cand_4',
      checkType: 'feasible',
      status: 'passed',
      evidenceRefs: [],
    };
    expect(CheckResult.parse(passedNoReason)).toEqual(passedNoReason);
    expect(CheckResult.parse({ ...passedNoReason, status: 'failed' }).status).toBe('failed');
    // REVERSE — a non-skipped result carrying a skipReason → rejected (IFF, not just forward).
    expect(() => CheckResult.parse({ ...passedNoReason, skipReason: 'oops' })).toThrow();
    expect(() =>
      CheckResult.parse({ ...passedNoReason, status: 'failed', skipReason: 'oops' }),
    ).toThrow();
  });

  it('check_result_evidence_and_optionals', () => {
    // spec(§9): evidenceRefs compose EvidenceRef (a bad kind rejected); [] ok. spec(§7): score is a
    // permissive number, output/error optional strings.
    expect(CheckResult.parse({ ...validResult, evidenceRefs: [] }).evidenceRefs).toEqual([]);
    expect(() =>
      CheckResult.parse({ ...validResult, evidenceRefs: [{ kind: 'rumor' }] }),
    ).toThrow();
    expect(CheckResult.parse({ ...validResult, score: -3.2 }).score).toBe(-3.2);
    expect(() => CheckResult.parse({ ...validResult, score: 'high' })).toThrow();
    const withError = {
      id: 'chk_5',
      candidateId: 'cand_5',
      checkType: 'feasible',
      status: 'failed',
      error: 'adapter timed out',
      evidenceRefs: [],
    };
    expect(CheckResult.parse(withError)).toEqual(withError);
  });
});
