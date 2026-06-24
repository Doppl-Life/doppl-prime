import matter from "gray-matter";
import { z } from "zod";
import { canSubmitRating } from "../reviewability";
import { isAllowedRater, normalizeRaterEmail } from "../raters";
import type { CalibratorIndex, CalibratorProblemRecovery, CalibratorSolution } from "../types";
import { RatingSubmission, type RatingSubmission as RatingSubmissionType } from "./vaultSchemas";

const AgardenLedgerRating = z.object({
  rater_id: z.string().min(1),
  score: z.number().int().min(-5).max(5),
  rate_date: z.string().min(1),
});

const AgardenLedgerEntry = z.object({
  node_id: z.string().min(1),
  ratings: z.array(AgardenLedgerRating).default([]),
});

const AgardenRatingsLedger = z.array(AgardenLedgerEntry);
const LEDGER_PATH = "ratings-ledger.json";

type RateableArtifact = CalibratorProblemRecovery | CalibratorSolution;
type AgardenLedgerEntry = z.infer<typeof AgardenLedgerEntry>;

export interface GitTextFile {
  path: string;
  content: string;
  sha: string;
}

export interface GitTextFileWrite {
  path: string;
  content: string;
  previousSha: string;
}

export interface GitAgardenClient {
  readTextFile(path: string): Promise<GitTextFile>;
  commitTextFiles(input: {
    message: string;
    files: GitTextFileWrite[];
  }): Promise<{ commitSha: string }>;
}

export interface WriteGithubAgardenRatingInput {
  client: GitAgardenClient;
  index: CalibratorIndex;
  submission: RatingSubmissionType;
  now?: Date;
}

export interface WriteGithubAgardenRatingResult {
  ratingId: string;
  commitSha: string;
  ledgerPath: string;
  nodePath: string;
  scores: {
    human: number | null;
    n: number;
  };
  retried: boolean;
}

function selectedArtifact(index: CalibratorIndex, submission: RatingSubmissionType): RateableArtifact {
  const caseItem = index.cases.find((item) => item.case_id === submission.case_id);
  if (!caseItem) throw new Error(`Unknown case_id "${submission.case_id}"`);

  const artifact =
    submission.rating_target === "problem_recovery"
      ? caseItem.problem_recoveries.find((item) => item.problem_recovery_id === submission.problem_recovery_id)
      : caseItem.solutions.find((item) => item.solution_id === submission.solution_id);

  if (!artifact) throw new Error(`Unknown ${submission.rating_target} target for case "${submission.case_id}"`);
  if (!canSubmitRating(artifact)) throw new Error("Non-primary artifacts cannot be rated");
  if (!artifact.node_id) throw new Error("Selected aGarden artifact is missing node_id");
  if (!submission.node_id) throw new Error("node_id is required for aGarden ratings");
  if (submission.node_id !== artifact.node_id) throw new Error("node_id mismatch for selected aGarden artifact");
  if (!artifact.source_path) throw new Error("Selected aGarden artifact is missing source_path");

  return artifact;
}

function projectionFor(entry: AgardenLedgerEntry): WriteGithubAgardenRatingResult["scores"] {
  const n = entry.ratings.length;
  if (n === 0) return { human: null, n };
  const sum = entry.ratings.reduce((total, rating) => total + rating.score, 0);
  return { human: Number((sum / n).toFixed(2)), n };
}

function parseLedger(content: string): AgardenLedgerEntry[] {
  if (!content.trim()) return [];
  return AgardenRatingsLedger.parse(JSON.parse(content));
}

function upsertLedgerContent(input: {
  content: string;
  nodeId: string;
  raterId: string;
  score: number;
  now: Date;
}): { content: string; projection: WriteGithubAgardenRatingResult["scores"] } {
  const ledger = parseLedger(input.content);
  let entry = ledger.find((item) => item.node_id === input.nodeId);
  if (!entry) {
    entry = { node_id: input.nodeId, ratings: [] };
    ledger.push(entry);
  }

  const rating = {
    rater_id: input.raterId,
    score: input.score,
    rate_date: input.now.toISOString(),
  };
  const currentIndex = entry.ratings.findIndex(
    (item) => normalizeRaterEmail(item.rater_id) === input.raterId,
  );
  if (currentIndex >= 0) {
    entry.ratings[currentIndex] = rating;
  } else {
    entry.ratings.push(rating);
  }

  return {
    content: `${JSON.stringify(ledger, null, 2)}\n`,
    projection: projectionFor(entry),
  };
}

function materializeProjectionContent(
  content: string,
  projection: WriteGithubAgardenRatingResult["scores"],
): string {
  const parsed = matter(content) as { data: Record<string, unknown>; content: string };
  const previousScores =
    parsed.data.scores && typeof parsed.data.scores === "object" && !Array.isArray(parsed.data.scores)
      ? (parsed.data.scores as Record<string, unknown>)
      : {};
  parsed.data.scores = {
    ...previousScores,
    human: projection.human,
    n: projection.n,
  };
  return matter.stringify(parsed.content.trimStart(), parsed.data);
}

function isConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { status?: unknown; code?: unknown };
  return maybe.status === 409 || maybe.code === "STALE_SHA";
}

async function attemptWrite(input: {
  client: GitAgardenClient;
  artifact: RateableArtifact;
  submission: RatingSubmissionType;
  raterId: string;
  now: Date;
  retried: boolean;
}): Promise<WriteGithubAgardenRatingResult> {
  const nodePath = input.artifact.source_path;
  const nodeId = input.artifact.node_id;
  if (!nodePath || !nodeId) throw new Error("Selected aGarden artifact is missing node metadata");

  const [ledgerFile, nodeFile] = await Promise.all([
    input.client.readTextFile(LEDGER_PATH),
    input.client.readTextFile(nodePath),
  ]);
  const ledger = upsertLedgerContent({
    content: ledgerFile.content,
    nodeId,
    raterId: input.raterId,
    score: input.submission.score,
    now: input.now,
  });
  const nodeContent = materializeProjectionContent(nodeFile.content, ledger.projection);
  const commit = await input.client.commitTextFiles({
    message: [
      `judgment: rate ${nodeId}`,
      "",
      `rater: ${input.raterId}`,
      `node: ${nodeId}`,
      `score: ${input.submission.score}`,
      `projection: human=${ledger.projection.human ?? "null"}, n=${ledger.projection.n}`,
    ].join("\n"),
    files: [
      { path: LEDGER_PATH, content: ledger.content, previousSha: ledgerFile.sha },
      { path: nodePath, content: nodeContent, previousSha: nodeFile.sha },
    ],
  });

  return {
    ratingId: `${nodeId}:${input.raterId}`,
    commitSha: commit.commitSha,
    ledgerPath: LEDGER_PATH,
    nodePath,
    scores: ledger.projection,
    retried: input.retried,
  };
}

export async function writeGithubAgardenRating(
  input: WriteGithubAgardenRatingInput,
): Promise<WriteGithubAgardenRatingResult> {
  const submission = RatingSubmission.parse(input.submission);
  const artifact = selectedArtifact(input.index, submission);
  const raterId = normalizeRaterEmail(submission.reviewer_email ?? "");
  if (!isAllowedRater(raterId)) throw new Error("rater_id must be an allow-listed rater");
  const now = input.now ?? new Date();

  try {
    return await attemptWrite({
      client: input.client,
      artifact,
      submission,
      raterId,
      now,
      retried: false,
    });
  } catch (error) {
    if (!isConflict(error)) throw error;
    return attemptWrite({
      client: input.client,
      artifact,
      submission,
      raterId,
      now,
      retried: true,
    });
  }
}
