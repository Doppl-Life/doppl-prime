import { readFile, writeFile } from "node:fs/promises";
import matter from "gray-matter";
import { z } from "zod";

const AgardenHumanProjection = z.object({
  human: z.number().min(-5).max(10).nullable(),
  n: z.number().int().min(0),
});

export interface MaterializeAgardenProjectionInput {
  nodePath: string;
  projection: z.infer<typeof AgardenHumanProjection>;
}

export interface MaterializeAgardenProjectionResult {
  nodePath: string;
  scores: Record<string, unknown>;
}

export async function materializeAgardenProjection(
  input: MaterializeAgardenProjectionInput,
): Promise<MaterializeAgardenProjectionResult> {
  const projection = AgardenHumanProjection.parse(input.projection);
  const raw = await readFile(input.nodePath, "utf8");
  const parsed = matter(raw) as { data: Record<string, unknown>; content: string };
  const previousScores =
    parsed.data.scores && typeof parsed.data.scores === "object" && !Array.isArray(parsed.data.scores)
      ? (parsed.data.scores as Record<string, unknown>)
      : {};
  const scores = {
    ...previousScores,
    human: projection.human,
    n: projection.n,
  };
  parsed.data.scores = scores;

  await writeFile(input.nodePath, matter.stringify(parsed.content.trimStart(), parsed.data), "utf8");

  return {
    nodePath: input.nodePath,
    scores,
  };
}
