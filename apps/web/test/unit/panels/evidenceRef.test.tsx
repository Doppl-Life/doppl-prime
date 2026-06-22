// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EvidenceRefLink } from '../../../src/panels/evidenceRef';

afterEach(() => cleanup());

describe('EvidenceRefLink — in-tier evidence pointer', () => {
  // spec(§9/§4 / rule #9): an EvidenceRef renders its eventId/uri as IN-TIER references (authoritative
  // pointers) — NEVER an external href; the inspector never fabricates an external URL.
  it('test_evidence_ref_resolves_in_tier', () => {
    const { container } = render(
      <EvidenceRefLink
        evidenceRef={{ kind: 'trace', eventId: 'evt_42', uri: 'doppl://run_1/event/42' }}
      />,
    );
    expect(screen.getByText(/evt_42/)).toBeTruthy(); // in-tier eventId pointer
    expect(screen.getByText(/doppl:\/\/run_1/)).toBeTruthy(); // in-tier uri pointer (as text)
    // NEVER an anchor/external href — the pointer resolves in-tier (the shell wires resolution).
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[href]')).toBeNull();
    // the link target is exposed via a data attr for the shell to resolve, not an href.
    expect(container.querySelector('[data-event-id="evt_42"]')).toBeTruthy();
  });

  // a label-only ref (prior_art) degrades gracefully — renders kind + label, no pointer fields.
  it('test_label_only_ref_degrades_gracefully', () => {
    const { container } = render(
      <EvidenceRefLink evidenceRef={{ kind: 'prior_art', label: 'AIRS 2003' }} />,
    );
    expect(screen.getByText('AIRS 2003')).toBeTruthy();
    expect(screen.getByText(/prior_art/)).toBeTruthy();
    expect(container.querySelector('a')).toBeNull();
  });
});
