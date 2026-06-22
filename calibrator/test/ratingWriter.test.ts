import { mkdir, readFile } from "node:fs/promises";
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
        solution_id: "cody-accident-economy-map",
        score: 4,
        verdict: "investigate",
        notes: "Strong map of second-order effects.",
        reviewer_email: "reviewer@gauntletai.com",
      },
    });

    const written = await readFile(result.absolutePath, "utf8");
    expect(result.relativePath).toContain("ratings/rating_20260622T120000000Z_");
    expect(written).toContain("artifact_type: human_rating");
    expect(written).toContain("score: 4");
    expect(written).toContain("verdict: investigate");
    expect(written).toContain("phase: solution_discovery");
    expect(written).toContain("target_kind: solution");
    expect(written).toContain("Strong map of second-order effects.");
  });
});
