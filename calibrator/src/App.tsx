import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CalibratorIndex,
  CalibratorRating,
  CalibratorProblemRecovery,
  CalibratorSolution,
  RatingSubmitResponse,
} from "./types";
import {
  canSubmitRating,
  reviewMode,
  type ReviewArtifact,
} from "./reviewability";
import { ALLOWED_RATERS, isAllowedRater, normalizeRaterEmail } from "./raters";
import { readGitHubAgardenIndex, type GitHubAgardenIndexConfig } from "./githubAgardenIndex";

type RatingTarget = "problem_recovery" | "solution";
const REVIEWER_STORAGE_KEY = "doppl-calibrator-reviewer-email";
const ACCESS_CODE_STORAGE_KEY = "doppl-calibrator-access-code";
const LOCAL_RATINGS_ENDPOINT = "/api/ratings";
type ReviewQueueItem =
  | { target: "problem_recovery"; id: string; artifact: CalibratorProblemRecovery }
  | { target: "solution"; id: string; artifact: CalibratorSolution };

const JUDGE_EVALUATION_RATERS = new Set([
  "dalton.dinderman@challenger.gauntletai.com",
  "cody.clayton@challenger.gauntletai.com",
  "melissa.hargis@challenger.gauntletai.com",
  "michael.habermas@challenger.gauntletai.com",
]);

declare global {
  interface Window {
    DOPPL_CALIBRATOR_CONFIG?: {
      ratingsEndpoint?: string;
      ratingsLedgerUrl?: string;
      requiresAccessCode?: boolean;
      agardenOwner?: string;
      agardenRepo?: string;
      agardenBranch?: string;
      agardenSource?: "github" | "jsdelivr";
      agardenApiBaseUrl?: string;
      agardenRawBaseUrl?: string;
      agardenCdnBaseUrl?: string;
      agardenPackageApiBaseUrl?: string;
    };
  }
}

interface AgardenLedgerRating {
  rater_id: string;
  score: number;
  rate_date: string;
}

interface AgardenLedgerEntry {
  node_id: string;
  ratings: AgardenLedgerRating[];
}

