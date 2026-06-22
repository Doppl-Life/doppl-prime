import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { RatingFrontmatter, RatingSubmission } from "./vaultSchemas";
import { ratingsRoot } from "./vaultPaths";

export interface WriteRatingInput {
  vaultRoot: string;
  submission: RatingSubmission;
  now?: Date;
}

export interface WriteRatingResult {
  ratingId: string;
  absolutePath: string;
  relativePath: string;
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
  const ratingId = `rating_${timestampId(now)}_${safeIdPart(submission.solution_id)}`;
  const frontmatter = RatingFrontmatter.parse({
    artifact_type: "human_rating",
    rating_id: ratingId,
    rating_target: "solution",
    case_id: submission.case_id,
    solution_id: submission.solution_id,
    score: submission.score,
    verdict: submission.verdict,
    phase: "solution_discovery",
    target_kind: "solution",
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

  return {
    ratingId,
    absolutePath,
    relativePath: join("calibration-vault", relative(input.vaultRoot, absolutePath)),
  };
}

export function ratingFileName(path: string): string {
  return basename(path);
}
