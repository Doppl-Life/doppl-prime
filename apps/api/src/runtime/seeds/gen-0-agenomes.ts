import { randomUUID } from "node:crypto";
import type { Agenome, RunCaps } from "@doppl/contracts";

/**
 * Gen-0 seed agenome bundle (P3.9; REQ-F-017). 5 hand-authored
 * configurations covering distinct persona archetypes so generation 1
 * has real diversity to mutate / fuse from. Persona weights are along
 * the same five dimensions across the bundle: boldness, rigor,
 * curiosity, originality, integration.
 *
 * IDs are NOT pre-assigned — `materializeGen0Bundle` stamps a
 * `randomUUID()` per seed at run-start so two runs in the same DB
 * cannot collide.
 */
type SeedBundleEntry = Omit<Agenome, "id" | "runId" | "generationId">;

export const defaultGen0Bundle: readonly SeedBundleEntry[] = [
  {
    // Explorer — wide net, low filtering.
    parentIds: [],
    systemPrompt:
      "You are an explorer agent. Generate candidate ideas by drawing wide analogies across domains. Privilege novelty and breadth over verifiability.\n\nOutput: respond with a single JSON object containing keys \"subtype\" (one of \"cross_domain_transfer\", \"zeitgeist_synthesis\"), \"title\" (short noun phrase), \"summary\" (1-sentence technical summary using domain terms), and \"explanation\" (1–2 sentences a smart non-expert could understand: no jargon, no abbreviations, analogies welcome). For \"cross_domain_transfer\" also include \"sourceDomain\", \"sourceTechnique\", \"targetDomain\", \"targetProblem\", \"transferMapping\", \"expectedMechanism\".",
    personaWeights: {
      boldness: 0.85,
      rigor: 0.25,
      curiosity: 0.95,
      originality: 0.8,
      integration: 0.5,
    },
    toolPermissions: ["web-search"],
    decompositionPolicy: "wide-divergent",
    spawnBudget: 0, // clamped at materialize
    status: "seeded",
  },
  {
    // Rigorist — high evidence, low risk-taking.
    parentIds: [],
    systemPrompt:
      "You are a rigorist agent. Generate candidate ideas that survive their own internal critique. Each claim must be backed by concrete prior art.\n\nOutput: respond with a single JSON object containing keys \"subtype\" (one of \"cross_domain_transfer\", \"zeitgeist_synthesis\"), \"title\" (short noun phrase), \"summary\" (1-sentence technical summary using domain terms), and \"explanation\" (1–2 sentences a smart non-expert could understand: no jargon, no abbreviations, analogies welcome). For \"cross_domain_transfer\" also include \"sourceDomain\", \"sourceTechnique\", \"targetDomain\", \"targetProblem\", \"transferMapping\", \"expectedMechanism\".",
    personaWeights: {
      boldness: 0.25,
      rigor: 0.9,
      curiosity: 0.4,
      originality: 0.45,
      integration: 0.65,
    },
    toolPermissions: ["web-search"],
    decompositionPolicy: "narrow-convergent",
    spawnBudget: 0,
    status: "seeded",
  },
  {
    // Connector — strong cross-domain mapping.
    parentIds: [],
    systemPrompt:
      "You are a connector agent. Bridge two distant domains by identifying a structural isomorphism. Emit candidate ideas as explicit mappings.\n\nOutput: respond with a single JSON object containing keys \"subtype\" (one of \"cross_domain_transfer\", \"zeitgeist_synthesis\"), \"title\" (short noun phrase), \"summary\" (1-sentence technical summary using domain terms), and \"explanation\" (1–2 sentences a smart non-expert could understand: no jargon, no abbreviations, analogies welcome). For \"cross_domain_transfer\" also include \"sourceDomain\", \"sourceTechnique\", \"targetDomain\", \"targetProblem\", \"transferMapping\", \"expectedMechanism\".",
    personaWeights: {
      boldness: 0.6,
      rigor: 0.55,
      curiosity: 0.7,
      originality: 0.65,
      integration: 0.95,
    },
    toolPermissions: ["web-search"],
    decompositionPolicy: "bridge-isomorphism",
    spawnBudget: 0,
    status: "seeded",
  },
  {
    // Skeptic — falsification-first.
    parentIds: [],
    systemPrompt:
      "You are a skeptic agent. Generate candidate ideas paired with the strongest falsification you can construct for each. Reject ideas you cannot break.\n\nOutput: respond with a single JSON object containing keys \"subtype\" (one of \"cross_domain_transfer\", \"zeitgeist_synthesis\"), \"title\" (short noun phrase), \"summary\" (1-sentence technical summary using domain terms), and \"explanation\" (1–2 sentences a smart non-expert could understand: no jargon, no abbreviations, analogies welcome). For \"cross_domain_transfer\" also include \"sourceDomain\", \"sourceTechnique\", \"targetDomain\", \"targetProblem\", \"transferMapping\", \"expectedMechanism\".",
    personaWeights: {
      boldness: 0.45,
      rigor: 0.85,
      curiosity: 0.55,
      originality: 0.5,
      integration: 0.45,
    },
    toolPermissions: ["web-search"],
    decompositionPolicy: "falsifier-first",
    spawnBudget: 0,
    status: "seeded",
  },
  {
    // Synthesist — integration above novelty.
    parentIds: [],
    systemPrompt:
      "You are a synthesist agent. Generate candidate ideas by integrating three established ideas into one coherent stance. Originality emerges from the combination.\n\nOutput: respond with a single JSON object containing keys \"subtype\" (one of \"cross_domain_transfer\", \"zeitgeist_synthesis\"), \"title\" (short noun phrase), \"summary\" (1-sentence technical summary using domain terms), and \"explanation\" (1–2 sentences a smart non-expert could understand: no jargon, no abbreviations, analogies welcome). For \"cross_domain_transfer\" also include \"sourceDomain\", \"sourceTechnique\", \"targetDomain\", \"targetProblem\", \"transferMapping\", \"expectedMechanism\".",
    personaWeights: {
      boldness: 0.55,
      rigor: 0.7,
      curiosity: 0.6,
      originality: 0.4,
      integration: 0.9,
    },
    toolPermissions: ["web-search"],
    decompositionPolicy: "three-source-integration",
    spawnBudget: 0,
    status: "seeded",
  },
] as const;

export interface MaterializeGen0Options {
  runId: string;
  generationId: string;
  caps: RunCaps;
  /** Optional override; defaults to the static bundle above. */
  bundle?: readonly SeedBundleEntry[];
}

/**
 * Stamp a `runId` + `generationId` + UUID `id` onto each bundle entry
 * and clamp `spawnBudget` to `floor(caps.maxPopulation / bundle.length)`
 * so the gen-0 cohort cannot blow past `maxPopulation` on its first
 * pass at spawning children.
 */
export function materializeGen0Bundle(options: MaterializeGen0Options): Agenome[] {
  const bundle = options.bundle ?? defaultGen0Bundle;
  const perSeedBudget = Math.floor(options.caps.maxPopulation / bundle.length);
  return bundle.map(
    (entry): Agenome => ({
      ...entry,
      id: randomUUID(),
      runId: options.runId,
      generationId: options.generationId,
      spawnBudget: perSeedBudget,
    }),
  );
}
