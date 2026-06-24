import { useEffect, useMemo, useState } from "react";
import type {
  CalibratorIndex,
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

type RatingTarget = "problem_recovery" | "solution";
const REVIEWER_STORAGE_KEY = "doppl-calibrator-reviewer-email";
const LOCAL_RATINGS_ENDPOINT = "/api/ratings";
type ReviewQueueItem =
  | { target: "problem_recovery"; id: string; artifact: CalibratorProblemRecovery }
  | { target: "solution"; id: string; artifact: CalibratorSolution };

declare global {
  interface Window {
    DOPPL_CALIBRATOR_CONFIG?: {
      ratingsEndpoint?: string;
    };
  }
}

function scoreLabel(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function firstRateableProblemRecovery(caseItem: CalibratorIndex["cases"][number]) {
  return caseItem.problem_recoveries.find((artifact) => reviewMode(artifact) === "primary");
}

function firstRateableSolution(caseItem: CalibratorIndex["cases"][number]) {
  return caseItem.solutions.find((artifact) => reviewMode(artifact) === "primary");
}

function hasRateableArtifacts(caseItem: CalibratorIndex["cases"][number]) {
  return Boolean(firstRateableProblemRecovery(caseItem) || firstRateableSolution(caseItem));
}

function firstReviewableCase(index: CalibratorIndex) {
  return index.cases.find(hasRateableArtifacts);
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
  return (
    <div className="markdown-block">
      {blocks.map((block) => {
          const key = block.slice(0, 80);
          if (block.startsWith("# ")) return <h3 key={key}>{cleanHeading(block)}</h3>;
          if (block.startsWith("## ")) return <h4 key={key}>{cleanHeading(block)}</h4>;
          if (block.startsWith("### ")) return <h5 key={key}>{cleanHeading(block)}</h5>;
          if (block.startsWith("#### ")) return <h5 key={key}>{cleanHeading(block)}</h5>;
          if (/^\d+\.\s/m.test(block)) {
            return (
              <ol key={key}>
                {block.split("\n").map((line) => (
                  <li key={line}>{renderInlineText(line.replace(/^\d+\.\s*/, ""))}</li>
                ))}
              </ol>
            );
          }
          return <p key={key}>{renderInlineText(block)}</p>;
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

export function App() {
  const [index, setIndex] = useState<CalibratorIndex | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState("fsd-accident-economy");
  const [selectedProblemRecoveryId, setSelectedProblemRecoveryId] = useState<string | null>(null);
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(null);
  const [ratingTarget, setRatingTarget] = useState<RatingTarget>("solution");
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState(() => {
    try {
      return window.localStorage.getItem(REVIEWER_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [savedPath, setSavedPath] = useState("");
  const [error, setError] = useState("");
  const [isWritable, setIsWritable] = useState(false);
  const [ratingsEndpoint, setRatingsEndpoint] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadIndex() {
    try {
      const apiResponse = await fetch("/api/index", { cache: "no-store" });
      if (apiResponse.ok) {
        setIsWritable(true);
        setRatingsEndpoint(LOCAL_RATINGS_ENDPOINT);
        return (await apiResponse.json()) as CalibratorIndex;
      }
    } catch {
      // Static previews do not expose the local Vite write API.
    }

    const staticResponse = await fetch(`calibration-index.json?v=${Date.now()}`, { cache: "no-store" });
    if (!staticResponse.ok) throw new Error("Failed to load vault index");
    const hostedEndpoint = hostedRatingsEndpoint();
    setIsWritable(Boolean(hostedEndpoint));
    setRatingsEndpoint(hostedEndpoint);
    return (await staticResponse.json()) as CalibratorIndex;
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
    const problemRecoveryItems: ReviewQueueItem[] = visibleProblemRecoveries.map((artifact) => ({
      target: "problem_recovery",
      id: artifact.problem_recovery_id,
      artifact,
    }));
    const solutionItems: ReviewQueueItem[] = visibleSolutions.map((artifact) => ({
      target: "solution",
      id: artifact.solution_id,
      artifact,
    }));
    return [...problemRecoveryItems, ...solutionItems];
  }, [visibleProblemRecoveries, visibleSolutions]);
  const activeReviewArtifact =
    ratingTarget === "problem_recovery" ? selectedProblemRecovery : selectedSolution;
  const activeTitle = artifactTitle(activeReviewArtifact);
  const activeIsSubmittable = canSubmitRating(activeReviewArtifact);
  const reviewerIsAllowed = isAllowedRater(reviewerEmail);
  const activeArtifactValue =
    ratingTarget === "problem_recovery"
      ? selectedProblemRecovery?.problem_recovery_id ?? ""
      : selectedSolution?.solution_id ?? "";
  const activeQueueIndex = reviewQueue.findIndex((item) => item.target === ratingTarget && item.id === (ratingTarget === "problem_recovery" ? selectedProblemRecovery?.problem_recovery_id : selectedSolution?.solution_id));
  const nextUnratedItem = useMemo(() => {
    if (reviewQueue.length === 0) return null;
    const start = activeQueueIndex >= 0 ? activeQueueIndex + 1 : 0;
    for (let offset = 0; offset < reviewQueue.length; offset += 1) {
      const candidate = reviewQueue[(start + offset) % reviewQueue.length];
      if (candidate.artifact.human_ratings.length === 0) return candidate;
    }
    return null;
  }, [activeQueueIndex, reviewQueue]);
  const selectedComparisonSet = useMemo(() => {
    const comparisonSetId = selectedSolution?.comparison_set_id;
    if (!comparisonSetId) return null;
    return (index?.comparison_sets ?? []).find((set) => set.comparison_set_id === comparisonSetId) ?? null;
  }, [index?.comparison_sets, selectedSolution?.comparison_set_id]);
  const discoveryContextText = useMemo(() => {
    if (!selectedCase) return "";
    return supplementalMarkdown(selectedCase.body, selectedCase.problem.body);
  }, [selectedCase]);

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

  async function submitRating() {
    if (!selectedCase || !activeReviewArtifact || score === null) return;
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
    setError("");
    setSavedPath("");
    setIsSubmitting(true);

    try {
      const response = await fetch(ratingsEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          case_id: selectedCase.case_id,
          rating_target: ratingTarget,
          solution_id: ratingTarget === "solution" ? selectedSolution?.solution_id : undefined,
          problem_recovery_id:
            ratingTarget === "problem_recovery" ? selectedProblemRecovery?.problem_recovery_id : undefined,
          node_id: activeReviewArtifact.node_id,
          score,
          notes,
          reviewer_email: normalizeRaterEmail(reviewerEmail),
        }),
      });
      const body = (await response.json()) as Partial<RatingSubmitResponse> & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Rating submission failed");
        return;
      }
      const refreshed = await loadIndex();
      setIndex(refreshed);
      setSavedPath(body.relativePath ?? "");
      setNotes("");
      setScore(null);
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
    setScore(null);
    setSavedPath("");
    setSourceDetailsOpen(false);
  }

  function updateReviewerEmail(value: string) {
    setReviewerEmail(value);
    try {
      if (isAllowedRater(value)) {
        window.localStorage.setItem(REVIEWER_STORAGE_KEY, normalizeRaterEmail(value));
      }
    } catch {
      // Local storage is a convenience only; rating validation remains server-side.
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

  return (
    <main className="review-app">
      <header className="review-header">
        <div>
          <p className="eyebrow">Doppl Life</p>
          <h1>Calibrator</h1>
        </div>
      </header>

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
              setScore(null);
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
              setScore(null);
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
              setScore(null);
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
            <button
              type="button"
              className="next-unrated-button"
              disabled={!nextUnratedItem}
              onClick={() => {
                if (nextUnratedItem) selectReviewItem(nextUnratedItem);
              }}
            >
              Next unrated
            </button>
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
              setScore(null);
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
      </section>

      <section className="trace-surface" aria-label="Case and selected artifact review">
        <article className="trace-step case-step">
          <p className="trace-label">Case Study</p>
          <h2>{selectedCase.title}</h2>
          <MarkdownBlock text={selectedCase.body} />
        </article>

        {discoveryContextText ? (
          <article className="trace-step">
            <p className="trace-label">Discovery Context</p>
            <MarkdownBlock text={discoveryContextText} />
          </article>
        ) : null}

        <article className="trace-step selected-step">
          <p className="trace-label">{ratingTarget === "problem_recovery" ? "Growth - Problem Recovery" : "Growth - Doppl"}</p>
          <h2>{activeTitle}</h2>
          {activeReviewArtifact ? <MarkdownBlock text={activeReviewArtifact.body} /> : null}
        </article>

        <section className="source-disclosure">
          <button type="button" onClick={() => setSourceDetailsOpen((open) => !open)}>
            <span>{sourceDetailsOpen ? "Hide source details" : "Show source details"}</span>
            <span>{sourceDetailsOpen ? "−" : "+"}</span>
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
        <label className="field reviewer-field">
          <span>Reviewer email</span>
          <input
            type="email"
            list="reviewer-email-options"
            value={reviewerEmail}
            onChange={(event) => updateReviewerEmail(event.target.value)}
            placeholder="name@gauntletai.com"
          />
          <datalist id="reviewer-email-options">
            {ALLOWED_RATERS.map((rater) => (
              <option key={rater} value={rater} />
            ))}
          </datalist>
          {reviewerEmail && !reviewerIsAllowed ? (
            <span className="field-note">Choose a reviewer from the allow-list.</span>
          ) : null}
        </label>
        <label className="field notes-field">
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={
              ratingTarget === "problem_recovery"
                ? "Optional note on the recovered problem"
                : "Optional note on the doppl"
            }
          />
        </label>
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
        </div>
        <button
          className="submit-button"
          type="button"
          disabled={
            score === null ||
            isSubmitting ||
            !isWritable ||
            !activeIsSubmittable ||
            !reviewerIsAllowed
          }
          onClick={submitRating}
        >
          {isSubmitting ? "Saving..." : `Submit ${ratingTarget === "problem_recovery" ? "problem recovery" : "doppl"} rating`}
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
