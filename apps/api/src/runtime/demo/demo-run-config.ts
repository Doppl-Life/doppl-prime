import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RunConfig, SubtypeName } from "@doppl/contracts";
import { RunConfig as RunConfigSchema } from "@doppl/contracts";
import { type DemoCapOverride, applyDemoOverride } from "./demo-cap-override.js";

/**
 * Demo run-config helper (PD.5). Builds a valid RunConfig from either:
 *   - A curated problem-set selection (loaded from fixtures/curated-prompts/<id>.json)
 *   - An operator-entered free-text prompt
 *
 * Both paths flow through the SAME write path as a normal POST /runs:
 * the result is just a RunConfig, validated by the Zod schema. There is
 * no new event type, no new RunConfig shape, no new contract surface.
 *
 * Phase 4's candidate-as-DATA isolation seam means an injected prompt
 * cannot move scoring; that safety pin is structurally enforced
 * upstream, so this helper does NOT need to sanitize prompt content.
 *
 * For operator prompts: `seed` is derived deterministically from the
 * prompt text so identical prompts produce identical runs. Long prompts
 * (>200 chars) are hashed to keep `seed` short; the full prompt still
 * lands in the curated payload structure when applicable.
 */

export class EmptyPromptError extends Error {
  constructor() {
    super(
      "demo-run-config: operatorPrompt is required when source='operator' and must be non-empty",
    );
    this.name = "EmptyPromptError";
  }
}

export class CuratedPromptNotFoundError extends Error {
  public readonly problemId: string;
  constructor(problemId: string) {
    super(`demo-run-config: curated prompt '${problemId}' not found`);
    this.name = "CuratedPromptNotFoundError";
    this.problemId = problemId;
  }
}

export class InvalidCuratedPromptError extends Error {
  public readonly problemId: string;
  constructor(problemId: string, reason: string) {
    super(`demo-run-config: curated prompt '${problemId}' is invalid: ${reason}`);
    this.name = "InvalidCuratedPromptError";
    this.problemId = problemId;
  }
}

export interface CuratedPrompt {
  id: string;
  title: string;
  subtype: SubtypeName;
  prompt: string;
  seed: string;
  rngSeed: string;
  modelProfile: string;
  scoringPolicyVersion: string;
  defaultCaps: RunConfig["caps"];
}

export const DEFAULT_CURATED_PROMPTS_DIR = resolve(process.cwd(), "fixtures/curated-prompts");

const OPERATOR_DEFAULTS = {
  modelProfile: "default",
  scoringPolicyVersion: "v1",
  caps: {
    maxPopulation: 6,
    maxGenerations: 4,
    energyBudget: 8_000,
    maxSpawnDepth: 3,
    maxToolCalls: 40,
    wallClockTimeoutMs: 10 * 60 * 1000,
  },
  enabledSubtypes: ["cross_domain_transfer", "zeitgeist_synthesis"] as SubtypeName[],
} as const;

export type BuildDemoConfigInput =
  | {
      source: "prepared";
      problemId: string;
      capOverride?: DemoCapOverride;
      curatedPromptsDir?: string;
    }
  | {
      source: "operator";
      operatorPrompt: string;
      capOverride?: DemoCapOverride;
    };

export interface BuildDemoConfigResult {
  config: RunConfig;
  warnings: string[];
  source: "prepared" | "operator";
  promptText: string;
}

async function loadCuratedPrompt(problemId: string, dir: string): Promise<CuratedPrompt> {
  const path = resolve(dir, `${problemId}.json`);
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    if (err instanceof Error && /ENOENT/.test(err.message)) {
      throw new CuratedPromptNotFoundError(problemId);
    }
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new InvalidCuratedPromptError(
      problemId,
      err instanceof Error ? err.message : String(err),
    );
  }
  const candidate = parsed as Partial<CuratedPrompt>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.subtype !== "string" ||
    typeof candidate.prompt !== "string" ||
    typeof candidate.seed !== "string" ||
    typeof candidate.rngSeed !== "string" ||
    typeof candidate.modelProfile !== "string" ||
    typeof candidate.scoringPolicyVersion !== "string" ||
    !candidate.defaultCaps
  ) {
    throw new InvalidCuratedPromptError(problemId, "missing required field");
  }
  return candidate as CuratedPrompt;
}

function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 32);
}

export async function buildDemoConfig(input: BuildDemoConfigInput): Promise<BuildDemoConfigResult> {
  if (input.source === "prepared") {
    const curated = await loadCuratedPrompt(
      input.problemId,
      input.curatedPromptsDir ?? DEFAULT_CURATED_PROMPTS_DIR,
    );
    const baseConfig = RunConfigSchema.parse({
      seed: curated.seed,
      rngSeed: curated.rngSeed,
      enabledSubtypes: [curated.subtype],
      modelProfile: curated.modelProfile,
      scoringPolicyVersion: curated.scoringPolicyVersion,
      caps: curated.defaultCaps,
    });
    const { config, warnings } = applyDemoOverride(baseConfig, input.capOverride);
    return { config, warnings, source: "prepared", promptText: curated.prompt };
  }

  const promptText = input.operatorPrompt.trim();
  if (promptText.length === 0) throw new EmptyPromptError();

  const seed = promptText.length <= 64 ? promptText : `op-${hashPrompt(promptText)}`;
  const baseConfig = RunConfigSchema.parse({
    seed,
    rngSeed: `op-rng-${hashPrompt(promptText).slice(0, 16)}`,
    enabledSubtypes: OPERATOR_DEFAULTS.enabledSubtypes,
    modelProfile: OPERATOR_DEFAULTS.modelProfile,
    scoringPolicyVersion: OPERATOR_DEFAULTS.scoringPolicyVersion,
    caps: { ...OPERATOR_DEFAULTS.caps },
  });
  const { config, warnings } = applyDemoOverride(baseConfig, input.capOverride);
  return { config, warnings, source: "operator", promptText };
}

export async function listCuratedPrompts(
  dir: string = DEFAULT_CURATED_PROMPTS_DIR,
): Promise<Array<Pick<CuratedPrompt, "id" | "title" | "subtype">>> {
  const { readdir } = await import("node:fs/promises");
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const out: Array<Pick<CuratedPrompt, "id" | "title" | "subtype">> = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const problemId = file.replace(/\.json$/, "");
    try {
      const curated = await loadCuratedPrompt(problemId, dir);
      out.push({ id: curated.id, title: curated.title, subtype: curated.subtype });
    } catch {
      // Skip malformed entries — listing is best-effort.
    }
  }
  return out;
}
