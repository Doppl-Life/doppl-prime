import type { GenerationOperator, RunConfig } from '../data/contracts';
import { RunConfig as RunConfigSchema } from '../data/contracts';

export type BloomGrowthMode = 'recover_problem' | 'grow_doppl' | 'campaign';
export type BloomGrowthDirection = 'auto' | 'converge' | 'diverge';

export interface BloomGrowForm {
  title: string;
  seedText: string;
  synopsis: string;
  generationMode: BloomGrowthMode;
  direction: BloomGrowthDirection;
  generateCount: number;
  maxSpawnDepth: number;
  maxGenerations: number;
  energyBudget: number;
  maxToolCalls: number;
  wallClockMinutes: number;
  operators: readonly GenerationOperator[];
}

export interface ParsedCaseStudyMarkdown {
  title: string;
  synopsis: string;
  seed: string;
}

export type BloomRunConfigResult =
  | { ok: true; config: RunConfig }
  | { ok: false; errors: Record<string, string> };

export const DEFAULT_BLOOM_GROW_FORM: BloomGrowForm = {
  title: '',
  seedText: '',
  synopsis: '',
  generationMode: 'recover_problem',
  direction: 'auto',
  generateCount: 8,
  maxSpawnDepth: 3,
  maxGenerations: 4,
  energyBudget: 12_000,
  maxToolCalls: 240,
  wallClockMinutes: 15,
  operators: ['first_principles', 'polymath', 'blindside'],
};

const DEFAULT_SUBTYPES: RunConfig['enabledSubtypes'] = ['cross_domain_transfer', 'zeitgeist_synthesis'];

export function parseCaseStudyMarkdown(markdown: string, filename: string): ParsedCaseStudyMarkdown {
  const withoutFrontmatter = stripFrontmatter(markdown);
  const frontmatterTitle = readFrontmatterField(markdown, 'title');
  const headingTitle = firstMarkdownHeading(withoutFrontmatter);
  const fallbackTitle = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  const title = frontmatterTitle ?? headingTitle ?? fallbackTitle ?? 'Untitled case study';

  const synopsis =
    markdownSection(withoutFrontmatter, 'synopsis') ?? firstParagraph(withoutFrontmatter) ?? '';

  return {
    title: title.trim(),
    synopsis: synopsis.trim(),
    seed: withoutFrontmatter.trim(),
  };
}

export function updateBloomGrowFormFromMarkdown(
  form: BloomGrowForm,
  markdown: string,
  filename: string,
): BloomGrowForm {
  const parsed = parseCaseStudyMarkdown(markdown, filename);
  return {
    ...form,
    title: parsed.title,
    synopsis: parsed.synopsis,
    seedText: parsed.seed,
  };
}

export function buildBloomRunConfig(
  form: BloomGrowForm,
  opts: { rngSeed?: number } = {},
): BloomRunConfigResult {
  const errors: Record<string, string> = {};
  if (form.seedText.trim().length === 0) errors.seedText = 'Add a case study seed or upload markdown.';
  if (form.title.trim().length === 0) errors.title = 'Add a case study title.';
  if (form.generateCount < 1) errors.generateCount = 'Generate count must be at least 1.';
  if (form.maxSpawnDepth < 1) errors.maxSpawnDepth = 'Spawn depth must be at least 1.';
  if (form.maxGenerations < 1) errors.maxGenerations = 'Max generations must be at least 1.';
  if (form.energyBudget < 1) errors.energyBudget = 'Energy budget must be at least 1.';
  if (form.maxToolCalls < 1) errors.maxToolCalls = 'Tool-call cap must be at least 1.';
  if (form.wallClockMinutes < 1) errors.wallClockMinutes = 'Wall-clock cap must be at least 1 minute.';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const config: RunConfig = {
    seed: buildKernelSeed(form),
    enabledSubtypes: DEFAULT_SUBTYPES,
    caps: {
      maxPopulation: Math.max(1, Math.round(form.generateCount)),
      maxGenerations: Math.max(1, Math.round(form.maxGenerations)),
      energyBudget: Math.max(1, Math.round(form.energyBudget)),
      maxSpawnDepth: Math.max(1, Math.min(8, Math.round(form.maxSpawnDepth))),
      maxToolCalls: Math.max(1, Math.round(form.maxToolCalls)),
      wallClockTimeoutMs: Math.max(1, Math.round(form.wallClockMinutes)) * 60_000,
    },
    modelProfile: 'mvp-openrouter',
    scoringPolicyVersion: 'scoring-v1',
    rngSeed: opts.rngSeed ?? deterministicSeed(`${form.title}\n${form.seedText}`),
    ...(form.operators.length > 0 ? { generationOperators: [...form.operators] } : {}),
    ...(biasForDirection(form.direction, form.generationMode) !== 0
      ? { generationBias: biasForDirection(form.direction, form.generationMode) }
      : {}),
  };

  const parsed = RunConfigSchema.safeParse(config);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors[issue.path.join('.') || 'form'] = issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, config: parsed.data };
}

function buildKernelSeed(form: BloomGrowForm): string {
  const lines = [
    `Title: ${form.title.trim()}`,
    `Mode: ${modeLabel(form.generationMode)}`,
    `Direction: ${form.direction}`,
  ];
  if (form.synopsis.trim().length > 0) lines.push(`Synopsis: ${form.synopsis.trim()}`);
  lines.push('', form.seedText.trim());
  return lines.join('\n');
}

function modeLabel(mode: BloomGrowthMode): string {
  if (mode === 'recover_problem') return 'recover problem';
  if (mode === 'grow_doppl') return 'grow Doppl';
  return 'campaign';
}

function biasForDirection(direction: BloomGrowthDirection, mode: BloomGrowthMode): number {
  if (direction === 'converge') return -0.65;
  if (direction === 'diverge') return 0.65;
  if (mode === 'grow_doppl') return 0.45;
  if (mode === 'recover_problem') return -0.45;
  return 0;
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
}

function readFrontmatterField(markdown: string, field: string): string | null {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---/);
  const frontmatter = match?.[1];
  if (frontmatter === undefined) return null;
  const line = frontmatter.split('\n').find((candidate) => candidate.startsWith(`${field}:`));
  if (line === undefined) return null;
  return line.slice(field.length + 1).trim().replace(/^['"]|['"]$/g, '') || null;
}

function firstMarkdownHeading(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function markdownSection(markdown: string, heading: string): string | null {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'im'));
  return match?.[1]?.trim() ?? null;
}

function firstParagraph(markdown: string): string | null {
  const withoutHeading = markdown.replace(/^#\s+.+$/m, '').trim();
  const paragraph = withoutHeading
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !part.startsWith('##'));
  return paragraph ?? null;
}

function deterministicSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
