import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import type { CalibratorCase, CalibratorIndex, CalibratorSolution } from "../types";
import { CaseFrontmatter, ProblemFrontmatter, SolutionFrontmatter } from "./vaultSchemas";

async function readMarkdown(path: string): Promise<{ data: Record<string, unknown>; content: string }> {
  const raw = await readFile(path, "utf8");
  return matter(raw) as { data: Record<string, unknown>; content: string };
}

async function readSolutions(casePath: string): Promise<CalibratorSolution[]> {
  const solutionsPath = join(casePath, "solutions");
  const names = (await readdir(solutionsPath)).filter((name) => name.endsWith(".md")).sort();
  const solutions: CalibratorSolution[] = [];

  for (const name of names) {
    const parsed = await readMarkdown(join(solutionsPath, name));
    const frontmatter = SolutionFrontmatter.parse(parsed.data);
    solutions.push({
      ...frontmatter,
      body: parsed.content.trim(),
    });
  }

  return solutions;
}

export async function readVaultIndex(vaultRoot: string): Promise<CalibratorIndex> {
  const casesRoot = join(vaultRoot, "cases");
  const names = (await readdir(casesRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const cases: CalibratorCase[] = [];
  for (const caseId of names) {
    const casePath = join(casesRoot, caseId);
    const caseMarkdown = await readMarkdown(join(casePath, "case.md"));
    const caseFrontmatter = CaseFrontmatter.parse(caseMarkdown.data);
    const problemMarkdown = await readMarkdown(join(casePath, "problem.md"));
    const problemFrontmatter = ProblemFrontmatter.parse(problemMarkdown.data);
    const solutions = await readSolutions(casePath);

    cases.push({
      case_id: caseFrontmatter.case_id,
      title: caseFrontmatter.title,
      visibility: caseFrontmatter.visibility,
      source_paths: caseFrontmatter.source_paths,
      body: caseMarkdown.content.trim(),
      problem: {
        body: problemMarkdown.content.trim(),
        source: problemFrontmatter.source,
      },
      solutions,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    cases,
  };
}
