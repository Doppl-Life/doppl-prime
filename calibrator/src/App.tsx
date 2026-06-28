import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
import { isAllowedRater, normalizeRaterEmail } from "./raters";
import {
  readGitHubAgardenIndex,
  type GitHubAgardenIndexConfig,
} from "./githubAgardenIndex";
import { AgoraApp } from "./Agora";
import { skinValidationQuestion } from "./skinValidationQuestions";

type RatingTarget = "problem_recovery" | "solution";
const REVIEWER_STORAGE_KEY = "doppl-calibrator-reviewer-email";
const ACCESS_CODE_STORAGE_KEY = "doppl-calibrator-access-code";
const LOCAL_RATINGS_ENDPOINT = "/api/ratings";
const SCORE_MIN = 0;
const SCORE_MAX = 10;
const DEFAULT_SCORE = 5;
const DEFAULT_CASE_ID = "jack-drone-privacy-fd080117";
const DEFAULT_CASE_TITLE = "The Rock Star's Drone Problem";
type ReviewQueueItem =
  | {
      target: "problem_recovery";
      id: string;
      artifact: CalibratorProblemRecovery;
    }
  | { target: "solution"; id: string; artifact: CalibratorSolution };

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
  return String(score);
}

function sliderScore(score: number): number {
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, score));
}

function ratingReviewerEmail(rating: CalibratorRating): string {
  return normalizeRaterEmail(
    rating.reviewer_email ?? rating.reviewer_name ?? "",
  );
}

function reviewerRating(
  artifact: ReviewArtifact | null,
  reviewerEmail: string,
): CalibratorRating | null {
  const normalizedReviewer = normalizeRaterEmail(reviewerEmail);
  if (!artifact || !normalizedReviewer) return null;
  return (
    artifact.human_ratings.find(
      (rating) => ratingReviewerEmail(rating) === normalizedReviewer,
    ) ?? null
  );
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
  const human =
    ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length;
  return { ...(previousScores ?? {}), human, n: ratings.length };
}

function applyRatingsLedger(
  index: CalibratorIndex,
  ledger: AgardenLedgerEntry[],
): CalibratorIndex {
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
          ratingFromLedger(
            caseItem.case_id,
            nodeId,
            "problem_recovery",
            rating,
          ),
        );
        return {
          ...artifact,
          human_ratings,
          scores: scoresFromRatings(artifact.scores, human_ratings),
        };
      }),
      solutions: caseItem.solutions.map((artifact) => {
        const nodeId = artifact.node_id ?? artifact.solution_id;
        const entry = byNode.get(nodeId);
        if (!entry) return artifact;
        const human_ratings = entry.ratings.map((rating) =>
          ratingFromLedger(caseItem.case_id, nodeId, "solution", rating),
        );
        return {
          ...artifact,
          human_ratings,
          scores: scoresFromRatings(artifact.scores, human_ratings),
        };
      }),
    })),
  };
}

function upsertRating(
  ratings: CalibratorRating[],
  nextRating: CalibratorRating,
): CalibratorRating[] {
  const reviewer = ratingReviewerEmail(nextRating);
  const withoutPrevious = ratings.filter(
    (rating) => ratingReviewerEmail(rating) !== reviewer,
  );
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
  const nextRating = ratingFromLedger(
    input.caseId,
    input.nodeId,
    input.target,
    {
      rater_id: normalizeRaterEmail(input.reviewerEmail),
      score: input.score,
      rate_date: input.submittedAt,
    },
  );
  return {
    ...input.index,
    cases: input.index.cases.map((caseItem) => {
      if (caseItem.case_id !== input.caseId) return caseItem;
      return {
        ...caseItem,
        problem_recoveries: caseItem.problem_recoveries.map((artifact) => {
          const nodeId = artifact.node_id ?? artifact.problem_recovery_id;
          if (input.target !== "problem_recovery" || nodeId !== input.nodeId)
            return artifact;
          const human_ratings = upsertRating(
            artifact.human_ratings,
            nextRating,
          );
          return {
            ...artifact,
            human_ratings,
            scores: scoresFromRatings(artifact.scores, human_ratings),
          };
        }),
        solutions: caseItem.solutions.map((artifact) => {
          const nodeId = artifact.node_id ?? artifact.solution_id;
          if (input.target !== "solution" || nodeId !== input.nodeId)
            return artifact;
          const human_ratings = upsertRating(
            artifact.human_ratings,
            nextRating,
          );
          return {
            ...artifact,
            human_ratings,
            scores: scoresFromRatings(artifact.scores, human_ratings),
          };
        }),
      };
    }),
  };
}

