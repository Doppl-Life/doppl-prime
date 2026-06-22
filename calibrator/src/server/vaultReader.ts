import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import type { CalibratorCase, CalibratorIndex, CalibratorRating, CalibratorSolution } from "../types";
import { CaseFrontmatter, ProblemFrontmatter, RatingFrontmatter, SolutionFrontmatter } from "./vaultSchemas";

async function readMarkdown(path: string): Promise<{ data: Record<string, unknown>; content: string }> {
  const raw = await readFile(path, "utf8");
  return matter(raw) as { data: Record<string, unknown>; content: string };
}

async function readSolutions(casePath: string): Promise<CalibratorSolution[]> {
  const solutionsPath = join(casePath, "solutions");
  const names = (await readdir(solutionsPath)).filter((name) => name.endsWith(".md")).sort();
  const solutions: CalibratorSolution[] = [];
  const ratingsBySolution = await readRatingsBySolution(casePath);

  for (const name of names) {
    const parsed = await readMarkdown(join(solutionsPath, name));
    const frontmatter = SolutionFrontmatter.parse(parsed.data);
    solutions.push({
      ...frontmatter,
      body: parsed.content.trim(),
      human_ratings: ratingsBySolution.get(frontmatter.solution_id) ?? [],
    });
  }

  return solutions;
}

async function readRatingsBySolution(casePath: string): Promise<Map<string, CalibratorRating[]>> {
  const ratingsPath = join(casePath, "ratings");
  let names: string[];
  try {
    names = (await readdir(ratingsPath)).filter((name) => name.endsWith(".md")).sort();
  } catch (err) {
    const code = err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return new Map();
    throw err;
  }

  const ratingsBySolution = new Map<string, CalibratorRating[]>();
  for (const name of names) {
    const parsed = await readMarkdown(join(ratingsPath, name));
    const frontmatter = RatingFrontmatter.parse(parsed.data);
    const rating: CalibratorRating = {
      rating_id: frontmatter.rating_id,
      rating_target: frontmatter.rating_target,
      case_id: frontmatter.case_id,
      solution_id: frontmatter.solution_id,
      score: frontmatter.score,
      verdict: frontmatter.verdict,
      reviewer_email: frontmatter.reviewer_email,
      reviewer_name: frontmatter.reviewer_name,
      submitted_at: frontmatter.submitted_at,
      app_version: frontmatter.app_version,
      body: parsed.content.trim(),
    };
    const existing = ratingsBySolution.get(rating.solution_id) ?? [];
    existing.push(rating);
    ratingsBySolution.set(rating.solution_id, existing);
  }

  for (const ratings of ratingsBySolution.values()) {
    ratings.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  }

  return ratingsBySolution;
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
