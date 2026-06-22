import { z } from "zod";

const SourceType = z.enum(["kernel", "manual", "unknown"]);
const SourceStatus = z.enum(["fixture", "imported", "live_run", "pending", "unavailable"]);

const TextBlock = z.union([z.string(), z.array(z.string())]);

const KernelRunProblemRecovery = z.object({
  title: z.string().min(1).default("Problem Recovery"),
  body: z.string().min(1),
});

const KernelRunSolution = z.object({
  title: z.string().min(1).default("Solution"),
  body: z.string().min(1),
});

export const KernelRunImportArtifact = z.object({
  schema_version: z.literal("calibrator-kernel-run-v1"),
  case_id: z.string().min(1),
  run_artifact_id: z.string().min(1),
  source_type: SourceType.default("kernel"),
  source_status: SourceStatus.default("imported"),
  source_branch: z.string().min(1).optional(),
  source_commit: z.string().min(1).optional(),
  source_mapping_version: z.string().min(1).default("calibrator-kernel-run-import-v1"),
  adapter_version: z.string().min(1).default("calibrator-kernel-run-import-v1"),
  adapter_notes: z.string().min(1).optional(),
  kernel: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  run_id: z.string().min(1).optional(),
  created_at: z.string().min(1).optional(),
  trace: TextBlock.default(""),
  case_study: TextBlock.optional(),
  discovery: TextBlock.default(""),
  problem_recovery: KernelRunProblemRecovery,
  solution: KernelRunSolution.optional(),
});

export const KernelRunImportFile = z.union([
  KernelRunImportArtifact,
  z.array(KernelRunImportArtifact).min(1),
]);

export type KernelRunImportArtifact = z.infer<typeof KernelRunImportArtifact>;
export type KernelRunImportArtifactInput = z.input<typeof KernelRunImportArtifact>;