function firstRateableProblemRecovery(
  caseItem: CalibratorIndex["cases"][number],
) {
  return caseItem.problem_recoveries.find(
    (artifact) => reviewMode(artifact) === "primary",
  );
}

function firstRateableSolution(caseItem: CalibratorIndex["cases"][number]) {
  return caseItem.solutions.find(
    (artifact) => reviewMode(artifact) === "primary",
  );
}

function problemRecoveryNodeKey(recovery: CalibratorProblemRecovery): string[] {
  return [recovery.node_id, recovery.problem_recovery_id].filter(
    Boolean,
  ) as string[];
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
  return (
    recoveries.find((recovery) => reviewMode(recovery) === "primary") ??
    recoveries[0] ??
    null
  );
}

function hasRateableArtifacts(caseItem: CalibratorIndex["cases"][number]) {
  return Boolean(
    firstRateableProblemRecovery(caseItem) || firstRateableSolution(caseItem),
  );
}

function firstReviewableCase(index: CalibratorIndex) {
  return (
    index.cases.find(
      (caseItem) =>
        caseItem.case_id === DEFAULT_CASE_ID && hasRateableArtifacts(caseItem),
    ) ??
    index.cases.find(
      (caseItem) =>
        caseItem.title === DEFAULT_CASE_TITLE && hasRateableArtifacts(caseItem),
    ) ?? index.cases.find(hasRateableArtifacts)
  );
}

function hasDefaultReviewableCase(index: CalibratorIndex) {
  return index.cases.some(
    (caseItem) =>
      (caseItem.case_id === DEFAULT_CASE_ID ||
        caseItem.title === DEFAULT_CASE_TITLE) &&
      hasRateableArtifacts(caseItem),
  );
}

function reviewQueueForCase(
  caseItem: CalibratorIndex["cases"][number] | null,
): ReviewQueueItem[] {
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
  const currentIndex = queue.findIndex(
    (item) => item.target === currentTarget && item.id === currentId,
  );
  const start = currentIndex >= 0 ? currentIndex + 1 : 0;
  for (let offset = 0; offset < queue.length; offset += 1) {
    const candidate = queue[(start + offset) % queue.length];
    if (candidate.target === currentTarget && candidate.id === currentId)
      continue;
    if (!reviewerRating(candidate.artifact, reviewerEmail)) return candidate;
  }
  return null;
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
    .replace(
      /^(TRACE|DISCOVERY|EVALUATION|PATH NEXT|GROWTH\s*[—-]\s*(?:PROBLEM RECOVERY|DOPPL))[ \t]*$/gim,
      "## $1",
    )
    .replace(/\n{3,}/g, "\n\n");
  const lines = normalized
    .split("\n")
    .filter((line) => !/^prev(_id)?:\s*/.test(line.trim()));
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex >= 0 && /^#\s+/.test(lines[firstContentIndex])) {
    lines.splice(firstContentIndex, 1);
  }
  return lines.join("\n").trim();
}

