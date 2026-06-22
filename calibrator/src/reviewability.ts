import type { CalibratorProblemRecovery, CalibratorSolution } from "./types";

export type ReviewArtifact = CalibratorProblemRecovery | CalibratorSolution;
export type ReviewMode = "primary" | "audit";

export function sourceStatus(artifact: ReviewArtifact): string {
  return artifact.source_status ?? "unknown";
}

export function reviewMode(artifact: ReviewArtifact): ReviewMode {
  const status = sourceStatus(artifact);
  if (status === "imported" || status === "live_run") return "primary";
  return "audit";
}

export function canSubmitRating(artifact: ReviewArtifact | null): boolean {
  return artifact !== null && reviewMode(artifact) === "primary";
}

export function reviewModeLabel(artifact: ReviewArtifact): string {
  return reviewMode(artifact) === "primary" ? "primary" : sourceStatus(artifact).replace("_", " ");
}
