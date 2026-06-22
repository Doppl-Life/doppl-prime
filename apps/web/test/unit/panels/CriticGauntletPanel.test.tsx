// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { CriticMandate, RunEventEnvelope } from '@doppl/contracts';
import { CriticGauntletPanel } from '../../../src/panels/CriticGauntletPanel';
import { makeEvent } from '../../fixtures/events';

const PANELS_DIR = resolve(process.cwd(), 'src/panels');
afterEach(() => cleanup());

function reviewEvent(
  sequence: number,
  candidateId: string,
  mandate: CriticMandate,
  confidence: number,
  overrides: Record<string, unknown> = {},
): RunEventEnvelope {
  return makeEvent(sequence, 'critic.reviewed', {
    candidateId,
    payload: {
      id: `crev_${sequence}`,
      candidateId,
      mandate,
      scores: { rigor: 0.8 },
      critique: `critique ${sequence}`,
      confidence,
      evidenceRefs: [],
      ...overrides,
    },
  });
}

describe('CriticGauntletPanel — adversarial critic council (emit-only)', () => {
  // spec(§12/§7): a review renders mandate + scores + critique + confidence; a mandate with no review
  // degrades gracefully ("not reviewed").
  it('test_renders_mandate_scores_critique_confidence', () => {
    render(
      <CriticGauntletPanel
        events={[reviewEvent(1, 'cand_0', 'feasibility', 0.82)]}
        candidateId="cand_0"
      />,
    );
    expect(screen.getByText(/feasibility/)).toBeTruthy();
    expect(screen.getByText(/0\.82/)).toBeTruthy(); // confidence (numeric channel, not color alone)
    expect(screen.getByText(/critique 1/)).toBeTruthy();
    expect(screen.getByText(/rigor/)).toBeTruthy(); // a score key
    // only 1 of the 5 mandates reviewed → the other 4 show a graceful "not reviewed" affordance.
    expect(screen.getAllByText(/not reviewed/i).length).toBeGreaterThan(0);
  });

  // spec(§9/§4/rule #9): per-review evidenceRefs render IN-TIER via the P7.10 EvidenceRefLink — no external href.
  it('test_evidence_refs_in_tier', () => {
    const { container } = render(
      <CriticGauntletPanel
        events={[
          reviewEvent(1, 'cand_0', 'feasibility', 0.5, {
            evidenceRefs: [{ kind: 'trace', eventId: 'evt_9' }],
          }),
        ]}
        candidateId="cand_0"
      />,
    );
    expect(screen.getByText(/evt_9/)).toBeTruthy();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
  });

  // spec(rule #6 emit-only): all reviews shown unranked; the panel derives NO winner/verdict/selection.
  it('test_emit_only_no_verdict', () => {
    render(
      <CriticGauntletPanel
        events={[
          reviewEvent(1, 'cand_0', 'feasibility', 0.9),
          reviewEvent(2, 'cand_0', 'falsification', 0.2),
        ]}
        candidateId="cand_0"
      />,
    );
    expect(screen.getByText(/critique 1/)).toBeTruthy();
    expect(screen.getByText(/critique 2/)).toBeTruthy(); // the low-confidence review is NOT hidden/ranked away
    expect(screen.queryByText(/winner|verdict|selected/i)).toBeNull(); // never a derived decision
  });

  // spec(§12 partial-data): zero reviews → an empty-state affordance.
  it('test_empty_state', () => {
    render(<CriticGauntletPanel events={[]} candidateId="cand_0" />);
    expect(screen.getByText(/no critic reviews/i)).toBeTruthy();
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