function splitEvaluationMarkdown(text: string): {
  main: string;
  evaluation: string;
} {
  const normalized = displayMarkdown(text);
  const headingMatch = normalized.match(/\n#{2,4}\s+Evaluation\s*\n/i);
  if (headingMatch?.index !== undefined) {
    const main = normalized.slice(0, headingMatch.index).trim();
    const evaluation = normalized
      .slice(headingMatch.index + headingMatch[0].length)
      .trim();
    return { main, evaluation };
  }

  const lines = normalized.split("\n");
  const plainEvaluationIndex = lines.findIndex((line) =>
    /^Evaluation$/i.test(line.trim()),
  );
  if (plainEvaluationIndex >= 0) {
    return {
      main: lines.slice(0, plainEvaluationIndex).join("\n").trim(),
      evaluation: lines
        .slice(plainEvaluationIndex + 1)
        .join("\n")
        .trim(),
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
    /^(Novelty|Grounding|Falsifiability|Cost-Efficiency|Cost Efficiency|Relevance)\s+[+-]?\d/i.test(
      line.trim(),
    ),
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
    .replace(
      /(^|[\s·/—-])([a-z])/g,
      (_match, prefix: string, letter: string) =>
        `${prefix}${letter.toUpperCase()}`,
    )
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
      if (
        /^(AI|API|AV|EV|FICO|OEM|RUC|XAI|FTC|ECB|CSAIL|NHTSA|MIT)$/i.test(word)
      )
        return word.toUpperCase();
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
  const labeledFieldPattern =
    /(?<!#)\s+(?=(Surface Complaint|Deleted Assumption|Hidden Variable|Actual Problem|Candidate Response|Skin In The Game|Skin in the Game|Implications|Opportunities|Sprouts|Claim)\b)/g;
  return displayMarkdown(text)
    .replace(labeledFieldPattern, "\n\n")
    .split(/\n{2,}/)
    .flatMap((block) =>
      block
        .replace(/\s+(#{2,4}\s+)/g, "\n\n$1")
        .replace(/^(#{2,4}\s+[^\n]+)\n+/gm, "$1\n\n")
        .split(/\n{2,}/),
    )
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

type LabeledMarkdownBlock =
  | { label: string; kind: "list"; items: string[] }
  | { label: string; kind: "body"; body: string }
  | { label: string; kind: "hidden" };

function isGeneratedListLabel(label: string): boolean {
  return /^(Implications|Opportunities|Sprouts|Skin in the Game)$/i.test(label);
}

function generatedListClassName(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized === "skin in the game")
    return "generated-list generated-list-emphasis skin-list";
  if (normalized === "implications" || normalized === "opportunities")
    return "generated-list generated-list-emphasis";
  return "generated-list";
}

function GeneratedList({
  artifactId,
  label,
  items,
}: {
  artifactId?: string;
  label: string;
  items: string[];
}) {
  const isSkinList = /^Skin in the Game$/i.test(label);
  return (
    <section className={generatedListClassName(label)}>
      <h5>{label}:</h5>
      <ul>
        {items.map((item) => {
          const itemLabel = sentenceCaseHeading(item);
          const question = isSkinList
            ? skinValidationQuestion(artifactId, item)
            : null;
          return (
            <li key={item}>
              <span className="generated-list-item-label">{itemLabel}</span>
              {question ? (
                <span className="skin-validation-question">
                  {" "}
                  - "{question}"
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function labeledBlock(block: string): LabeledMarkdownBlock | null {
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
    const pattern = new RegExp(
      `^${label.replace(/\s+/g, "\\s+")}(?:\\s*[-:]\\s*|\\s+)([\\s\\S]+)$`,
      "i",
    );
    const match = block.match(pattern);
    if (!match) continue;
    if (/^candidate response$/i.test(label)) {
      return { label, kind: "hidden" };
    }
    const body = renderInlineText(match[1]);
    const parts = generatedListItems(body);
    if (isGeneratedListLabel(label) && parts.length > 0) {
      return { label, items: parts, kind: "list" };
    }
    return { label, body, kind: "body" };
  }
  return null;
}

function classNameForGeneratedField(label: string): string {
  const normalized = label.toLowerCase();
  if (normalized === "actual problem")
    return "generated-field actual-problem-field";
  if (normalized === "claim") return "generated-field claim-field";
  return "generated-field";
}

function isProblemFrameLabel(label: string): boolean {
  return /^(Surface complaint|Deleted assumption|Hidden variable)$/i.test(
    label,
  );
}

function isProminentFieldLabel(label: string): boolean {
  return /^(Claim|Actual problem)$/i.test(label);
}

function isHiddenFieldLabel(label: string): boolean {
  return /^Candidate response$/i.test(label);
}

function supplementalMarkdown(baseText: string, candidateText: string): string {
  const baseBlocks = new Set(
    markdownBlocks(baseText).map(comparableText).filter(Boolean),
  );
  const uniqueBlocks = markdownBlocks(candidateText).filter((block) => {
    const comparable = comparableText(block);
    return comparable && !baseBlocks.has(comparable);
  });
  return uniqueBlocks.join("\n\n");
}

function MarkdownBlock({
  text,
  artifactId,
}: {
  text: string;
  artifactId?: string;
}) {
  const blocks = markdownBlocks(text);
  const renderedBlocks = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const heading = block.match(/^#{2,4}\s+(.+)$/);
    const plainLabel = isHiddenFieldLabel(cleanHeading(block))
      ? cleanHeading(block)
      : "";
    const label = heading ? cleanHeading(heading[1]) : plainLabel;
    const nextBlock = blocks[index + 1] ?? "";
    if (isHiddenFieldLabel(label)) {
      index += nextBlock ? 1 : 0;
      continue;
    }
    if (
      (isProblemFrameLabel(label) || isProminentFieldLabel(label)) &&
      nextBlock
    ) {
      if (isProblemFrameLabel(label)) {
        const frameFields: { label: string; body: string }[] = [
          { label, body: nextBlock },
        ];
        let lookahead = index + 2;
        while (lookahead + 1 < blocks.length) {
          const nextHeading = blocks[lookahead].match(/^#{2,4}\s+(.+)$/);
          const nextLabel = nextHeading ? cleanHeading(nextHeading[1]) : "";
          if (!isProblemFrameLabel(nextLabel)) break;
          frameFields.push({ label: nextLabel, body: blocks[lookahead + 1] });
          lookahead += 2;
        }
        renderedBlocks.push(
          <section
            className="problem-frame-grid"
            key={`${block}-${nextBlock}`.slice(0, 120)}
          >
            {frameFields.map((field) => (
              <article className="problem-frame-card" key={field.label}>
                <h5>{field.label}</h5>
                <p>{renderInlineText(field.body)}</p>
              </article>
            ))}
          </section>,
        );
        index = lookahead - 1;
        continue;
      }
      renderedBlocks.push(
        <section
          className={classNameForGeneratedField(label)}
          key={`${block}-${nextBlock}`.slice(0, 120)}
        >
          <h5>{label}:</h5>
          <p>{renderInlineText(nextBlock)}</p>
        </section>,
      );
      index += 1;
      continue;
    }
    if (
      isGeneratedListLabel(label) &&
      nextBlock &&
      generatedListItems(nextBlock).length > 0
    ) {
      renderedBlocks.push(
        <GeneratedList
          artifactId={artifactId}
          items={generatedListItems(nextBlock)}
          key={`${block}-${nextBlock}`.slice(0, 120)}
          label={label}
        />,
      );
      index += 1;
      continue;
    }

    const key = block.slice(0, 80);
    const labeled = labeledBlock(block);
    if (labeled?.kind === "hidden") {
      continue;
    }
    if (labeled?.kind === "body" && isProblemFrameLabel(labeled.label)) {
      const frameFields: { label: string; body: string }[] = [
        { label: labeled.label, body: labeled.body },
      ];
      let lookahead = index + 1;
      while (lookahead < blocks.length) {
        const nextLabeled = labeledBlock(blocks[lookahead]);
        if (
          nextLabeled?.kind !== "body" ||
          !isProblemFrameLabel(nextLabeled.label)
        )
          break;
        frameFields.push({ label: nextLabeled.label, body: nextLabeled.body });
        lookahead += 1;
      }
      renderedBlocks.push(
        <section className="problem-frame-grid" key={key}>
          {frameFields.map((field) => (
            <article className="problem-frame-card" key={field.label}>
              <h5>{field.label}</h5>
              <p>{renderInlineText(field.body)}</p>
            </article>
          ))}
        </section>,
      );
      index = lookahead - 1;
      continue;
    }
    if (labeled?.kind === "list") {
      renderedBlocks.push(
        <GeneratedList
          artifactId={artifactId}
          items={labeled.items}
          key={key}
          label={labeled.label}
        />,
      );
      continue;
    }
    if (labeled?.kind === "body") {
      renderedBlocks.push(
        <section
          className={classNameForGeneratedField(labeled.label)}
          key={key}
        >
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
            <li key={line}>
              {renderInlineText(line.replace(/^\d+\.\s*/, ""))}
            </li>
          ))}
        </ol>,
      );
      continue;
    }
    renderedBlocks.push(<p key={key}>{renderInlineText(block)}</p>);
  }

  return <div className="markdown-block">{renderedBlocks}</div>;
}

function ArtifactMarkdownBlock({
  text,
  artifactId,
}: {
  text: string;
  artifactId?: string;
}) {
  const { trace, discovery, body } = splitArtifactMarkdown(text);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);

  useEffect(() => {
    setIsDiscoveryOpen(false);
  }, [text]);

  return (
    <>
      {trace ? (
        <section className="artifact-context-section">
          <h3>Trace</h3>
          <MarkdownBlock artifactId={artifactId} text={trace} />
        </section>
      ) : null}
      {discovery ? (
        <section className="artifact-context-disclosure">
          <button
            aria-expanded={isDiscoveryOpen}
            onClick={() => setIsDiscoveryOpen((open) => !open)}
            type="button"
          >
            <span>Discovery</span>
            <span>{isDiscoveryOpen ? "-" : "+"}</span>
          </button>
          {isDiscoveryOpen ? (
            <div className="artifact-context-section">
              <MarkdownBlock artifactId={artifactId} text={discovery} />
            </div>
          ) : null}
        </section>
      ) : null}
      <MarkdownBlock artifactId={artifactId} text={body} />
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
    [
      "comparison",
      "comparison_set_id" in artifact ? artifact.comparison_set_id : undefined,
    ],
    [
      "input hash",
      "comparison_input_hash" in artifact
        ? artifact.comparison_input_hash
        : undefined,
    ],
    [
      "source mapping",
      artifact.source_mapping_version ?? artifact.adapter_version,
    ],
    ["kernel", artifact.kernel],
    ["class", "output_class" in artifact ? artifact.output_class : undefined],
    ["phase", "phase" in artifact ? artifact.phase : undefined],
    ["subtype", "subtype" in artifact ? artifact.subtype : undefined],
    ["branch", artifact.source_branch ?? artifact.branch],
    ["commit", artifact.source_commit],
    ["run", artifact.run_id],
    [
      "run artifact",
      "run_artifact_id" in artifact ? artifact.run_artifact_id : undefined,
    ],
    [
      "generation",
      "generation_id" in artifact ? artifact.generation_id : undefined,
    ],
    ["agenome", "agenome_id" in artifact ? artifact.agenome_id : undefined],
    [
      "candidate",
      "candidate_id" in artifact ? artifact.candidate_id : undefined,
    ],
    [
      "judge",
      "judge_score" in artifact ? artifact.judge_score?.toString() : undefined,
    ],
    [
      "fitness",
      "fitness_score" in artifact
        ? artifact.fitness_score?.toString()
        : undefined,
    ],
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

function artifactNodeId(artifact: ReviewArtifact | null): string | undefined {
  if (!artifact) return undefined;
  if (artifact.node_id) return artifact.node_id;
  if ("problem_recovery_id" in artifact) return artifact.problem_recovery_id;
  return artifact.solution_id;
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
  const isAgoraRoute = /\/agora\/?$/.test(window.location.pathname);
  const [index, setIndex] = useState<CalibratorIndex | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState(DEFAULT_CASE_ID);
  const [selectedProblemRecoveryId, setSelectedProblemRecoveryId] = useState<
    string | null
  >(null);
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(
    null,
  );
  const [ratingTarget, setRatingTarget] = useState<RatingTarget>("solution");
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginError, setLoginError] = useState("");
  const [score, setScore] = useState(DEFAULT_SCORE);
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

  async function mergeHostedRatingsLedger(
    data: CalibratorIndex,
  ): Promise<CalibratorIndex> {
    const ledgerUrl = hostedRatingsLedgerUrl();
    if (!ledgerUrl) return data;
    try {
      const response = await fetch(
        `${ledgerUrl}${ledgerUrl.includes("?") ? "&" : "?"}v=${Date.now()}`,
        {
          cache: "no-store",
        },
      );
      if (!response.ok) return data;
      const ledger = (await response.json()) as AgardenLedgerEntry[];
      if (!Array.isArray(ledger)) return data;
      return applyRatingsLedger(data, ledger);
    } catch {
      return data;
    }
  }

  async function loadIndex() {
    async function loadStaticIndex() {
      const staticIndexPath = isAgoraRoute
        ? "../calibration-index.json"
        : "calibration-index.json";
      const staticResponse = await fetch(`${staticIndexPath}?v=${Date.now()}`, {
        cache: "no-store",
      });
      if (!staticResponse.ok) throw new Error("Failed to load vault index");
      return mergeHostedRatingsLedger(
        (await staticResponse.json()) as CalibratorIndex,
      );
    }

    try {
      const apiResponse = await fetch("/api/index", { cache: "no-store" });
      if (apiResponse.ok) {
        setIsWritable(true);
        setRatingsEndpoint(LOCAL_RATINGS_ENDPOINT);
        return mergeHostedRatingsLedger(
          (await apiResponse.json()) as CalibratorIndex,
        );
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
        const liveIndex = await mergeHostedRatingsLedger(
          await readGitHubAgardenIndex(githubConfig),
        );
        if (hasDefaultReviewableCase(liveIndex)) return liveIndex;
        console.warn(
          "Falling back to static calibration index because the live aGarden read did not include the default reviewable case.",
        );
        return loadStaticIndex();
      } catch (err) {
        console.warn(
          "Falling back to static calibration index after GitHub aGarden read failed.",
          err,
        );
      }
    }

    return loadStaticIndex();
  }

  useEffect(() => {
    loadIndex()
      .then((data) => {
        setIndex(data);
        const firstCase = firstReviewableCase(data);
        if (firstCase) {
          const firstPrimaryProblemRecovery =
            firstRateableProblemRecovery(firstCase);
          const firstPrimarySolution = firstRateableSolution(firstCase);
          setSelectedCaseId(firstCase.case_id);
          setSelectedProblemRecoveryId(
            firstPrimaryProblemRecovery?.problem_recovery_id ?? null,
          );
          setSelectedSolutionId(firstPrimarySolution?.solution_id ?? null);
          setRatingTarget(
            firstPrimaryProblemRecovery ? "problem_recovery" : "solution",
          );
        }
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to load vault index",
        );
      });
  }, []);

  useEffect(() => {
    function updateViewportHeight() {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty(
        "--calibrator-vh",
        `${height}px`,
      );
    }

    updateViewportHeight();
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);
    return () => {
      window.visualViewport?.removeEventListener(
        "resize",
        updateViewportHeight,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        updateViewportHeight,
      );
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, []);

  const selectedCase = useMemo(
    () =>
      index?.cases
        .filter(hasRateableArtifacts)
        .find((caseItem) => caseItem.case_id === selectedCaseId) ?? null,
    [index, selectedCaseId],
  );
  const reviewableCases = useMemo(
    () => index?.cases.filter(hasRateableArtifacts) ?? [],
    [index],
  );
  const allProblemRecoveries = useMemo(
    () => selectedCase?.problem_recoveries ?? [],
    [selectedCase],
  );
  const allSolutions = useMemo(
    () => selectedCase?.solutions ?? [],
    [selectedCase],
  );
  const visibleSolutions = useMemo(() => {
    if (!selectedCase) return [];
    return allSolutions.filter(
      (artifact) => reviewMode(artifact) === "primary",
    );
  }, [allSolutions, selectedCase]);
  const selectedSolution = useMemo(
    () =>
      visibleSolutions.find(
        (solution) => solution.solution_id === selectedSolutionId,
      ) ??
      visibleSolutions[0] ??
      null,
    [visibleSolutions, selectedSolutionId],
  );
  const visibleProblemRecoveries = useMemo(() => {
    if (!selectedCase) return [];
    return allProblemRecoveries.filter(
      (artifact) => reviewMode(artifact) === "primary",
    );
  }, [allProblemRecoveries, selectedCase]);
  const selectedProblemRecovery = useMemo(
    () =>
      visibleProblemRecoveries.find(
        (recovery) =>
          recovery.problem_recovery_id === selectedProblemRecoveryId,
      ) ??
      visibleProblemRecoveries[0] ??
      null,
    [visibleProblemRecoveries, selectedProblemRecoveryId],
  );
  const reviewQueue = useMemo<ReviewQueueItem[]>(() => {
    return reviewQueueForCase(selectedCase);
  }, [selectedCase]);
  const activeReviewArtifact =
    ratingTarget === "problem_recovery"
      ? selectedProblemRecovery
      : selectedSolution;
  const activeTitle = artifactTitle(activeReviewArtifact);
  const ratingObjectLabel =
    ratingTarget === "problem_recovery" ? "problem recovery" : "doppl";
  const ratingQuestion =
    ratingTarget === "problem_recovery"
      ? "Does this identify the right problem in the case?"
      : "Does this propose a useful finding or solution?";
  const ratingModeDescription =
    ratingTarget === "problem_recovery"
      ? "Problem recoveries are judged on whether they frame the important hidden problem clearly and usefully."
      : "Doppls are judged on whether they offer a useful finding, implication, or solution path.";
  const activeIsSubmittable = canSubmitRating(activeReviewArtifact);
  const normalizedReviewerEmail = normalizeRaterEmail(reviewerEmail);
  const reviewerIsAllowed = isAllowedRater(reviewerEmail);
  const activeReviewerRating = reviewerRating(
    activeReviewArtifact,
    normalizedReviewerEmail,
  );
  const activeArtifactValue =
    ratingTarget === "problem_recovery"
      ? (selectedProblemRecovery?.problem_recovery_id ?? "")
      : (selectedSolution?.solution_id ?? "");
  const selectedComparisonSet = useMemo(() => {
    const comparisonSetId = selectedSolution?.comparison_set_id;
    if (!comparisonSetId) return null;
    return (
      (index?.comparison_sets ?? []).find(
        (set) => set.comparison_set_id === comparisonSetId,
      ) ?? null
    );
  }, [index?.comparison_sets, selectedSolution?.comparison_set_id]);

  useEffect(() => {
    if (!selectedCase) return;

    const nextProblemRecovery =
      visibleProblemRecoveries[0]?.problem_recovery_id ?? null;
    const nextSolution = visibleSolutions[0]?.solution_id ?? null;

    if (
      selectedProblemRecoveryId &&
      !visibleProblemRecoveries.some(
        (artifact) =>
          artifact.problem_recovery_id === selectedProblemRecoveryId,
      )
    ) {
      setSelectedProblemRecoveryId(nextProblemRecovery);
    }
    if (
      selectedSolutionId &&
      !visibleSolutions.some(
        (artifact) => artifact.solution_id === selectedSolutionId,
      )
    ) {
      setSelectedSolutionId(nextSolution);
    }
    if (
      ratingTarget === "problem_recovery" &&
      !nextProblemRecovery &&
      nextSolution
    ) {
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
    const reviewerChanged =
      lastScoreReviewer.current !== normalizedReviewerEmail;
    const previousScoreWasHydrated = lastScoreWasHydrated.current;

    lastScoreArtifactKey.current = artifactScoreKey;
    lastScoreReviewer.current = normalizedReviewerEmail;

    if (!activeReviewArtifact) {
      setScore(DEFAULT_SCORE);
      lastScoreWasHydrated.current = false;
      return;
    }

    if (activeReviewerRating) {
      setScore(sliderScore(activeReviewerRating.score));
      lastScoreWasHydrated.current = true;
      return;
    }

    lastScoreWasHydrated.current = false;
    if (artifactChanged || (reviewerChanged && previousScoreWasHydrated)) {
      setScore(DEFAULT_SCORE);
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
    if (!index || !selectedCase || !activeReviewArtifact) return;
    if (!reviewerIsAllowed) {
      setError("Enter a valid reviewer email before submitting.");
      return;
    }
    if (!activeIsSubmittable) {
      setError(
        "This artifact is audit-only. Inspect it for provenance, but rate imported or live run outputs.",
      );
      return;
    }
    if (!isWritable || !ratingsEndpoint) {
      setError(
        "Static preview is read-only until a hosted ratings API is configured.",
      );
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
          solution_id:
            ratingTarget === "solution"
              ? selectedSolution?.solution_id
              : undefined,
          problem_recovery_id:
            ratingTarget === "problem_recovery"
              ? selectedProblemRecovery?.problem_recovery_id
              : undefined,
          node_id: activeReviewArtifact.node_id,
          score,
          notes: "",
          reviewer_email: normalizeRaterEmail(reviewerEmail),
        }),
      });
      const body = (await response.json()) as Partial<RatingSubmitResponse> & {
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "Rating submission failed");
        return;
      }
      let latestIndex = index;
      try {
        const loadedIndex = await loadIndex();
        const loadedCase = loadedIndex.cases
          .filter(hasRateableArtifacts)
          .find((caseItem) => caseItem.case_id === selectedCase.case_id);
        latestIndex = loadedCase ? loadedIndex : index;
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
        refreshed.cases
          .filter(hasRateableArtifacts)
          .find((caseItem) => caseItem.case_id === selectedCase.case_id) ??
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
    setLoginError("");
    try {
      window.localStorage.setItem(
        REVIEWER_STORAGE_KEY,
        normalizeRaterEmail(value),
      );
    } catch {
      // Local storage is a convenience only; rating validation remains server-side.
    }
  }

  function logoutReviewer() {
    setReviewerEmail("");
    setLoginEmail("");
    setLoginError("");
    setScore(DEFAULT_SCORE);
    setSavedPath("");
    setError("");
    try {
      window.localStorage.removeItem(REVIEWER_STORAGE_KEY);
    } catch {
      // Ignore storage failures; clearing local state is enough for this render.
    }
  }

  function submitLogin() {
    const normalized = normalizeRaterEmail(loginEmail);
    if (!isAllowedRater(normalized)) {
      setLoginError("Enter a valid email address to continue.");
      return;
    }
    updateReviewerEmail(normalized);
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
        <h1>{isAgoraRoute ? "Agora" : "Calibrator"}</h1>
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
        <h1>{isAgoraRoute ? "Agora" : "Calibrator"}</h1>
        <p>Loading vault index...</p>
      </main>
    );
  }

  if (isAgoraRoute) {
    return <AgoraApp index={index} />;
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
            <p className="login-copy">
              Enter your email so your ratings can be saved to the ledger.
            </p>
          </div>
          <label className="field login-field">
            <span>Reviewer email</span>
            <input
              type="email"
              value={loginEmail}
              onChange={(event) => {
                setLoginEmail(event.target.value);
                setLoginError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitLogin();
                }
              }}
              placeholder="name@challenger.gauntletai.com"
              autoComplete="email"
              aria-invalid={loginError ? "true" : "false"}
              aria-describedby={loginError ? "login-error" : undefined}
            />
          </label>
          <button
            className="submit-button login-button"
            type="button"
            onClick={submitLogin}
          >
            Continue
          </button>
          {loginError ? (
            <p className="field-note login-error" id="login-error" role="alert">
              {loginError}
            </p>
          ) : null}
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
              const nextCase = reviewableCases.find(
                (item) => item.case_id === event.target.value,
              );
              const nextPrimaryProblemRecovery = nextCase
                ? firstRateableProblemRecovery(nextCase)
                : undefined;
              const nextPrimarySolution = nextCase
                ? firstRateableSolution(nextCase)
                : undefined;
              setSelectedCaseId(event.target.value);
              setSelectedProblemRecoveryId(
                nextPrimaryProblemRecovery?.problem_recovery_id ?? null,
              );
              setSelectedSolutionId(nextPrimarySolution?.solution_id ?? null);
              setRatingTarget(
                nextPrimaryProblemRecovery ? "problem_recovery" : "solution",
              );
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
            <span>
              {ratingTarget === "problem_recovery"
                ? "Problem recovery"
                : "Doppl"}
            </span>
          </div>
          <select
            aria-label={
              ratingTarget === "problem_recovery" ? "Problem recovery" : "Doppl"
            }
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
                  <option
                    key={recovery.problem_recovery_id}
                    value={recovery.problem_recovery_id}
                  >
                    {recovery.title}
                  </option>
                ))
              : visibleSolutions.map((solution) => (
                  <option
                    key={solution.solution_id}
                    value={solution.solution_id}
                  >
                    {solution.title}
                  </option>
                ))}
          </select>
        </div>

        <button
          className="logout-button"
          type="button"
          onClick={logoutReviewer}
          aria-label="Log out"
        >
          <span aria-hidden="true">Log out</span>
        </button>
      </section>

      <section
        className="trace-surface"
        aria-label="Case and selected artifact review"
      >
        <section className="review-guide" aria-label="Rating instructions">
          <div className="guide-rubric">
            <p className="trace-label">Rating guide</p>
            <p>
              Rate how useful this {ratingObjectLabel} is for understanding or
              solving the case. {ratingQuestion}
            </p>
          </div>
          <ol className="guide-steps" aria-label="Rating steps">
            <li>Choose a case</li>
            <li>Read the {ratingObjectLabel}</li>
            <li>Score usefulness from 0 to 10</li>
          </ol>
          <p className="mode-explainer">{ratingModeDescription}</p>
        </section>

        <div
          className="case-study-heading"
          aria-label={`Case study: ${selectedCase.title}`}
        >
          {selectedCase.title}
        </div>

        <article className="trace-step selected-step">
          <p className="trace-label">
            {ratingTarget === "problem_recovery" ? "Problem recovery" : "Doppl"}
          </p>
          <h2>{activeTitle}</h2>
          {activeReviewArtifact ? (
            <ArtifactMarkdownBlock
              artifactId={artifactNodeId(activeReviewArtifact)}
              text={activeReviewArtifact.body}
            />
          ) : null}
        </article>

        <section className="source-disclosure">
          <button
            type="button"
            onClick={() => setSourceDetailsOpen((open) => !open)}
          >
            <span>
              {sourceDetailsOpen
                ? "Hide source details"
                : "Show source details"}
            </span>
            <span>{sourceDetailsOpen ? "-" : "+"}</span>
          </button>
          {sourceDetailsOpen && activeReviewArtifact ? (
            <div>
              {selectedComparisonSet && ratingTarget === "solution" ? (
                <section
                  className="comparison-banner"
                  aria-label="Comparison set provenance"
                >
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
                <p className="adapter-note">
                  {activeReviewArtifact.adapter_notes}
                </p>
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
            <strong>{scoreLabel(score)}</strong>
          </label>
          <input
            id="score-slider"
            type="range"
            min={SCORE_MIN}
            max={SCORE_MAX}
            step="1"
            value={score}
            onChange={(event) => setScore(Number(event.target.value))}
            style={{
              "--score-percent": `${((score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100}%`,
            } as CSSProperties}
          />
          <div className="slider-scale" aria-hidden="true">
            <span>
              <span className="scale-label-full">0 misleading</span>
              <span className="scale-label-short">
                <span>0</span>
                <span>bad</span>
              </span>
            </span>
            <span>
              <span className="scale-label-full">5 neutral</span>
              <span className="scale-label-short">
                <span>5</span>
                <span>neutral</span>
              </span>
            </span>
            <span>
              <span className="scale-label-full">10 highly useful</span>
              <span className="scale-label-short">
                <span>10</span>
                <span>useful</span>
              </span>
            </span>
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
                ratingTarget === "problem_recovery"
                  ? "problem recovery"
                  : "doppl"
              } rating`}
        </button>
        {!isWritable ? (
          <p className="mode-note">
            Rating writes require the local dev server or hosted ratings API.
          </p>
        ) : null}
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
