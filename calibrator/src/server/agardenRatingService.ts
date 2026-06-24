import { join } from "node:path";
import { canSubmitRating } from "../reviewability";
import type { CalibratorIndex, CalibratorProblemRecovery, CalibratorSolution } from "../types";
import { normalizeRaterEmail } from "../raters";
import type { RatingSubmission } from "./vaultSchemas";
import { materializeAgardenProjection } from "./agardenProjection";
import { upsertAgardenRating } from "./agardenRatingWriter";

type RateableArtifact = CalibratorProblemRecovery | CalibratorSolution;

export interface WriteAgardenRatingInput {
  agardenRoot: string;
  index: CalibratorIndex;
  submission: RatingSubmission;
  now?: Date;
}

export interface WriteAgardenRatingResult {
  ratingId: string;
  relativePath: string;
  scores: Record<string, unknown>;
}

function selectedArtifact(index: CalibratorIndex, submission: RatingSubmission): RateableArtifact {
  const caseItem = index.cases.find((item) => item.case_id === submission.case_id);
  if (!caseItem) throw new Error(`Unknown case_id "${submission.case_id}"`);

  const artifact =
    submission.rating_target === "problem_recovery"
      ? caseItem.problem_recoveries.find((item) => item.problem_recovery_id === submission.problem_recovery_id)
      : caseItem.solutions.find((item) => item.solution_id === submission.solution_id);

  if (!artifact) {
    throw new Error(`Unknown ${submission.rating_target} target for case "${submission.case_id}"`);
  }
  if (!canSubmitRating(artifact)) {
    throw new Error("Audit-only artifacts cannot be rated");
  }
  if (!artifact.node_id) {
    throw new Error("Selected aGarden artifact is missing node_id");
  }
  if (!submission.node_id) {
    throw new Error("node_id is required for aGarden ratings");
  }
  if (submission.node_id !== artifact.node_id) {
    throw new Error("node_id mismatch for selected aGarden artifact");
  }
  if (!artifact.source_path) {
    throw new Error("Selected aGarden artifact is missing source_path");
  }
  return artifact;
}

export async function writeAgardenRating(input: WriteAgardenRatingInput): Promise<WriteAgardenRatingResult> {
  const artifact = selectedArtifact(input.index, input.submission);
  const nodeId = artifact.node_id;
  const sourcePath = artifact.source_path;
  if (!nodeId || !sourcePath) throw new Error("Selected aGarden artifact is missing node metadata");
  const ledgerResult = await upsertAgardenRating({
    agardenRoot: input.agardenRoot,
    nodeId,
    raterId: input.submission.reviewer_email ?? "",
    score: input.submission.score,
    now: input.now,
  });
  const projectionResult = await materializeAgardenProjection({
    nodePath: join(input.agardenRoot, sourcePath),
    projection: ledgerResult.projection,
  });

  return {
    ratingId: `${nodeId}:${normalizeRaterEmail(input.submission.reviewer_email ?? "")}`,
    relativePath: ledgerResult.ledgerRelativePath,
    scores: projectionResult.scores,
  };
}
