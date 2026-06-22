import { describe, expect, it } from 'vitest';
import {
  AgenomeStatus,
  CandidateStatus,
  CheckStatus,
  GenerationStatus,
  RunStatus,
  Subtype,
} from '@doppl/contracts';
import { NEUTRAL_SPEC, resolveStatus, STATUS_MAP } from '../../../src/components/core/status-map';
import type { StatusDomain } from '../../../src/components/core/status-map';

/** Each UI status domain paired with the FROZEN contract enum that is its authority. */
const DOMAIN_ENUMS = [
  ['agenome', AgenomeStatus],
  ['candidate', CandidateStatus],
  ['check', CheckStatus],
  ['run', RunStatus],
  ['generation', GenerationStatus],
  ['subtype', Subtype],
] as const;

describe('status-map — exhaustive over the frozen domain enums', () => {
  // spec(§12): every frozen status value maps to {glyph, label, colorToken} — a new enum value that
  // isn't mapped fails loudly here.
  it('test_every_frozen_status_has_a_mapping', () => {
    for (const [domain, schema] of DOMAIN_ENUMS) {
      for (const value of Object.values(schema.enum)) {
        const spec = STATUS_MAP[domain][value];
        expect(spec, `${domain}/${value} must be mapped`).toBeDefined();
        expect(spec?.glyph).toBeTruthy();
        expect(spec?.label).toBeTruthy();
        expect(spec?.colorToken).toMatch(/^var\(--/);
      }
    }
  });

  // spec(§12 / forbidden #4): color is never the sole encoding — every mapping has a glyph AND label.
  it('test_mapping_never_color_alone', () => {
    for (const domain of Object.keys(STATUS_MAP) as StatusDomain[]) {
      for (const spec of Object.values(STATUS_MAP[domain])) {
        expect(spec.glyph.length).toBeGreaterThan(0);
        expect(spec.label.length).toBeGreaterThan(0);
      }
    }
  });

  // spec(§12): an unmapped status resolves to a distinct NEUTRAL indicator — never throws / blanks.
  it('test_unknown_status_neutral_indicator', () => {
    const spec = resolveStatus('run', 'definitely-not-a-status');
    expect(spec.glyph).toBe(NEUTRAL_SPEC.glyph);
    expect(() => resolveStatus('agenome', 'nope')).not.toThrow();
  });

  // spec(frozen-contract authority over the prototype): drift reconciliation.
  it('test_drift_reconciliation', () => {
    // agenome 'mutated' (prototype-only) is OMITTED — not a frozen AgenomeStatus value.
    expect(STATUS_MAP.agenome['mutated']).toBeUndefined();
    expect(resolveStatus('agenome', 'mutated').glyph).toBe(NEUTRAL_SPEC.glyph);
    // candidate 'culled' IS mapped (frozen CandidateStatus has it).
    expect(STATUS_MAP.candidate['culled']).toBeDefined();
    // generation domain covers all 9 frozen GenerationStatus values (incl. sv5 'degraded').
    for (const value of Object.values(GenerationStatus.enum)) {
      expect(STATUS_MAP.generation[value]).toBeDefined();
    }
    // candidate domain covers all 9 frozen CandidateStatus values (incl. sv5 'repairing').
    for (const value of Object.values(CandidateStatus.enum)) {
      expect(STATUS_MAP.candidate[value]).toBeDefined();
    }
  });

  // spec(_adherence: no raw hex): every colorToken is a var(--...) reference, never a raw hex.
  it('test_color_tokens_are_var_refs_not_raw_hex', () => {
    for (const domain of Object.keys(STATUS_MAP) as StatusDomain[]) {
      for (const spec of Object.values(STATUS_MAP[domain])) {
        expect(spec.colorToken).toMatch(/^var\(--[a-z0-9-]+\)$/);
        expect(spec.colorToken).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      }
    }
  });

  // spec(§12 / §3 sv5): the GenerationStatus 'degraded' value (the running→degraded→verifying
  // partial-failure edge) is a defined StatusSpec — shape + label + var(--…) colorToken.
  it('test_generation_degraded_mapped', () => {
    const spec = STATUS_MAP.generation['degraded'];
    expect(spec).toBeDefined();
    expect(spec?.glyph).toBeTruthy();
    expect(spec?.label).toBe('degraded');
    expect(spec?.colorToken).toMatch(/^var\(--[a-z0-9-]+\)$/);
  });

  // spec(§12 / §3 sv5): the CandidateStatus 'repairing' value (the created→repairing→under_review
  // structured-output repair edge) is a defined StatusSpec — shape + label + var(--…) colorToken.
  it('test_candidate_repairing_mapped', () => {
    const spec = STATUS_MAP.candidate['repairing'];
    expect(spec).toBeDefined();
    expect(spec?.glyph).toBeTruthy();
    expect(spec?.label).toBe('repairing');
    expect(spec?.colorToken).toMatch(/^var\(--[a-z0-9-]+\)$/);
  });

  // spec(rule #4 / §12 design-token adherence): the two new sv5 specs' colorTokens are var(--…)
  // references, never raw hex.
  it('test_new_specs_color_tokens_are_var_refs', () => {
    for (const spec of [STATUS_MAP.generation['degraded'], STATUS_MAP.candidate['repairing']]) {
      expect(spec?.colorToken).toMatch(/^var\(--[a-z0-9-]+\)$/);
      expect(spec?.colorToken).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    }
  });
});
