import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { RatingFrontmatter, RatingSubmission } from "./vaultSchemas";
import { ratingsLedgerPath, ratingsRoot } from "./vaultPaths";

export interface WriteRatingInput {
  vaultRoot: string;
  submission: RatingSubmission;
  now?: Date;
  ledgerPath?: string;
}

export interface WriteRatingResult {
  ratingId: string;
  absolutePath: string;
  relativePath: string;
  ledgerAbsolutePath: string;
  ledgerRelativePath: string;
}

export interface RatingLedgerEvent {
  schema_version: "calibrator.human-rating.v1";
  event_id: string;
  observed_at: string;
  artifact_type: "human_rating_event";
  rating_id: string;
  rating_markdown_path: string;
  case_id: string;
  rating_target: "solution" | "problem_recovery";
  solution_id?: string;
  problem_recovery_id?: string;
  phase: "problem_discovery" | "solution_discovery";
  target_kind: "solution" | "problem_recovery";
  score: number;
  verdict?: "dead" | "obvious" | "interesting" | "investigate" | "keeper";
  reviewer_email?: string;
  reviewer_name?: string;
  notes_present: boolean;
  app_version: "calibrator-v0";
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
}

function timestampId(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, "").replace("Z", "Z");
}

function toYamlValue(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && /^[a-zA-Z0-9_@./-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function frontmatterYaml(frontmatter: Record<string, unknown>): string {
  return Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${toYamlValue(value)}`)
    .join("\n");
}

export async function writeRatingMarkdown(input: WriteRatingInput): Promise<WriteRatingResult> {
  const submission = RatingSubmission.parse(input.submission);
  const now = input.now ?? new Date();
  const targetId =
    submission.rating_target === "problem_recovery"
      ? submission.problem_recovery_id
      : submission.solution_id;
  if (!targetId) {
    throw new Error(`Missing id for ${submission.rating_target} rating`);
  }
  const phase = submission.rating_target === "problem_recovery" ? "problem_discovery" : "solution_discovery";
  const ratingId = `rating_${timestampId(now)}_${safeIdPart(targetId)}`;
  const frontmatter = RatingFrontmatter.parse({
    artifact_type: "human_rating",
    rating_id: ratingId,
    rating_target: submission.rating_target,
    case_id: submission.case_id,
    solution_id: submission.rating_target === "solution" ? submission.solution_id : undefined,
    problem_recovery_id:
      submission.rating_target === "problem_recovery" ? submission.problem_recovery_id : undefined,
    score: submission.score,
    verdict: submission.verdict,
    phase,
    target_kind: submission.rating_target,
    scale_min: -5,
    scale_max: 5,
    reviewer_email: submission.reviewer_email || undefined,
    reviewer_name: submission.reviewer_name || undefined,
    submitted_at: now.toISOString(),
    app_version: "calibrator-v0",
  });

  const body = [
    "---",
    frontmatterYaml(frontmatter),
    "---",
    "",
    "## Notes",
    "",
    submission.notes.trim() || "No notes provided.",
    "",
    "## Strengths",
    "",
    "## Concerns",
    "",
    "## What Would Improve It",
    "",
  ].join("\n");

  const dir = ratingsRoot(input.vaultRoot, submission.case_id);
  await mkdir(dir, { recursive: true });
  const absolutePath = join(dir, `${ratingId}.md`);
  await writeFile(absolutePath, body, "utf8");
  const relativePath = join("calibration-vault", relative(input.vaultRoot, absolutePath));

  const ledgerAbsolutePath = input.ledgerPath ?? ratingsLedgerPath(input.vaultRoot);
  const ledgerRelativePath = join("calibration-vault", relative(input.vaultRoot, ledgerAbsolutePath));
  const ledgerEvent: RatingLedgerEvent = {
    schema_version: "calibrator.human-rating.v1",
    event_id: `hre_${ratingId}`,
    observed_at: now.toISOString(),
    artifact_type: "human_rating_event",
    rating_id: ratingId,
    rating_markdown_path: relativePath,
    case_id: submission.case_id,
    rating_target: submission.rating_target,
    solution_id: submission.rating_target === "solution" ? submission.solution_id : undefined,
    problem_recovery_id:
      submission.rating_target === "problem_recovery" ? submission.problem_recovery_id : undefined,
    phase,
    target_kind: submission.rating_target,
    score: submission.score,
    verdict: submission.verdict,
    reviewer_email: submission.reviewer_email || undefined,
    reviewer_name: submission.reviewer_name || undefined,
    notes_present: Boolean(submission.notes.trim()),
    app_version: "calibrator-v0",
  };
  await mkdir(dirname(ledgerAbsolutePath), { recursive: true });
  await appendFile(ledgerAbsolutePath, `${JSON.stringify(ledgerEvent)}\n`, "utf8");

  return {
    ratingId,
    absolutePath,
    relativePath,
    ledgerAbsolutePath,
    ledgerRelativePath,
  };
}

export function ratingFileName(path: string): string {
  return basename(path);
}