function scoreLabel(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function ratingReviewerEmail(rating: CalibratorRating): string {
  return normalizeRaterEmail(rating.reviewer_email ?? rating.reviewer_name ?? "");
}

function reviewerRating(artifact: ReviewArtifact | null, reviewerEmail: string): CalibratorRating | null {
  const normalizedReviewer = normalizeRaterEmail(reviewerEmail);
  if (!artifact || !normalizedReviewer) return null;
  return artifact.human_ratings.find((rating) => ratingReviewerEmail(rating) === normalizedReviewer) ?? null;
}

function ratingFromLedger(
  caseId: string,
  nodeId: string,
  target: RatingTarget,
  rating: AgardenLedgerRating,
): CalibratorRating {
  return {
    rating_id: `rating_${nodeId}_${rating.rater_id.replace(/[^a-z0-9_-]+/gi, "_").replace(/_+$/g, "")}`,
    rating_target: target,
    case_id: caseId,
    problem_recovery_id: target === "problem_recovery" ? nodeId : undefined,
    solution_id: target === "solution" ? nodeId : undefined,
    score: rating.score,
    reviewer_email: rating.rater_id,
    submitted_at: rating.rate_date,
    app_version: "calibrator-v0",
    body: "",
  };
}

function scoresFromRatings(
  previousScores: ReviewArtifact["scores"],
  ratings: CalibratorRating[],
): ReviewArtifact["scores"] {
  if (ratings.length === 0) return previousScores;
  const human = ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length;
  return { ...(previousScores ?? {}), human, n: ratings.length };
}

function applyRatingsLedger(index: CalibratorIndex, ledger: AgardenLedgerEntry[]): CalibratorIndex {
  const byNode = new Map(ledger.map((entry) => [entry.node_id, entry]));
  return {
    ...index,
    cases: index.cases.map((caseItem) => ({
      ...caseItem,
      problem_recoveries: caseItem.problem_recoveries.map((artifact) => {
        const nodeId = artifact.node_id ?? artifact.problem_recovery_id;
        const entry = byNode.get(nodeId);
        if (!entry) return artifact;
        const human_ratings = entry.ratings.map((rating) =>
          ratingFromLedger(caseItem.case_id, nodeId, "problem_recovery", rating),
        );
        return { ...artifact, human_ratings, scores: scoresFromRatings(artifact.scores, human_ratings) };
      }),
      solutions: caseItem.solutions.map((artifact) => {
        const nodeId = artifact.node_id ?? artifact.solution_id;
        const entry = byNode.get(nodeId);
        if (!entry) return artifact;
        const human_ratings = entry.ratings.map((rating) =>
          ratingFromLedger(caseItem.case_id, nodeId, "solution", rating),
        );
        return { ...artifact, human_ratings, scores: scoresFromRatings(artifact.scores, human_ratings) };
      }),
    })),
  };
}

function upsertRating(ratings: CalibratorRating[], nextRating: CalibratorRating): CalibratorRating[] {
  const reviewer = ratingReviewerEmail(nextRating);
  const withoutPrevious = ratings.filter((rating) => ratingReviewerEmail(rating) !== reviewer);
  return [...withoutPrevious, nextRating];
}

function applySubmittedRating(input: {
  index: CalibratorIndex;
  caseId: string;
  target: RatingTarget;
  nodeId: string;
  score: number;
  reviewerEmail: string;
  submittedAt: string;
}): CalibratorIndex {
  const nextRating = ratingFromLedger(input.caseId, input.nodeId, input.target, {
    rater_id: normalizeRaterEmail(input.reviewerEmail),
    score: input.score,
    rate_date: input.submittedAt,
  });
  return {
    ...input.index,
    cases: input.index.cases.map((caseItem) => {
      if (caseItem.case_id !== input.caseId) return caseItem;
      return {
        ...caseItem,
        problem_recoveries: caseItem.problem_recoveries.map((artifact) => {
          const nodeId = artifact.node_id ?? artifact.problem_recovery_id;
          if (input.target !== "problem_recovery" || nodeId !== input.nodeId) return artifact;
          const human_ratings = upsertRating(artifact.human_ratings, nextRating);
          return { ...artifact, human_ratings, scores: scoresFromRatings(artifact.scores, human_ratings) };
        }),
        solutions: caseItem.solutions.map((artifact) => {
          const nodeId = artifact.node_id ?? artifact.solution_id;
          if (input.target !== "solution" || nodeId !== input.nodeId) return artifact;
          const human_ratings = upsertRating(artifact.human_ratings, nextRating);
          return { ...artifact, human_ratings, scores: scoresFromRatings(artifact.scores, human_ratings) };
        }),
      };
    }),
  };
}

function firstRateableProblemRecovery(caseItem: CalibratorIndex["cases"][number]) {
  return caseItem.problem_recoveries.find((artifact) => reviewMode(artifact) === "primary");
}

function firstRateableSolution(caseItem: CalibratorIndex["cases"][number]) {
  return caseItem.solutions.find((artifact) => reviewMode(artifact) === "primary");
}

function problemRecoveryNodeKey(recovery: CalibratorProblemRecovery): string[] {
  return [recovery.node_id, recovery.problem_recovery_id].filter(Boolean) as string[];
}

function findParentProblemRecovery(
  solution: CalibratorSolution | null,
  recoveries: CalibratorProblemRecovery[],
): CalibratorProblemRecovery | null {
  if (!solution) return null;
  const parentIds = new Set(solution.parent_ids ?? []);
  if (parentIds.size > 0) {
    const parent = recoveries.find((recovery) =>
      problemRecoveryNodeKey(recovery).some((key) => parentIds.has(key)),
    );
    if (parent) return parent;
  }
  return recoveries.find((recovery) => reviewMode(recovery) === "primary") ?? recoveries[0] ?? null;
}

function hasRateableArtifacts(caseItem: CalibratorIndex["cases"][number]) {
  return Boolean(firstRateableProblemRecovery(caseItem) || firstRateableSolution(caseItem));
}

function firstReviewableCase(index: CalibratorIndex) {
  return index.cases.find(hasRateableArtifacts);
}

function reviewQueueForCase(caseItem: CalibratorIndex["cases"][number] | null): ReviewQueueItem[] {
  if (!caseItem) return [];
  const problemRecoveryItems: ReviewQueueItem[] = caseItem.problem_recoveries
    .filter((artifact) => reviewMode(artifact) === "primary")
    .map((artifact) => ({
      target: "problem_recovery",
      id: artifact.problem_recovery_id,
      artifact,
    }));
  const solutionItems: ReviewQueueItem[] = caseItem.solutions
    .filter((artifact) => reviewMode(artifact) === "primary")
    .map((artifact) => ({
      target: "solution",
      id: artifact.solution_id,
      artifact,
    }));
  return [...problemRecoveryItems, ...solutionItems];
}

function findNextUnratedItem(
  queue: ReviewQueueItem[],
  currentTarget: RatingTarget,
  currentId: string,
  reviewerEmail: string,
): ReviewQueueItem | null {
  if (queue.length === 0 || !reviewerEmail) return null;
  const currentIndex = queue.findIndex((item) => item.target === currentTarget && item.id === currentId);
  const start = currentIndex >= 0 ? currentIndex + 1 : 0;
  for (let offset = 0; offset < queue.length; offset += 1) {
    const candidate = queue[(start + offset) % queue.length];
    if (candidate.target === currentTarget && candidate.id === currentId) continue;
    if (!reviewerRating(candidate.artifact, reviewerEmail)) return candidate;
  }
  return null;
}

function canSeeJudgeEvaluation(reviewerEmail: string): boolean {
  return JUDGE_EVALUATION_RATERS.has(normalizeRaterEmail(reviewerEmail));
}

function matchingRaters(query: string): string[] {
  const normalized = normalizeRaterEmail(query);
  if (!normalized) return [];
  return ALLOWED_RATERS.filter((rater) => rater.includes(normalized)).slice(0, 8);
}

function displayMarkdown(text: string): string {
  const normalized = text
    .replace(/<span\s+class=["']arrow["']\s*-?>/gi, " -> ")
    .replace(/<\/span>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+->\s+/g, " -> ")
    .replace(
      /(^|\n)(TRACE|DISCOVERY|EVALUATION|PATH NEXT|GROWTH\s*[—-]\s*(?:PROBLEM RECOVERY|DOPPL))[ \t]+(#{2,4}[ \t]+)/gim,
      "$1## $2\n\n$3",
    )
    .replace(/\s+(#{2,4}\s+)/g, "\n\n$1")
    .replace(/^(TRACE|DISCOVERY|EVALUATION|PATH NEXT|GROWTH\s*[—-]\s*(?:PROBLEM RECOVERY|DOPPL))[ \t]*$/gim, "## $1")
    .replace(/\n{3,}/g, "\n\n");
  const lines = normalized.split("\n").filter((line) => !/^prev(_id)?:\s*/.test(line.trim()));
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex >= 0 && /^#\s+/.test(lines[firstContentIndex])) {
    lines.splice(firstContentIndex, 1);
  }
  return lines.join("\n").trim();
}

function splitEvaluationMarkdown(text: string): { main: string; evaluation: string } {
  const normalized = displayMarkdown(text);
  const headingMatch = normalized.match(/\n#{2,4}\s+Evaluation\s*\n/i);
  if (headingMatch?.index !== undefined) {
    const main = normalized.slice(0, headingMatch.index).trim();
    const evaluation = normalized.slice(headingMatch.index + headingMatch[0].length).trim();
    return { main, evaluation };
  }

  const lines = normalized.split("\n");
  const plainEvaluationIndex = lines.findIndex((line) => /^Evaluation$/i.test(line.trim()));
  if (plainEvaluationIndex >= 0) {
    return {
      main: lines.slice(0, plainEvaluationIndex).join("\n").trim(),
      evaluation: lines.slice(plainEvaluationIndex + 1).join("\n").trim(),
    };
  }

  const inlineEvaluationMatch = normalized.match(
    /(^|\n|\s)Evaluation\s+(?=(Novelty|Grounding|Falsifiability|Cost-Efficiency|Cost Efficiency|Relevance|Judge-only axis)\b)/i,
  );
  if (inlineEvaluationMatch?.index !== undefined) {
    const offset = inlineEvaluationMatch[0].search(/Evaluation/i);
    const splitAt = inlineEvaluationMatch.index + Math.max(offset, 0);
    return {
      main: normalized.slice(0, splitAt).trim(),
      evaluation: normalized.slice(splitAt + "Evaluation".length).trim(),
    };
  }

  const start = lines.findIndex((line) =>
    /^(Novelty|Grounding|Falsifiability|Cost-Efficiency|Cost Efficiency|Relevance)\s+[+-]?\d/i.test(line.trim()),
  );
  if (start < 0) return { main: normalized, evaluation: "" };

  let firstJudgeOnly = -1;
  for (let index = 0; index < start; index += 1) {
    if (/judge-only axis/i.test(lines[index])) firstJudgeOnly = index;
  }
  const splitAt = firstJudgeOnly >= 0 ? firstJudgeOnly : start;
  return {
    main: lines.slice(0, splitAt).join("\n").trim(),
    evaluation: lines.slice(splitAt).join("\n").trim(),
  };
}

function splitArtifactMarkdown(text: string): {
  trace: string;
  discovery: string;
  body: string;
  evaluation: string;
} {
  const { main, evaluation } = splitEvaluationMarkdown(text);
  const lines = main.split("\n");
  const buckets = {
    trace: [] as string[],
    discovery: [] as string[],
    body: [] as string[],
  };
  let current: keyof typeof buckets = "body";

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = trimmed.match(/^#{1,4}\s+(.+)$/);
    const headingText = heading?.[1] ?? trimmed;
    if (/^trace\b/i.test(headingText)) {
      current = "trace";
      continue;
    }
    if (/^discovery\b/i.test(headingText)) {
      current = "discovery";
      continue;
    }
    if (/^growth\s*[—-]\s*(problem recovery|doppl)\b/i.test(headingText)) {
      current = "body";
      continue;
    }
    buckets[current].push(line);
  }

  return {
    trace: buckets.trace.join("\n").trim(),
    discovery: buckets.discovery.join("\n").trim(),
    body: buckets.body.join("\n").trim(),
    evaluation,
  };
}

function cleanHeading(text: string): string {
  const cleaned = text
    .replace(/^#{1,6}\s*/, "")
    .replace(/<[^>]+>/g, "")
    .replace(/#{1,6}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s·/—-])([a-z])/g, (_match, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`)
    .replace(/\bcase study\b/gi, "Case study")
    .replace(/\bsynopsis\b/gi, "Synopsis")
    .replace(/\bfinding\b/gi, "Finding")
    .replace(/\bai\b/gi, "AI")
    .replace(/\bxai\b/gi, "XAI")
    .replace(/\bftc\b/gi, "FTC")
    .replace(/\becb\b/gi, "ECB")
    .replace(/\bcsail\b/gi, "CSAIL")
    .replace(/\bproblem recovery\b/gi, "Problem recovery")
    .replace(/\bdoppl\b/gi, "Doppl");
  return cleaned;
}

function renderInlineText(text: string): string {
  return text
    .replace(/<span\s+class=["']arrow["']\s*-?>/gi, " -> ")
    .replace(/<\/span>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceCaseHeading(value: string): string {
  return renderInlineText(value)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[A-Za-z][A-Za-z0-9]*/g, (word) => {
      if (/^(AI|API|AV|EV|FICO|OEM|RUC|XAI|FTC|ECB|CSAIL|NHTSA|MIT)$/i.test(word)) return word.toUpperCase();
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    });
}

function comparableText(text: string): string {
  return renderInlineText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function markdownBlocks(text: string): string[] {
  return displayMarkdown(text)
    .split(/\n{2,}/)
    .flatMap((block) => block.replace(/\s+(#{2,4}\s+)/g, "\n\n$1").split(/\n{2,}/))
    .map((block) => block.trim())
    .filter(Boolean);
}

function generatedListItems(text: string): string[] {
  const normalized = renderInlineText(text).replace(/^\s*[-–]\s+/, "");
  return normalized
    .split(/\s+[-–]\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function labeledBlock(block: string):
  | { label: string; items: string[]; list: true }
  | { label: string; body: string; list: false }
  | null {
  const labels = [
    "Implications",
    "Opportunities",
    "Sprouts",
    "Skin in the Game",
    "Claim",
    "Surface complaint",
    "Deleted assumption",
    "Hidden variable",
    "Actual problem",
    "Candidate response",
  ];
  for (const label of labels) {
    const pattern = new RegExp(`^${label.replace(/\s+/g, "\\s+")}(?:\\s*[-:]\\s*|\\s+)([\\s\\S]+)$`, "i");
    const match = block.match(pattern);
    if (!match) continue;
    const body = renderInlineText(match[1]);
    const parts = generatedListItems(body);
    if (
      ["Implications", "Opportunities", "Sprouts", "Skin in the Game"].includes(label) &&
      (parts.length > 1 || /^\s*[-–]\s+/.test(body))
    ) {
      return { label, items: parts, list: true };
    }
    return { label, body, list: false };
  }
  return null;
}

function supplementalMarkdown(baseText: string, candidateText: string): string {
  const baseBlocks = new Set(markdownBlocks(baseText).map(comparableText).filter(Boolean));
  const uniqueBlocks = markdownBlocks(candidateText).filter((block) => {
    const comparable = comparableText(block);
    return comparable && !baseBlocks.has(comparable);
  });
  return uniqueBlocks.join("\n\n");
}

function MarkdownBlock({ text }: { text: string }) {
  const blocks = markdownBlocks(text);
  const renderedBlocks = [];
  const listLabels = new Set(["Implications", "Opportunities", "Sprouts", "Skin in the Game"]);
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const heading = block.match(/^#{2,4}\s+(.+)$/);
    const label = heading ? cleanHeading(heading[1]) : "";
    const nextBlock = blocks[index + 1] ?? "";
    if (listLabels.has(label) && nextBlock && generatedListItems(nextBlock).length > 1) {
      renderedBlocks.push(
        <section className="generated-list" key={`${block}-${nextBlock}`.slice(0, 120)}>
          <h5>{label}:</h5>
          <ul>
            {generatedListItems(nextBlock).map((item) => (
              <li key={item}>{sentenceCaseHeading(item)}</li>
            ))}
          </ul>
        </section>,
      );
      index += 1;
      continue;
    }

    const key = block.slice(0, 80);
    const labeled = labeledBlock(block);
    if (labeled?.list) {
      renderedBlocks.push(
        <section className="generated-list" key={key}>
          <h5>{labeled.label}:</h5>
          <ul>
            {labeled.items.map((item) => (
              <li key={item}>{sentenceCaseHeading(item)}</li>
            ))}
          </ul>
        </section>,
      );
      continue;
    }
    if (labeled) {
      renderedBlocks.push(
        <section className="generated-field" key={key}>
          <h5>{labeled.label}:</h5>
          <p>{renderInlineText(labeled.body)}</p>
        </section>,
      );
      continue;
    }
    if (block.startsWith("# ")) {
      renderedBlocks.push(<h3 key={key}>{cleanHeading(block)}</h3>);
      continue;
    }
    if (block.startsWith("## ")) {
      renderedBlocks.push(<h4 key={key}>{cleanHeading(block)}</h4>);
      continue;
    }
    if (block.startsWith("### ") || block.startsWith("#### ")) {
      renderedBlocks.push(<h5 key={key}>{cleanHeading(block)}</h5>);
      continue;
    }
    if (/^\d+\.\s/m.test(block)) {
      renderedBlocks.push(
        <ol key={key}>
          {block.split("\n").map((line) => (
            <li key={line}>{renderInlineText(line.replace(/^\d+\.\s*/, ""))}</li>
          ))}
        </ol>,
      );
      continue;
    }
    renderedBlocks.push(<p key={key}>{renderInlineText(block)}</p>);
  }

  return (
    <div className="markdown-block">
      {renderedBlocks}
    </div>
  );
}

function ArtifactMarkdownBlock({
  artifactKey,
  text,
  showEvaluation,
}: {
  artifactKey: string;
  text: string;
  showEvaluation: boolean;
}) {
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const { trace, discovery, body, evaluation } = splitArtifactMarkdown(text);

  useEffect(() => {
    setEvaluationOpen(false);
    setTraceOpen(false);
    setDiscoveryOpen(false);
  }, [artifactKey]);

  return (
    <>
      {trace ? (
        <section className="artifact-disclosure">
          <button type="button" aria-expanded={traceOpen} onClick={() => setTraceOpen((open) => !open)}>
            <span>Trace</span>
            <span aria-hidden="true">{traceOpen ? "-" : "+"}</span>
          </button>
          {traceOpen ? <MarkdownBlock text={trace} /> : null}
        </section>
      ) : null}
      {discovery ? (
        <section className="artifact-disclosure">
          <button type="button" aria-expanded={discoveryOpen} onClick={() => setDiscoveryOpen((open) => !open)}>
            <span>Discovery</span>
            <span aria-hidden="true">{discoveryOpen ? "-" : "+"}</span>
          </button>
          {discoveryOpen ? <MarkdownBlock text={discovery} /> : null}
        </section>
      ) : null}
      <MarkdownBlock text={body} />
      {showEvaluation && evaluation ? (
        <section className="evaluation-disclosure">
          <button type="button" aria-expanded={evaluationOpen} onClick={() => setEvaluationOpen((open) => !open)}>
            <span>Judge evaluation</span>
            <span aria-hidden="true">{evaluationOpen ? "-" : "+"}</span>
          </button>
          {evaluationOpen ? <MarkdownBlock text={evaluation} /> : null}
        </section>
      ) : null}
    </>
  );
}

interface CaseSection {
  key: string;
  title: string;
  body: string;
}

function caseSections(text: string): CaseSection[] {
  const normalized = displayMarkdown(text);
  const lines = normalized.split("\n");
  const sections: CaseSection[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  function pushCurrent() {
    const body = currentLines.join("\n").trim();
    if (currentTitle && body) {
      sections.push({
        key: `${sections.length}-${comparableText(currentTitle)}`,
        title: cleanHeading(currentTitle),
        body,
      });
    }
  }

  for (const line of lines) {
    const heading = line.match(/^#{2,4}\s+(.+)$/);
    if (heading) {
      pushCurrent();
      currentTitle = heading[1];
      currentLines = [];
    } else if (currentTitle) {
      currentLines.push(line);
    }
  }
  pushCurrent();

  return sections;
}

function CaseStudyBlock({
  text,
  openSections,
  onToggleSection,
}: {
  text: string;
  openSections: Set<string>;
  onToggleSection(sectionKey: string): void;
}) {
  const sections = caseSections(text);
  if (sections.length === 0) return <MarkdownBlock text={text} />;

  return (
    <div className="case-section-list">
      {sections.map((section) => {
        const isOpen = openSections.has(section.key);
        return (
          <section className="case-section" key={section.key}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => onToggleSection(section.key)}
            >
              <span>{section.title}</span>
              <span aria-hidden="true">{isOpen ? "-" : "+"}</span>
            </button>
            {isOpen ? <MarkdownBlock text={section.body} /> : null}
          </section>
        );
      })}
    </div>
  );
}

function KernelMeta({ artifact }: { artifact: ReviewArtifact }) {
  const fields = [
    ["source status", artifact.source_status],
    ["comparison", "comparison_set_id" in artifact ? artifact.comparison_set_id : undefined],
    ["input hash", "comparison_input_hash" in artifact ? artifact.comparison_input_hash : undefined],
    ["source mapping", artifact.source_mapping_version ?? artifact.adapter_version],
    ["kernel", artifact.kernel],
    ["class", "output_class" in artifact ? artifact.output_class : undefined],
    ["phase", "phase" in artifact ? artifact.phase : undefined],
    ["subtype", "subtype" in artifact ? artifact.subtype : undefined],
    ["branch", artifact.source_branch ?? artifact.branch],
    ["commit", artifact.source_commit],
    ["run", artifact.run_id],
    ["run artifact", "run_artifact_id" in artifact ? artifact.run_artifact_id : undefined],
    ["generation", "generation_id" in artifact ? artifact.generation_id : undefined],
    ["agenome", "agenome_id" in artifact ? artifact.agenome_id : undefined],
    ["candidate", "candidate_id" in artifact ? artifact.candidate_id : undefined],
    ["judge", "judge_score" in artifact ? artifact.judge_score?.toString() : undefined],
    ["fitness", "fitness_score" in artifact ? artifact.fitness_score?.toString() : undefined],
  ].filter(([, value]) => value);

  return (
    <dl className="meta-grid">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function artifactTitle(artifact: ReviewArtifact | null): string {
  if (!artifact) return "No artifact selected";
  return artifact.title;
}

function hostedRatingsEndpoint(): string {
  return window.DOPPL_CALIBRATOR_CONFIG?.ratingsEndpoint?.trim() ?? "";
}

function hostedRatingsLedgerUrl(): string {
  return window.DOPPL_CALIBRATOR_CONFIG?.ratingsLedgerUrl?.trim() ?? "";
}

function hostedAgardenConfig(): GitHubAgardenIndexConfig | null {
  const config = window.DOPPL_CALIBRATOR_CONFIG;
  const owner = config?.agardenOwner?.trim();
  const repo = config?.agardenRepo?.trim();
  if (!owner || !repo) return null;
  return {
    owner,
    repo,
    branch: config?.agardenBranch?.trim() || "main",
    source: config?.agardenSource === "jsdelivr" ? "jsdelivr" : "github",
    apiBaseUrl: config?.agardenApiBaseUrl?.trim() || undefined,
    rawBaseUrl: config?.agardenRawBaseUrl?.trim() || undefined,
    cdnBaseUrl: config?.agardenCdnBaseUrl?.trim() || undefined,
    packageApiBaseUrl: config?.agardenPackageApiBaseUrl?.trim() || undefined,
  };
}

function hostedEndpointRequiresAccessCode(endpoint: string): boolean {
  if (!endpoint || endpoint === LOCAL_RATINGS_ENDPOINT) return false;
  return window.DOPPL_CALIBRATOR_CONFIG?.requiresAccessCode ?? true;
}

export function App() {
  const [index, setIndex] = useState<CalibratorIndex | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState("fsd-accident-economy");
  const [selectedProblemRecoveryId, setSelectedProblemRecoveryId] = useState<string | null>(null);
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(null);
  const [ratingTarget, setRatingTarget] = useState<RatingTarget>("solution");
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [reviewerEmail, setReviewerEmail] = useState(() => {
    try {
      return window.localStorage.getItem(REVIEWER_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [accessCode, setAccessCode] = useState(() => {
    try {
      return window.sessionStorage.getItem(ACCESS_CODE_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [savedPath, setSavedPath] = useState("");
  const [error, setError] = useState("");
  const [isWritable, setIsWritable] = useState(false);
  const [ratingsEndpoint, setRatingsEndpoint] = useState("");
  const requiresAccessCode = hostedEndpointRequiresAccessCode(ratingsEndpoint);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastScoreArtifactKey = useRef("");
  const lastScoreReviewer = useRef("");
  const lastScoreWasHydrated = useRef(false);

  async function mergeHostedRatingsLedger(data: CalibratorIndex): Promise<CalibratorIndex> {
    const ledgerUrl = hostedRatingsLedgerUrl();
    if (!ledgerUrl) return data;
    try {
      const response = await fetch(`${ledgerUrl}${ledgerUrl.includes("?") ? "&" : "?"}v=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) return data;
      const ledger = (await response.json()) as AgardenLedgerEntry[];
      if (!Array.isArray(ledger)) return data;
      return applyRatingsLedger(data, ledger);
    } catch {
      return data;
    }
  }

  async function loadIndex() {
    try {
      const apiResponse = await fetch("/api/index", { cache: "no-store" });
      if (apiResponse.ok) {
        setIsWritable(true);
        setRatingsEndpoint(LOCAL_RATINGS_ENDPOINT);
        return mergeHostedRatingsLedger((await apiResponse.json()) as CalibratorIndex);
      }
    } catch {
      // Static previews do not expose the local Vite write API.
    }

    const hostedEndpoint = hostedRatingsEndpoint();
    setIsWritable(Boolean(hostedEndpoint));
    setRatingsEndpoint(hostedEndpoint);

    const githubConfig = hostedAgardenConfig();
    if (githubConfig) {
      try {
        return mergeHostedRatingsLedger(await readGitHubAgardenIndex(githubConfig));
      } catch (err) {
        console.warn("Falling back to static calibration index after GitHub aGarden read failed.", err);
      }
    }

    const staticResponse = await fetch(`calibration-index.json?v=${Date.now()}`, { cache: "no-store" });
    if (!staticResponse.ok) throw new Error("Failed to load vault index");
    return mergeHostedRatingsLedger((await staticResponse.json()) as CalibratorIndex);
  }

  useEffect(() => {
    loadIndex()
      .then((data) => {
        setIndex(data);
        const firstCase = firstReviewableCase(data);
        if (firstCase) {
          const firstPrimaryProblemRecovery = firstRateableProblemRecovery(firstCase);
          const firstPrimarySolution = firstRateableSolution(firstCase);
          setSelectedCaseId(firstCase.case_id);
          setSelectedProblemRecoveryId(firstPrimaryProblemRecovery?.problem_recovery_id ?? null);
          setSelectedSolutionId(firstPrimarySolution?.solution_id ?? null);
          setRatingTarget(firstPrimaryProblemRecovery ? "problem_recovery" : "solution");
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load vault index");
      });
  }, []);

  const selectedCase = useMemo(
    () => index?.cases.filter(hasRateableArtifacts).find((caseItem) => caseItem.case_id === selectedCaseId) ?? null,
    [index, selectedCaseId],
  );
  const reviewableCases = useMemo(() => index?.cases.filter(hasRateableArtifacts) ?? [], [index]);
  const allProblemRecoveries = useMemo(() => selectedCase?.problem_recoveries ?? [], [selectedCase]);
  const allSolutions = useMemo(() => selectedCase?.solutions ?? [], [selectedCase]);
  const visibleSolutions = useMemo(() => {
    if (!selectedCase) return [];
    return allSolutions.filter((artifact) => reviewMode(artifact) === "primary");
  }, [allSolutions, selectedCase]);
  const selectedSolution = useMemo(
    () =>
      visibleSolutions.find((solution) => solution.solution_id === selectedSolutionId) ??
      visibleSolutions[0] ??
      null,
    [visibleSolutions, selectedSolutionId],
  );
  const visibleProblemRecoveries = useMemo(() => {
    if (!selectedCase) return [];
    return allProblemRecoveries.filter((artifact) => reviewMode(artifact) === "primary");
  }, [allProblemRecoveries, selectedCase]);
  const selectedProblemRecovery = useMemo(
    () =>
      visibleProblemRecoveries.find((recovery) => recovery.problem_recovery_id === selectedProblemRecoveryId) ??
      visibleProblemRecoveries[0] ??
      null,
    [visibleProblemRecoveries, selectedProblemRecoveryId],
  );
  const reviewQueue = useMemo<ReviewQueueItem[]>(() => {
    return reviewQueueForCase(selectedCase);
  }, [selectedCase]);
  const activeReviewArtifact =
    ratingTarget === "problem_recovery" ? selectedProblemRecovery : selectedSolution;
  const activeTitle = artifactTitle(activeReviewArtifact);
  const activeIsSubmittable = canSubmitRating(activeReviewArtifact);
  const normalizedReviewerEmail = normalizeRaterEmail(reviewerEmail);
  const reviewerIsAllowed = isAllowedRater(reviewerEmail);
  const loginMatches = useMemo(() => matchingRaters(loginEmail), [loginEmail]);
  const activeReviewerRating = reviewerRating(activeReviewArtifact, normalizedReviewerEmail);
  const activeArtifactValue =
    ratingTarget === "problem_recovery"
      ? selectedProblemRecovery?.problem_recovery_id ?? ""
      : selectedSolution?.solution_id ?? "";
  const selectedComparisonSet = useMemo(() => {
    const comparisonSetId = selectedSolution?.comparison_set_id;
    if (!comparisonSetId) return null;
    return (index?.comparison_sets ?? []).find((set) => set.comparison_set_id === comparisonSetId) ?? null;
  }, [index?.comparison_sets, selectedSolution?.comparison_set_id]);

  useEffect(() => {
    if (!selectedCase) return;

    const nextProblemRecovery = visibleProblemRecoveries[0]?.problem_recovery_id ?? null;
    const nextSolution = visibleSolutions[0]?.solution_id ?? null;

    if (
      selectedProblemRecoveryId &&
      !visibleProblemRecoveries.some((artifact) => artifact.problem_recovery_id === selectedProblemRecoveryId)
    ) {
      setSelectedProblemRecoveryId(nextProblemRecovery);
    }
    if (selectedSolutionId && !visibleSolutions.some((artifact) => artifact.solution_id === selectedSolutionId)) {
      setSelectedSolutionId(nextSolution);
    }
    if (ratingTarget === "problem_recovery" && !nextProblemRecovery && nextSolution) {
      setRatingTarget("solution");
    }
    if (ratingTarget === "solution" && !nextSolution && nextProblemRecovery) {
      setRatingTarget("problem_recovery");
    }
  }, [
    ratingTarget,
    selectedCase,
    selectedProblemRecoveryId,
    selectedSolutionId,
    visibleProblemRecoveries,
    visibleSolutions,
  ]);

  useEffect(() => {
    const artifactScoreKey = `${ratingTarget}:${activeArtifactValue}`;
    const artifactChanged = lastScoreArtifactKey.current !== artifactScoreKey;
    const reviewerChanged = lastScoreReviewer.current !== normalizedReviewerEmail;
    const previousScoreWasHydrated = lastScoreWasHydrated.current;

    lastScoreArtifactKey.current = artifactScoreKey;
    lastScoreReviewer.current = normalizedReviewerEmail;

    if (!activeReviewArtifact) {
      setScore(null);
      lastScoreWasHydrated.current = false;
      return;
    }

    if (activeReviewerRating) {
      setScore(activeReviewerRating.score);
      lastScoreWasHydrated.current = true;
      return;
    }

    lastScoreWasHydrated.current = false;
    if (artifactChanged || (reviewerChanged && previousScoreWasHydrated)) {
      setScore(null);
    }
  }, [
    activeReviewerRating?.rating_id,
    activeReviewerRating?.score,
    activeReviewArtifact?.node_id,
    activeArtifactValue,
    normalizedReviewerEmail,
    ratingTarget,
  ]);

  async function submitRating() {
    if (!index || !selectedCase || !activeReviewArtifact || score === null) return;
    if (!reviewerIsAllowed) {
      setError("Choose a reviewer from the allow-list before submitting.");
      return;
    }
    if (!activeIsSubmittable) {
      setError("This artifact is audit-only. Inspect it for provenance, but rate imported or live run outputs.");
      return;
    }
    if (!isWritable || !ratingsEndpoint) {
      setError("Static preview is read-only until a hosted ratings API is configured.");
      return;
    }
    if (requiresAccessCode && !accessCode.trim()) {
      setError("Enter the reviewer access code before submitting.");
      return;
    }
    setError("");
    setSavedPath("");
    setIsSubmitting(true);

    try {
      const headers: HeadersInit = { "content-type": "application/json" };
      if (requiresAccessCode) {
        headers.authorization = `Bearer ${accessCode.trim()}`;
      }
      const response = await fetch(ratingsEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          case_id: selectedCase.case_id,
          rating_target: ratingTarget,
          solution_id: ratingTarget === "solution" ? selectedSolution?.solution_id : undefined,
          problem_recovery_id:
            ratingTarget === "problem_recovery" ? selectedProblemRecovery?.problem_recovery_id : undefined,
          node_id: activeReviewArtifact.node_id,
          score,
          notes: "",
          reviewer_email: normalizeRaterEmail(reviewerEmail),
        }),
      });
      const body = (await response.json()) as Partial<RatingSubmitResponse> & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Rating submission failed");
        return;
      }
      let latestIndex = index;
      try {
        latestIndex = await loadIndex();
      } catch {
        latestIndex = index;
      }
      const refreshed = applySubmittedRating({
        index: latestIndex,
        caseId: selectedCase.case_id,
        target: ratingTarget,
        nodeId: activeReviewArtifact.node_id ?? activeArtifactValue,
        score,
        reviewerEmail,
        submittedAt: new Date().toISOString(),
      });
      setIndex(refreshed);
      setSavedPath(body.relativePath ?? "");
      const refreshedCase =
        refreshed.cases.filter(hasRateableArtifacts).find((caseItem) => caseItem.case_id === selectedCase.case_id) ??
        null;
      const nextItem = findNextUnratedItem(
        reviewQueueForCase(refreshedCase),
        ratingTarget,
        activeArtifactValue,
        normalizedReviewerEmail,
      );
      if (nextItem) {
        selectReviewItem(nextItem);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rating submission failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  function selectReviewItem(item: ReviewQueueItem) {
    setRatingTarget(item.target);
    if (item.target === "problem_recovery") {
      setSelectedProblemRecoveryId(item.id);
    } else {
      setSelectedSolutionId(item.id);
    }
    setSavedPath("");
    setSourceDetailsOpen(false);
  }

  function updateReviewerEmail(value: string) {
    setReviewerEmail(value);
    setLoginEmail("");
    try {
      if (isAllowedRater(value)) {
        window.localStorage.setItem(REVIEWER_STORAGE_KEY, normalizeRaterEmail(value));
      }
    } catch {
      // Local storage is a convenience only; rating validation remains server-side.
    }
  }

  function logoutReviewer() {
    setReviewerEmail("");
    setLoginEmail("");
    setScore(null);
    setSavedPath("");
    setError("");
    try {
      window.localStorage.removeItem(REVIEWER_STORAGE_KEY);
    } catch {
      // Ignore storage failures; clearing local state is enough for this render.
    }
  }

  function updateAccessCode(value: string) {
    setAccessCode(value);
    try {
      // Session storage keeps the code out of committed config and clears it with the browser session.
      window.sessionStorage.setItem(ACCESS_CODE_STORAGE_KEY, value);
    } catch {
      // Ignore storage failures; the controlled input still works for the current render.
    }
  }

  if (error && !index) {
    return (
      <main className="app-shell">
        <p className="eyebrow">Doppl Life</p>
        <h1>Calibrator</h1>
        <p role="alert" className="error">
          {error}
        </p>
      </main>
    );
  }

  if (!index) {
    return (
      <main className="app-shell">
        <p className="eyebrow">Doppl Life</p>
        <h1>Calibrator</h1>
        <p>Loading vault index...</p>
      </main>
    );
  }

  if (reviewableCases.length === 0 || !selectedCase) {
    return (
      <main className="app-shell">
        <p className="eyebrow">Doppl Life</p>
        <h1>Calibrator</h1>
        <p>No rateable problem recoveries or doppls are available.</p>
      </main>
    );
  }

  if (!reviewerIsAllowed) {
    return (
      <main className="login-shell">
        <section className="login-panel" aria-label="Calibrator sign in">
          <div>
            <p className="eyebrow">Doppl Life</p>
            <h1>Calibrator</h1>
            <p className="login-copy">Choose your reviewer identity to begin rating problem recoveries and doppls.</p>
          </div>
          <label className="field login-field">
            <span>Reviewer email</span>
            <input
              type="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="Search or enter your email"
              autoComplete="email"
            />
          </label>
          {loginMatches.length > 0 ? (
            <div className="login-results" aria-label="Matching reviewers">
              {loginMatches.map((rater) => (
                <button key={rater} type="button" onClick={() => setLoginEmail(rater)}>
                  {rater}
                </button>
              ))}
            </div>
          ) : null}
          <button
            className="submit-button login-button"
            type="button"
            disabled={!isAllowedRater(loginEmail)}
            onClick={() => updateReviewerEmail(loginEmail)}
          >
            Continue
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="review-app">
      <section className="review-controls" aria-label="Review setup">
        <label className="field">
          <span>Case study</span>
          <select
            value={selectedCaseId}
            onChange={(event) => {
              const nextCase = reviewableCases.find((item) => item.case_id === event.target.value);
              const nextPrimaryProblemRecovery = nextCase ? firstRateableProblemRecovery(nextCase) : undefined;
              const nextPrimarySolution = nextCase ? firstRateableSolution(nextCase) : undefined;
              setSelectedCaseId(event.target.value);
              setSelectedProblemRecoveryId(nextPrimaryProblemRecovery?.problem_recovery_id ?? null);
              setSelectedSolutionId(nextPrimarySolution?.solution_id ?? null);
              setRatingTarget(nextPrimaryProblemRecovery ? "problem_recovery" : "solution");
              setSavedPath("");
              setSourceDetailsOpen(false);
            }}
          >
            {reviewableCases.map((caseItem) => (
              <option key={caseItem.case_id} value={caseItem.case_id}>
                {caseItem.title}
              </option>
            ))}
          </select>
        </label>
        <div className="target-toggle" aria-label="Review type">
          <button
            type="button"
            className={ratingTarget === "problem_recovery" ? "active" : ""}
            disabled={visibleProblemRecoveries.length === 0}
            onClick={() => {
              setRatingTarget("problem_recovery");
              setSavedPath("");
              setSourceDetailsOpen(false);
            }}
          >
            Problem recoveries
          </button>
          <button
            type="button"
            className={ratingTarget === "solution" ? "active" : ""}
            disabled={visibleSolutions.length === 0}
            onClick={() => {
              setRatingTarget("solution");
              setSavedPath("");
              setSourceDetailsOpen(false);
            }}
          >
            Doppls
          </button>
        </div>

        <div className="artifact-control">
          <div className="artifact-select-header">
            <span>{ratingTarget === "problem_recovery" ? "Problem recovery" : "Doppl"}</span>
          </div>
          <select
            aria-label={ratingTarget === "problem_recovery" ? "Problem recovery" : "Doppl"}
            value={activeArtifactValue}
            onChange={(event) => {
              if (ratingTarget === "problem_recovery") {
                setSelectedProblemRecoveryId(event.target.value);
              } else {
                setSelectedSolutionId(event.target.value);
              }
              setSavedPath("");
              setSourceDetailsOpen(false);
            }}
          >
            {ratingTarget === "problem_recovery"
              ? visibleProblemRecoveries.map((recovery) => (
                  <option key={recovery.problem_recovery_id} value={recovery.problem_recovery_id}>
                    {recovery.title}
                  </option>
                ))
              : visibleSolutions.map((solution) => (
                  <option key={solution.solution_id} value={solution.solution_id}>
                    {solution.title}
                  </option>
                ))}
          </select>
        </div>

        <button className="logout-button" type="button" onClick={logoutReviewer} aria-label="Log out">
          <span aria-hidden="true">Log out</span>
        </button>
      </section>

      <section className="trace-surface" aria-label="Case and selected artifact review">
        <article className="trace-step selected-step">
          <p className="trace-label">{ratingTarget === "problem_recovery" ? "Growth - Problem Recovery" : "Growth - Doppl"}</p>
          <h2>{activeTitle}</h2>
          {activeReviewArtifact ? (
            <ArtifactMarkdownBlock
              artifactKey={`${ratingTarget}:${activeArtifactValue}`}
              text={activeReviewArtifact.body}
              showEvaluation={canSeeJudgeEvaluation(normalizedReviewerEmail)}
            />
          ) : null}
        </article>

        <section className="source-disclosure">
          <button type="button" onClick={() => setSourceDetailsOpen((open) => !open)}>
            <span>{sourceDetailsOpen ? "Hide source details" : "Show source details"}</span>
            <span>{sourceDetailsOpen ? "-" : "+"}</span>
          </button>
          {sourceDetailsOpen && activeReviewArtifact ? (
            <div>
              {selectedComparisonSet && ratingTarget === "solution" ? (
                <section className="comparison-banner" aria-label="Comparison set provenance">
                  <div>
                    <p className="eyebrow">Comparison Set</p>
                    <h3>{selectedComparisonSet.title}</h3>
                  </div>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{selectedComparisonSet.status.replace("_", " ")}</dd>
                    </div>
                    <div>
                      <dt>Input hash</dt>
                      <dd>{selectedComparisonSet.input_hash}</dd>
                    </div>
                    <div>
                      <dt>Source mapping</dt>
                      <dd>{selectedComparisonSet.adapter_version}</dd>
                    </div>
                  </dl>
                </section>
              ) : null}
              <KernelMeta artifact={activeReviewArtifact} />
              {activeReviewArtifact.adapter_notes ? (
                <p className="adapter-note">{activeReviewArtifact.adapter_notes}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      </section>

      <footer className="rating-dock" aria-label="Rating controls">
        {requiresAccessCode ? (
          <div className="session-fields">
          {requiresAccessCode ? (
            <label className="field access-code-field">
              <span>Access code</span>
              <input
                type="password"
                value={accessCode}
                onChange={(event) => updateAccessCode(event.target.value)}
                autoComplete="current-password"
                placeholder="Session code"
              />
            </label>
          ) : null}
          </div>
        ) : null}
        <div className="slider-row">
          <label htmlFor="score-slider">
            <span>Score</span>
            <strong>{score === null ? "No score selected" : scoreLabel(score)}</strong>
          </label>
          <input
            id="score-slider"
            type="range"
            min="-5"
            max="5"
            step="1"
            value={score ?? 0}
            onChange={(event) => setScore(Number(event.target.value))}
          />
          <div className="slider-scale" aria-hidden="true">
            <span>-5</span>
            <span>0</span>
            <span>+5</span>
          </div>
          {reviewerIsAllowed && activeReviewArtifact ? (
            <p className="reviewer-rating-note">
              {activeReviewerRating
                ? `Your current rating for this item is ${scoreLabel(activeReviewerRating.score)}.`
                : "You have not rated this item yet."}
            </p>
          ) : null}
        </div>
        <button
          className="submit-button"
          type="button"
          disabled={
            score === null ||
            isSubmitting ||
            !isWritable ||
            !activeIsSubmittable ||
            !reviewerIsAllowed ||
            (requiresAccessCode && !accessCode.trim())
          }
          onClick={submitRating}
        >
          {isSubmitting
            ? "Saving..."
            : `${activeReviewerRating ? "Update" : "Submit"} ${
                ratingTarget === "problem_recovery" ? "problem recovery" : "doppl"
              } rating`}
        </button>
        {!isWritable ? <p className="mode-note">Rating writes require the local dev server or hosted ratings API.</p> : null}
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        {savedPath ? <p className="saved-path">Saved to {savedPath}</p> : null}
      </footer>
    </main>
  );
}
