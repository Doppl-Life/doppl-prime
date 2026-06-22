// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validCandidateIdeaCrossDomain, validCandidateIdeaZeitgeist } from '@doppl/contracts';
import type { CandidateIdea } from '@doppl/contracts';
import { CandidateInspector } from '../../../src/panels/CandidateInspector';

const PANELS_DIR = resolve(process.cwd(), 'src/panels');
afterEach(() => cleanup());

/** A fake getCandidate that resolves the given candidate (or rejects with the given error). */
function client(result: CandidateIdea | Error) {
  return {
    getCandidate: vi.fn(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
    ),
  };
}

describe('CandidateInspector — candidate inspector (both subtypes)', () => {
  // spec(§12): loads via getCandidate(runId, candidateId) and renders the common fields + accessible status.
  it('test_loads_and_renders_common_fields', async () => {
    const c = client(validCandidateIdeaCrossDomain);
    render(<CandidateInspector runId="run_1" candidateId="cand_1" runClient={c} />);
    await screen.findByText(validCandidateIdeaCrossDomain.title);
    expect(c.getCandidate).toHaveBeenCalledWith('run_1', 'cand_1');
    expect(screen.getByText(validCandidateIdeaCrossDomain.summary)).toBeTruthy();
    expect(screen.getByText(/CF underperforms/)).toBeTruthy(); // a claim
    // spec(rule #4): status via the shared primitive — shape (glyph) + label.
    expect(screen.getByText('created')).toBeTruthy();
    expect(document.querySelector('[aria-hidden="true"]')?.textContent).toBeTruthy();
  });

  // spec(§12 both-subtypes): CDT renders the CDT payload fields; Zeit renders the Zeit fields; neither
  // crashes on the other's shape; a missing optional field degrades gracefully.
  it('test_both_subtype_payloads_render', async () => {
    const cdt = render(
      <CandidateInspector
        runId="run_1"
        candidateId="cand_1"
        runClient={client(validCandidateIdeaCrossDomain)}
      />,
    );
    await screen.findByText(/immunology/); // sourceDomain (CDT-specific)
    expect(screen.getByText(/recommender systems/)).toBeTruthy(); // targetDomain
    cdt.unmount();

    render(
      <CandidateInspector
        runId="run_1"
        candidateId="cand_2"
        runClient={client(validCandidateIdeaZeitgeist)}
      />,
    );
    await screen.findByText(/On-device LLM inference reshapes/); // thesis (Zeit-specific) — no crash
    cleanup();

    // a CDT candidate WITHOUT the optional executableCheckIdea degrades gracefully (no throw/blank).
    // Built as a fresh literal (subtype literal narrows the union) — NOT spread from the union-typed fixture.
    const noCheck: CandidateIdea = {
      id: 'cand_1',
      runId: 'run_1',
      generationId: 'gen_1',
      agenomeId: 'agn_1',
      title: 'No-check transfer',
      summary: 'A cross-domain transfer with no executable check idea.',
      claims: ['transfer is viable'],
      evidenceRefs: [],
      status: 'created',
      subtype: 'cross_domain_transfer',
      subtypePayload: {
        sourceDomain: 'optics',
        sourceTechnique: 'adaptive optics',
        targetDomain: 'logistics',
        targetProblem: 'route correction',
        transferMapping: 'wavefront→demand error',
        expectedMechanism: 'closed-loop correction',
      },
    };
    render(<CandidateInspector runId="run_1" candidateId="cand_1" runClient={client(noCheck)} />);
    await screen.findByText(/adaptive optics/); // renders without the optional field
  });

  // spec(§12): a load failure surfaces an accessible error (no crash/blank).
  it('test_load_failure_surfaces_error', async () => {
    render(
      <CandidateInspector
        runId="run_1"
        candidateId="cand_1"
        runClient={client(new Error('boom'))}
      />,
    );
    await screen.findByRole('alert');
  });

  // spec(rule #6): the inspector imports nothing from apps/api.
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
