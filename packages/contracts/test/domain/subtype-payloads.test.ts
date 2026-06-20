// P0.5 — the two breeding-subtype payloads. spec(§3): each candidate subtype carries a distinct,
// strict payload shape (DATA_MODEL.md). The schema pins field SHAPE only — non-empty strings +
// string arrays — never generative quality.
import { describe, it, expect } from 'vitest';
import { CrossDomainTransferPayload, ZeitgeistSynthesisPayload } from '@doppl/contracts';

const validCdt = {
  sourceDomain: 'immunology',
  sourceTechnique: 'clonal selection',
  targetDomain: 'recommender systems',
  targetProblem: 'cold-start personalization',
  transferMapping: 'antigens→items, antibodies→user-affinity vectors',
  expectedMechanism: 'affinity maturation surfaces niche items faster than collaborative filtering',
  executableCheckIdea: 'A/B vs CF baseline on held-out cold-start users',
};

const validZeit = {
  thesis: 'On-device LLM inference reshapes privacy-first consumer apps',
  audience: 'mobile product teams',
  currentSignals: ['NPU ubiquity', 'sub-3B models matching GPT-3.5 on narrow tasks'],
  whyNow: 'silicon + small-model quality crossed the usability threshold in 2026',
  falsifiablePredictions: ['>30% of new note apps ship on-device inference within 18mo'],
  comparablePriorArt: ['spell-check moving on-device', 'photo ML moving on-device'],
};

const CDT_REQUIRED = [
  'sourceDomain',
  'sourceTechnique',
  'targetDomain',
  'targetProblem',
  'transferMapping',
  'expectedMechanism',
] as const;

const ZEIT_REQUIRED = [
  'thesis',
  'audience',
  'currentSignals',
  'whyNow',
  'falsifiablePredictions',
  'comparablePriorArt',
] as const;

describe('CrossDomainTransferPayload (spec §3 / DATA_MODEL.md)', () => {
  it('cdt_payload_accepts_valid_and_strict', () => {
    // spec(§3): full CDT payload parses + round-trips; executableCheckIdea is optional.
    expect(CrossDomainTransferPayload.parse(validCdt)).toEqual(validCdt);
    const noCheck: Record<string, unknown> = { ...validCdt };
    delete noCheck.executableCheckIdea;
    expect(CrossDomainTransferPayload.parse(noCheck)).toEqual(noCheck);
    // strict: unknown field rejected; each required field mandatory; empty strings rejected.
    expect(() => CrossDomainTransferPayload.parse({ ...validCdt, bogus: 1 })).toThrow();
    expect(() => CrossDomainTransferPayload.parse({ ...validCdt, sourceDomain: '' })).toThrow();
    for (const k of CDT_REQUIRED) {
      const clone: Record<string, unknown> = { ...validCdt };
      delete clone[k];
      expect(() => CrossDomainTransferPayload.parse(clone), `missing ${k}`).toThrow();
    }
    expect(CDT_REQUIRED).toHaveLength(6);
  });
});

describe('ZeitgeistSynthesisPayload (spec §3 / DATA_MODEL.md)', () => {
  it('zeit_payload_accepts_valid_and_strict', () => {
    // spec(§3): full Zeit payload parses; the three array fields are arrays of non-empty strings.
    expect(ZeitgeistSynthesisPayload.parse(validZeit)).toEqual(validZeit);
    // array fields may be empty arrays structurally, but their elements are non-empty strings.
    expect(
      ZeitgeistSynthesisPayload.parse({ ...validZeit, comparablePriorArt: [] }).comparablePriorArt,
    ).toEqual([]);
    expect(() => ZeitgeistSynthesisPayload.parse({ ...validZeit, currentSignals: [''] })).toThrow();
    expect(() =>
      ZeitgeistSynthesisPayload.parse({ ...validZeit, currentSignals: 'notarray' }),
    ).toThrow();
    // strict: unknown field rejected; each required field mandatory; empty strings rejected.
    expect(() => ZeitgeistSynthesisPayload.parse({ ...validZeit, bogus: 1 })).toThrow();
    expect(() => ZeitgeistSynthesisPayload.parse({ ...validZeit, thesis: '' })).toThrow();
    for (const k of ZEIT_REQUIRED) {
      const clone: Record<string, unknown> = { ...validZeit };
      delete clone[k];
      expect(() => ZeitgeistSynthesisPayload.parse(clone), `missing ${k}`).toThrow();
    }
    expect(ZEIT_REQUIRED).toHaveLength(6);
  });
});
