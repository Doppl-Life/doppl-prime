// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CheckResult, RunEventEnvelope } from '@doppl/contracts';
import { SubtypeCheckPanel } from '../../../src/panels/SubtypeCheckPanel';
import { makeEvent } from '../../fixtures/events';

const PANELS_DIR = resolve(process.cwd(), 'src/panels');
afterEach(() => cleanup());

function checkEvent(
  sequence: number,
  candidateId: string,
  checkType: string,
  status: CheckResult['status'],
  overrides: Record<string, unknown> = {},
): RunEventEnvelope {
  return makeEvent(sequence, 'check.completed', {
    candidateId,
    payload: {
      id: `chk_${sequence}`,
      candidateId,
      checkType,
      status,
      evidenceRefs: [],
      ...overrides,
    },
  });
}

describe('SubtypeCheckPanel — subtype-check evidence (allowlist transparency, emit-only)', () => {
  // spec(§12): a check renders checkType + status (check-domain primitive) + score + output.
  it('test_renders_status_score_output', () => {
    render(
      <SubtypeCheckPanel
        events={[
          checkEvent(1, 'cand_0', 'math_check', 'passed', { score: 0.9, output: 'all good' }),
        ]}
        candidateId="cand_0"
      />,
    );
    expect(screen.getByText(/math_check/)).toBeTruthy();
    expect(screen.getByText('passed')).toBeTruthy(); // check-domain status label
    expect(screen.getByText(/all good/)).toBeTruthy(); // output
    expect(screen.getByText(/0\.9/)).toBeTruthy(); // score
  });

  // spec(rule #3): a skipped check shows its skipReason distinctly (the allowlist fail-safe working).
  it('test_skipped_shows_reason', () => {
    render(
      <SubtypeCheckPanel
        events={[
          checkEvent(1, 'cand_0', 'exec_check', 'skipped', { skipReason: 'unregistered runner' }),
        ]}
        candidateId="cand_0"
      />,
    );
    expect(screen.getByText('skipped')).toBeTruthy();
    expect(screen.getByText(/unregistered runner/)).toBeTruthy();
  });

  // spec(§9/§4/rule #9): per-check evidenceRefs render IN-TIER via EvidenceRefLink — no external href.
  it('test_evidence_refs_in_tier', () => {
    const { container } = render(
      <SubtypeCheckPanel
        events={[
          checkEvent(1, 'cand_0', 'm', 'passed', {
            evidenceRefs: [{ kind: 'check_output', eventId: 'evt_5' }],
          }),
        ]}
        candidateId="cand_0"
      />,
    );
    expect(screen.getByText(/evt_5/)).toBeTruthy();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
  });

  // spec(rule #3/#6 emit-only): the rendered status === the persisted status — never re-judged from score.
  it('test_emit_only_status_verbatim', () => {
    render(
      <SubtypeCheckPanel
        events={[checkEvent(1, 'cand_0', 'm', 'failed', { score: 0.99, output: 'looks great' })]}
        candidateId="cand_0"
      />,
    );
    expect(screen.getByText('failed')).toBeTruthy(); // persisted status, NOT re-derived from score 0.99
    expect(screen.queryByText('passed')).toBeNull();
  });

  // spec(§12 partial-data): zero checks → an empty-state affordance.
  it('test_empty_state', () => {
    render(<SubtypeCheckPanel events={[]} candidateId="cand_0" />);
    expect(screen.getByText(/no checks/i)).toBeTruthy();
  });

  // spec(rule #6): the panel imports nothing from apps/api.
  it('test_no_apps_api_import', () => {
    const files = readdirSync(PANELS_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(`${PANELS_DIR}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/from\s+['"][^'"]*apps\/api/);
      expect(src, f).not.toMatch(/@doppl\/api/);
    }
  });

  // spec(_adherence): styling colors via var() tokens — no raw hex.
  it('test_no_raw_hex', () => {
    const files = readdirSync(PANELS_DIR).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const f of files) {
      const src = readFileSync(`${PANELS_DIR}/${f}`, 'utf8');
      expect(src, `${f} contains a raw hex color`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
