import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { materializeAgardenProjection } from "../src/server/agardenProjection";

describe("materializeAgardenProjection", () => {
  it("updates human score projection while preserving judge score and markdown body", async () => {
    const root = await mkdtemp(join(tmpdir(), "agarden-projection-"));
    const nodePath = join(root, "flow/node-a/node-a.md");
    await mkdir(join(root, "flow/node-a"), { recursive: true });
    const original = [
      "---",
      "id: node-a",
      "stage: problem_recovery",
      "kernel: prime",
      "scores: { judge: 2, human: null, n: 0 }",
      "doppelgangers: 0",
      "---",
      "",
      "# Node A",
      "",
      "## Growth",
      "",
      "The body must survive unchanged.",
      "",
    ].join("\n");
    await writeFile(nodePath, original, "utf8");

    const result = await materializeAgardenProjection({
      nodePath,
      projection: { human: 3.5, n: 2 },
    });

    const written = await readFile(nodePath, "utf8");
    const parsed = matter(written);
    expect(result).toMatchObject({
      nodePath,
      scores: { judge: 2, human: 3.5, n: 2 },
    });
    expect(parsed.data).toMatchObject({
      id: "node-a",
      stage: "problem_recovery",
      kernel: "prime",
      doppelgangers: 0,
      scores: { judge: 2, human: 3.5, n: 2 },
    });
    expect(parsed.content.trim()).toBe(
      ["# Node A", "", "## Growth", "", "The body must survive unchanged."].join("\n"),
    );
  });

  it("creates a scores object when a node has no previous scores", async () => {
    const root = await mkdtemp(join(tmpdir(), "agarden-projection-"));
    const nodePath = join(root, "node-b.md");
    await writeFile(
      nodePath,
      ["---", "id: node-b", "stage: doppl", "---", "", "# Node B", ""].join("\n"),
      "utf8",
    );

    await materializeAgardenProjection({
      nodePath,
      projection: { human: -1, n: 1 },
    });

    const parsed = matter(await readFile(nodePath, "utf8"));
    expect(parsed.data.scores).toEqual({ human: -1, n: 1 });
  });

  it("rejects invalid projection values", async () => {
    const root = await mkdtemp(join(tmpdir(), "agarden-projection-"));
    const nodePath = join(root, "node-c.md");
    await writeFile(
      nodePath,
      ["---", "id: node-c", "stage: doppl", "---", "", "# Node C", ""].join("\n"),
      "utf8",
    );

    await expect(
      materializeAgardenProjection({
        nodePath,
        projection: { human: 6, n: 1 },
      }),
    ).rejects.toThrow("human");
    await expect(
      materializeAgardenProjection({
        nodePath,
        projection: { human: 0, n: -1 },
      }),
    ).rejects.toThrow("n");
  });
});
