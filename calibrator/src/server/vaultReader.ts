import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import type {
  CalibratorCase,
  CalibratorComparisonSet,
  CalibratorIndex,
  CalibratorProblemRecovery,
  CalibratorRating,
  CalibratorSolution,
} from "../types";
import {
  CaseFrontmatter,
  ComparisonSetFrontmatter,
  KernelCaseRunFrontmatter,
  ProblemFrontmatter,
  ProblemRecoveryFrontmatter,
  RatingFrontmatter,
  SolutionFrontmatter,
} from "./vaultSchemas";
import { parseMarkdownSections } from "./sectionParser";

async function readMarkdown(path: string): Promise<{ data: Record<string, unknown>; content: string }> {
  const raw = await readFile(path, "utf8");
  return matter(raw) as { data: Record<string, unknown>; content: string };
}

async function readOptionalMarkdownNames(path: string): Promise<string[]> {
  try {
    return (await readdir(path)).filter((name) => name.endsWith(".md")).sort();
  } catch (err) {
    const code = err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return [];
    throw err;
  }
}

interface RatingMaps {
  bySolution: Map<string, CalibratorRating[]>;
  byProblemRecovery: Map<string, CalibratorRating[]>;
}

async function readSolutions(
  casePath: string,
  ratingsBySolution: Map<string, CalibratorRating[]>,
): Promise<CalibratorSolution[]> {
  const solutionsPath = join(casePath, "solutions");
  const names = await readOptionalMarkdownNames(solutionsPath);
  const solutions: CalibratorSolution[] = [];

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

async function readRatings(casePath: string): Promise<RatingMaps> {
  const ratingsPath = join(casePath, "ratings");
  const names = await readOptionalMarkdownNames(ratingsPath);

  const ratingsBySolution = new Map<string, CalibratorRating[]>();
  const ratingsByProblemRecovery = new Map<string, CalibratorRating[]>();
  for (const name of names) {
    const parsed = await readMarkdown(join(ratingsPath, name));
    const frontmatter = RatingFrontmatter.parse(parsed.data);
    const rating: CalibratorRating = {
      rating_id: frontmatter.rating_id,
      rating_target: frontmatter.rating_target,
      case_id: frontmatter.case_id,
      solution_id: frontmatter.solution_id,
      problem_recovery_id: frontmatter.problem_recovery_id,
      score: frontmatter.score,
      verdict: frontmatter.verdict,
      reviewer_email: frontmatter.reviewer_email,
      reviewer_name: frontmatter.reviewer_name,
      submitted_at: frontmatter.submitted_at,
      app_version: frontmatter.app_version,
      body: parsed.content.trim(),
    };
    if (rating.rating_target === "problem_recovery" && rating.problem_recovery_id) {
      const existing = ratingsByProblemRecovery.get(rating.problem_recovery_id) ?? [];
      existing.push(rating);
      ratingsByProblemRecovery.set(rating.problem_recovery_id, existing);
    }
    if (rating.rating_target === "solution" && rating.solution_id) {
      const existing = ratingsBySolution.get(rating.solution_id) ?? [];
      existing.push(rating);
      ratingsBySolution.set(rating.solution_id, existing);
    }
  }

  for (const ratings of [...ratingsBySolution.values(), ...ratingsByProblemRecovery.values()]) {
    ratings.sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  }

  return { bySolution: ratingsBySolution, byProblemRecovery: ratingsByProblemRecovery };
}

async function readProblemRecoveries(
  casePath: string,
  ratingsByProblemRecovery: Map<string, CalibratorRating[]>,
): Promise<CalibratorProblemRecovery[]> {
  const problemRecoveriesPath = join(casePath, "problem-recoveries");
  const names = await readOptionalMarkdownNames(problemRecoveriesPath);
  const problemRecoveries: CalibratorProblemRecovery[] = [];

  for (const name of names) {
    const parsed = await readMarkdown(join(problemRecoveriesPath, name));
    const frontmatter = ProblemRecoveryFrontmatter.parse(parsed.data);
    problemRecoveries.push({
      ...frontmatter,
      body: parsed.content.trim(),
      human_ratings: ratingsByProblemRecovery.get(frontmatter.problem_recovery_id) ?? [],
    });
  }

  return problemRecoveries;
}

async function readRunArtifacts(casePath: string, ratings: RatingMaps): Promise<{
  problemRecoveries: CalibratorProblemRecovery[];
  solutions: CalibratorSolution[];
}> {
  const runsPath = join(casePath, "runs");
  const names = await readOptionalMarkdownNames(runsPath);
  const problemRecoveries: CalibratorProblemRecovery[] = [];
  const solutions: CalibratorSolution[] = [];

  for (const name of names) {
    const parsed = await readMarkdown(join(runsPath, name));
    const frontmatter = KernelCaseRunFrontmatter.parse(parsed.data);
    const sections = parseMarkdownSections(parsed.content);
    const common = {
      case_id: frontmatter.case_id,
      source_type: frontmatter.source_type,
      source_status: frontmatter.source_status,
      source_branch: frontmatter.source_branch,
      source_commit: frontmatter.source_commit,
      source_mapping_version: frontmatter.source_mapping_version,
      adapter_version: frontmatter.adapter_version,
      adapter_notes: frontmatter.adapter_notes,
      kernel: frontmatter.kernel,
      branch: frontmatter.branch,
      run_id: frontmatter.run_id,
      run_artifact_id: frontmatter.run_artifact_id,
      created_at: frontmatter.created_at,
    };

    if (sections.problemRecovery) {
      const problemRecoveryId = `${frontmatter.run_artifact_id}__problem_recovery`;
      problemRecoveries.push({
        ...common,
        problem_recovery_id: problemRecoveryId,
        title: "Problem Recovery",
        trace: sections.trace,
        discovery: sections.discovery,
        case_study: sections.caseStudy,
        body: sections.problemRecovery,
        human_ratings: ratings.byProblemRecovery.get(problemRecoveryId) ?? [],
      });
    }

    if (sections.solution) {
      const solutionId = `${frontmatter.run_artifact_id}__solution`;
      solutions.push({
        ...common,
        solution_id: solutionId,
        title: "Solution",
        body: sections.solution,
        human_ratings: ratings.bySolution.get(solutionId) ?? [],
      });
    }
  }

  return { problemRecoveries, solutions };
}

async function readComparisonSets(vaultRoot: string): Promise<CalibratorComparisonSet[]> {
  const comparisonSetsPath = join(vaultRoot, "comparison-sets");
  let names: string[];
  try {
    names = (await readdir(comparisonSetsPath)).filter((name) => name.endsWith(".md")).sort();
  } catch (err) {
    const code = err instanceof Error && "code" in err ? (err as NodeJS.ErrnoException).code : undefined;
    if (code === "ENOENT") return [];
    throw err;
  }

  const comparisonSets: CalibratorComparisonSet[] = [];
  for (const name of names) {
    const parsed = await readMarkdown(join(comparisonSetsPath, name));
    const frontmatter = ComparisonSetFrontmatter.parse(parsed.data);
    comparisonSets.push({
      comparison_set_id: frontmatter.comparison_set_id,
      case_id: frontmatter.case_id,
      title: frontmatter.title,
      status: frontmatter.status,
      input_hash: frontmatter.input_hash,
      input_paths: frontmatter.input_paths,
      adapter_version: frontmatter.adapter_version,
      body: parsed.content.trim(),
    });
  }

  return comparisonSets;
}

export async function readVaultIndex(vaultRoot: string): Promise<CalibratorIndex> {
  const casesRoot = join(vaultRoot, "cases");
  const comparisonSets = await readComparisonSets(vaultRoot);
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
    const ratings = await readRatings(casePath);
    const fileProblemRecoveries = await readProblemRecoveries(casePath, ratings.byProblemRecovery);
    const fileSolutions = await readSolutions(casePath, ratings.bySolution);
    const runArtifacts = await readRunArtifacts(casePath, ratings);
    const problemRecoveries = [...fileProblemRecoveries, ...runArtifacts.problemRecoveries];
    const solutions = [...fileSolutions, ...runArtifacts.solutions];

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
      problem_recoveries: problemRecoveries,
      solutions,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    comparison_sets: comparisonSets,
    cases,
  };
}
