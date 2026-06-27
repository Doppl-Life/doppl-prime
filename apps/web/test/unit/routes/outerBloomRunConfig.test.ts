import { describe, expect, it } from 'vitest';
import { RunConfig } from '../../../src/data/contracts';
import {
  DEFAULT_BLOOM_GROW_FORM,
  buildBloomRunConfig,
  canBuildBloomRunConfig,
  parseCaseStudyMarkdown,
  updateBloomGrowFormFromMarkdown,
} from '../../../src/routes/outerBloomRunConfig';

describe('outerBloomRunConfig — Grow tab view model to kernel RunConfig', () => {
  it('parses case-study markdown into title, synopsis, and seed text', () => {
    const markdown = `---
title: Battery Supply Constraint
---

# Ignored Fallback

## Synopsis

Battery supply is read as a raw-material bottleneck.

## Context

The situation it grows from.
`;

    const parsed = parseCaseStudyMarkdown(markdown, 'case.md');

    expect(parsed.title).toBe('Battery Supply Constraint');
    expect(parsed.synopsis).toBe('Battery supply is read as a raw-material bottleneck.');
    expect(parsed.seed).toContain('## Context');
  });

  it('falls back to heading and first paragraph when frontmatter sections are absent', () => {
    const parsed = parseCaseStudyMarkdown(
      '# When The Crashes Do Not Come\n\nA vehicle-liability discontinuity case.\n\nMore detail.',
      'uploaded.md',
    );

    expect(parsed.title).toBe('When The Crashes Do Not Come');
    expect(parsed.synopsis).toBe('A vehicle-liability discontinuity case.');
    expect(parsed.seed).toContain('More detail.');
  });

  it('builds a frozen RunConfig-compatible payload using existing kernel contracts', () => {
    const form = {
      ...DEFAULT_BLOOM_GROW_FORM,
      title: 'When The Crashes Do Not Come',
      seedText: 'Tesla robotaxi crash-frequency collapse creates new liability patterns.',
      synopsis: 'Recover problem structures from a crash-frequency discontinuity.',
      generationMode: 'recover_problem' as const,
      direction: 'converge' as const,
      generateCount: 7,
      maxSpawnDepth: 3,
      maxGenerations: 4,
      energyBudget: 9000,
      maxToolCalls: 160,
      wallClockMinutes: 9,
      operators: ['first_principles', 'polymath'] as const,
    };

    const result = buildBloomRunConfig(form, { rngSeed: 123 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.seed).toContain('Title: When The Crashes Do Not Come');
    expect(result.config.seed).toContain('Mode: recover problem');
    expect(result.config.seed).toContain('Generate recovered-problem candidates');
    expect(result.config.seed).toContain('not implementation proposals');
    expect(result.config.generationBias).toBe(-0.65);
    expect(result.config.generationOperators).toEqual(['first_principles', 'polymath']);
    expect(result.config.rngSeed).toBe(123);
    expect(result.config.caps).toMatchObject({
      maxPopulation: 7,
      maxGenerations: 4,
      energyBudget: 9000,
      maxSpawnDepth: 3,
      maxToolCalls: 160,
      wallClockTimeoutMs: 540000,
    });
    expect(RunConfig.safeParse(result.config).success).toBe(true);
  });

  it('frames grow-Doppl launches as solution/findings work against a recovered problem', () => {
    const result = buildBloomRunConfig(
      {
        ...DEFAULT_BLOOM_GROW_FORM,
        title: 'Liability Recovery',
        seedText: 'Parent problem: crash disappearance breaks insurance pricing.',
        generationMode: 'grow_doppl',
        direction: 'auto',
      },
      { rngSeed: 456 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.seed).toContain('Mode: grow Doppl');
    expect(result.config.seed).toContain('produce Doppls');
    expect(result.config.seed).toContain('against the selected recovered problem');
    expect(result.config.generationBias).toBe(0.45);
  });

  it('rejects empty grow requests before POST /runs', () => {
    const result = buildBloomRunConfig({ ...DEFAULT_BLOOM_GROW_FORM, seedText: '', title: '' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.seedText).toBeTruthy();
  });

  it('reports whether the sidebar has enough essential info to enable Run bloom', () => {
    expect(canBuildBloomRunConfig(DEFAULT_BLOOM_GROW_FORM)).toBe(false);
    expect(
      canBuildBloomRunConfig({
        ...DEFAULT_BLOOM_GROW_FORM,
        title: 'The Swim-Up Boarding',
        seedText: 'A yacht intrusion case with an unguarded waterline perimeter.',
      }),
    ).toBe(true);
    expect(
      canBuildBloomRunConfig({
        ...DEFAULT_BLOOM_GROW_FORM,
        title: 'The Swim-Up Boarding',
        seedText: 'A yacht intrusion case.',
        energyBudget: 0,
      }),
    ).toBe(false);
  });

  it('updates the grow form from uploaded markdown without losing selected controls', () => {
    const form = {
      ...DEFAULT_BLOOM_GROW_FORM,
      direction: 'diverge' as const,
      operators: ['blindside'] as const,
    };

    const next = updateBloomGrowFormFromMarkdown(
      form,
      '# Autonomy Liability Shift\n\n## Synopsis\n\nA case about crash frequency.',
      'shift.md',
    );

    expect(next.title).toBe('Autonomy Liability Shift');
    expect(next.synopsis).toBe('A case about crash frequency.');
    expect(next.direction).toBe('diverge');
    expect(next.operators).toEqual(['blindside']);
  });
});
