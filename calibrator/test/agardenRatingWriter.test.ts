import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { upsertAgardenRating } from "../src/server/agardenRatingWriter";

describe("upsertAgardenRating", () => {
  it("creates a ratings-ledger entry for the target node", async () => {
    const agardenRoot = await mkdtemp(join(tmpdir(), "agarden-rating-"));

    const result = await upsertAgardenRating({
      agardenRoot,
      nodeId: "node-a",
      raterId: "MELISSA.HARGIS@CHALLENGER.GAUNTLETAI.COM",
      score: 4,
      now: new Date("2026-06-24T15:00:00.000Z"),
    });

    expect(result).toMatchObject({
      ledgerRelativePath: "ratings-ledger.json",
      projection: { human: 4, n: 1 },
      entry: {
        node_id: "node-a",
        ratings: [
          {
            rater_id: "melissa.hargis@challenger.gauntletai.com",
            score: 4,
            rate_date: "2026-06-24T15:00:00.000Z",
          },
        ],
      },
    });

    const ledger = JSON.parse(await readFile(join(agardenRoot, "ratings-ledger.json"), "utf8"));
    expect(ledger).toEqual([result.entry]);
  });

  it("replaces the current rating for the same rater and preserves other raters", async () => {
    const agardenRoot = await mkdtemp(join(tmpdir(), "agarden-rating-"));
    await mkdir(agardenRoot, { recursive: true });
    await writeFile(
      join(agardenRoot, "ratings-ledger.json"),
      JSON.stringify(
        [
          {
            node_id: "node-a",
            ratings: [
              {
                rater_id: "melissa.hargis@challenger.gauntletai.com",
                score: 2,
                rate_date: "2026-06-24T14:00:00.000Z",
              },
              {
                rater_id: "cody.clayton@challenger.gauntletai.com",
                score: 5,
                rate_date: "2026-06-24T14:05:00.000Z",
              },
            ],
          },
        ],
        null,
        2,
      ),
      "utf8",
    );

    const result = await upsertAgardenRating({
      agardenRoot,
      nodeId: "node-a",
      raterId: "melissa.hargis@challenger.gauntletai.com",
      score: -1,
      now: new Date("2026-06-24T15:00:00.000Z"),
    });

    expect(result.projection).toEqual({ human: 2, n: 2 });
    expect(result.entry.ratings).toEqual([
      {
        rater_id: "melissa.hargis@challenger.gauntletai.com",
        score: -1,
        rate_date: "2026-06-24T15:00:00.000Z",
      },
      {
        rater_id: "cody.clayton@challenger.gauntletai.com",
        score: 5,
        rate_date: "2026-06-24T14:05:00.000Z",
      },
    ]);
  });

  it("rejects invalid scores and non-allow-listed raters", async () => {
    const agardenRoot = await mkdtemp(join(tmpdir(), "agarden-rating-"));

    await expect(
      upsertAgardenRating({
        agardenRoot,
        nodeId: "node-a",
        raterId: "unknown@example.com",
        score: 3,
      }),
    ).rejects.toThrow("allow-listed");

    await expect(
      upsertAgardenRating({
        agardenRoot,
        nodeId: "node-a",
        raterId: "melissa.hargis@challenger.gauntletai.com",
        score: 6,
      }),
    ).rejects.toThrow("score");
  });
});
