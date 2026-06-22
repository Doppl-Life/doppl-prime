import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { writeRatingMarkdown } from "../src/server/ratingWriter";

describe("writeRatingMarkdown", () => {
  it("writes a rating markdown file under the case ratings folder", async () => {
    const root = join(tmpdir(), `calibrator-${Date.now()}`);
    await mkdir(join(root, "calibration-vault/cases/fsd-accident-economy/ratings"), {
      recursive: true,
    });

    const result = await writeRatingMarkdown({
      vaultRoot: join(root, "calibration-vault"),
      now: new Date("2026-06-22T12:00:00.000Z"),
      submission: {
        case_id: "fsd-accident-economy",
        rating_target: "solution",
        solution_id: "cody-accident-economy-map",
        score: 4,
        notes: "Strong map of second-order effects.",
        reviewer_email: "reviewer@gauntletai.com",
      },
    });

    const written = await readFile(result.absolutePath, "utf8");
    expect(result.relativePath).toContain("ratings/rating_20260622T120000000Z_");
    expect(written).toContain("artifact_type: human_rating");
    expect(written).toContain("score: 4");
    expect(written).toContain("phase: solution_discovery");
    expect(written).toContain("target_kind: solution");
    expect(written).toContain("Strong map of second-order effects.");

    const ledgerRaw = await readFile(result.ledgerAbsolutePath, "utf8");
    const ledgerEvent = JSON.parse(ledgerRaw.trim()) as Record<string, unknown>;
    expect(result.ledgerRelativePath).toBe("calibration-vault/ratings-ledger.jsonl");
    expect(ledgerEvent.schema_version).toBe("calibrator.human-rating.v1");
    expect(ledgerEvent.rating_markdown_path).toBe(result.relativePath);
    expect(ledgerEvent.case_id).toBe("fsd-accident-economy");
    expect(ledgerEvent.solution_id).toBe("cody-accident-economy-map");
    expect(ledgerEvent.score).toBe(4);
    expect(ledgerEvent.verdict).toBeUndefined();
    expect(ledgerEvent.reviewer_email).toBe("reviewer@gauntletai.com");
  });

  it("writes a problem recovery rating markdown file", async () => {
    const root = await mkdtemp(join(tmpdir(), "calibrator-rating-"));
    await mkdir(join(root, "calibration-vault/cases/fsd-accident-economy/ratings"), {
      recursive: true,
    });

    const result = await writeRatingMarkdown({
      vaultRoot: join(root, "calibration-vault"),
      now: new Date("2026-06-22T12:00:00.000Z"),
      submission: {
        case_id: "fsd-accident-economy",
        rating_target: "problem_recovery",
        problem_recovery_id: "pr_fsd_accident_economy",
        score: 5,
        notes: "Strong recovered problem.",
        reviewer_email: "",
      },
    });

    const written = await readFile(result.absolutePath, "utf8");
    expect(written).toContain("rating_target: problem_recovery");
    expect(written).toContain("problem_recovery_id: pr_fsd_accident_economy");
    expect(written).not.toContain("solution_id:");
  });
});
