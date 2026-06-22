import { useEffect, useMemo, useState } from "react";
import type {
  CalibratorIndex,
  CalibratorProblemRecovery,
  CalibratorRating,
  CalibratorSolution,
  RatingSubmitResponse,
} from "./types";

type RatingTarget = "problem_recovery" | "solution";
type ReviewArtifact = CalibratorProblemRecovery | CalibratorSolution;
type ReviewQueueItem =
  | { target: "problem_recovery"; id: string; artifact: CalibratorProblemRecovery }
  | { target: "solution"; id: string; artifact: CalibratorSolution; solutionIndex: number };

function scoreLabel(score: number): string {
  return score > 0 ? `+${score}` : String(score);
}

function blindSolutionLabel(index: number): string {
  return `Solution ${String.fromCharCode(65 + (index % 26))}`;
}

function maskProvenanceText(text: string): string {
  return text
    .replace(/\bCody\b/g, "Kernel")
    .replace(/\bcody\b/g, "kernel")
    .replace(/\bMelissa\b/g, "Kernel")
    .replace(/\bmelissa\b/g, "kernel")
    .replace(/\bMichael\b/g, "Kernel")
    .replace(/\bmichael\b/g, "kernel")
    .replace(/\borigin\/kernel/g, "origin/kernel")
    .replace(/\bbranch solution\b/gi, "source solution")
    .replace(/\bbranch markdown\b/gi, "source markdown");
}

function averageScore(ratings: CalibratorRating[]): number | null {
  if (ratings.length === 0) return null;
  return ratings.reduce((total, rating) => total + rating.score, 0) / ratings.length;
}

function MarkdownBlock({ text }: { text: string }) {
  return (
    <div className="markdown-block">
      {text
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => {
          const key = block.slice(0, 80);
          if (block.startsWith("# ")) return <h3 key={key}>{block.replace(/^# /, "")}</h3>;
          if (block.startsWith("## ")) return <h4 key={key}>{block.replace(/^## /, "")}</h4>;
          if (/^\d+\.\s/m.test(block)) {
            return (
              <ol key={key}>
                {block.split("\n").map((line) => (
                  <li key={line}>{line.replace(/^\d+\.\s*/, "")}</li>
                ))}
              </ol>
            );
          }
          return <p key={key}>{block}</p>;
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

function CalibrationHistory({
  judgeScore,
  ratings,
}: {
  judgeScore?: number;
  ratings: CalibratorRating[];
}) {
  const average = averageScore(ratings);
  const judgeDelta = average !== null && judgeScore !== undefined ? average - judgeScore : null;

  return (
    <section className="calibration-history" aria-label="Human calibration history">
      <div>
        <p className="metric-label">Human avg</p>
        <p className="metric-value">{average === null ? "none" : scoreLabel(Number(average.toFixed(1)))}</p>
      </div>
      <div>
        <p className="metric-label">Ratings</p>
        <p className="metric-value">{ratings.length}</p>
      </div>
      <div>
        <p className="metric-label">Judge delta</p>
        <p className="metric-value">{judgeDelta === null ? "n/a" : scoreLabel(Number(judgeDelta.toFixed(1)))}</p>
      </div>
      <div>
        <p className="metric-label">Last rating</p>
        <p className="metric-value small">{ratings[0]?.submitted_at.slice(0, 10) ?? "none"}</p>
      </div>
    </section>
  );
}

function artifactTitle(artifact: ReviewArtifact | null, blindMode: boolean, solutionIndex: number): string {
  if (!artifact) return "No artifact selected";
  if ("solution_id" in artifact && blindMode && solutionIndex >= 0) return blindSolutionLabel(solutionIndex);
  return artifact.title;
}

function artifactBody(artifact: ReviewArtifact | null, blindMode: boolean): string {
  if (!artifact) return "";
  return blindMode ? maskProvenanceText(artifact.body) : artifact.body;
}

export function App() {
  const [index, setIndex] = useState<CalibratorIndex | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState("fsd-accident-economy");
  const [selectedProblemRecoveryId, setSelectedProblemRecoveryId] = useState<string | null>(null);
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(null);
  const [ratingTarget, setRatingTarget] = useState<RatingTarget>("solution");
  const [blindMode, setBlindMode] = useState(false);
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [error, setError] = useState("");
  const [isWritable, setIsWritable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadIndex() {
    try {
      const apiResponse = await fetch("/api/index");
      if (apiResponse.ok) {
        setIsWritable(true);
        return (await apiResponse.json()) as CalibratorIndex;
      }
    } catch {
      // Static previews do not expose the local Vite write API.
    }

    const staticResponse = await fetch("calibration-index.json");
    if (!staticResponse.ok) throw new Error("Failed to load vault index");
    setIsWritable(false);
    return (await staticResponse.json()) as CalibratorIndex;
  }

  useEffect(() => {
    loadIndex()
      .then((data) => {
        setIndex(data);
        const firstCase = data.cases[0];
        if (firstCase) {
          setSelectedCaseId(firstCase.case_id);
          setSelectedProblemRecoveryId(firstCase.problem_recoveries[0]?.problem_recovery_id ?? null);
          setSelectedSolutionId(firstCase.solutions[0]?.solution_id ?? null);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load vault index");
      });
  }, []);

  const selectedCase = useMemo(
    () => index?.cases.find((caseItem) => caseItem.case_id === selectedCaseId) ?? null,
    [index, selectedCaseId],
  );
  const visibleSolutions = useMemo(() => {
    if (!selectedCase) return [];
    return selectedCase.solutions;
  }, [selectedCase]);
  const selectedSolution = useMemo(
    () =>
      visibleSolutions.find((solution) => solution.solution_id === selectedSolutionId) ??
      visibleSolutions[0] ??
      null,
    [visibleSolutions, selectedSolutionId],
  );
  const selectedSolutionIndex = selectedSolution
    ? visibleSolutions.findIndex((solution) => solution.solution_id === selectedSolution.solution_id)
    : -1;
  const visibleProblemRecoveries = useMemo(() => {
    if (!selectedCase) return [];
    return selectedCase.problem_recoveries;
  }, [selectedCase]);
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
    const solutionItems: ReviewQueueItem[] = visibleSolutions.map((artifact, solutionIndex) => ({
      target: "solution",
      id: artifact.solution_id,
      artifact,
      solutionIndex,
    }));
    return [...problemRecoveryItems, ...solutionItems];
  }, [visibleProblemRecoveries, visibleSolutions]);
  const activeReviewArtifact =
    ratingTarget === "problem_recovery" ? selectedProblemRecovery : selectedSolution;
  const activeSolutionIndex = ratingTarget === "solution" ? selectedSolutionIndex : -1;
  const activeTitle = artifactTitle(activeReviewArtifact, blindMode, activeSolutionIndex);
  const activeRatingCount = activeReviewArtifact?.human_ratings.length ?? 0;
  const activeArtifactValue =
    ratingTarget === "problem_recovery"
      ? `problem_recovery:${selectedProblemRecovery?.problem_recovery_id ?? ""}`
      : `solution:${selectedSolution?.solution_id ?? ""}`;
  const activeQueueIndex = reviewQueue.findIndex((item) => item.target === ratingTarget && item.id === (ratingTarget === "problem_recovery" ? selectedProblemRecovery?.problem_recovery_id : selectedSolution?.solution_id));
  const unratedCount = reviewQueue.filter((item) => item.artifact.human_ratings.length === 0).length;
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

  async function submitRating() {
    if (!selectedCase || !activeReviewArtifact || score === null) return;
    if (!isWritable) {
      setError("Static preview is read-only. Run the local calibrator dev server to save ratings.");
      return;
    }
    setError("");
    setSavedPath("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          case_id: selectedCase.case_id,
          rating_target: ratingTarget,
          solution_id: ratingTarget === "solution" ? selectedSolution?.solution_id : undefined,
          problem_recovery_id:
            ratingTarget === "problem_recovery" ? selectedProblemRecovery?.problem_recovery_id : undefined,
          score,
          notes,
          reviewer_email: reviewerEmail,
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

  if (!index || !selectedCase) {
    return (
      <main className="app-shell">
        <p className="eyebrow">Doppl Life</p>
        <h1>Calibrator</h1>
        <p>Loading vault index...</p>
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
        <label className="toggle-field compact">
          <input
            type="checkbox"
            checked={blindMode}
            onChange={(event) => setBlindMode(event.target.checked)}
          />
          <span>Blind</span>
        </label>
      </header>

      <section className="review-controls" aria-label="Review setup">
        <label className="field">
          <span>Case study</span>
          <select
            value={selectedCaseId}
            onChange={(event) => {
              const nextCase = index.cases.find((item) => item.case_id === event.target.value);
              setSelectedCaseId(event.target.value);
              setSelectedProblemRecoveryId(nextCase?.problem_recoveries[0]?.problem_recovery_id ?? null);
              setSelectedSolutionId(nextCase?.solutions[0]?.solution_id ?? null);
              setRatingTarget(nextCase?.problem_recoveries[0] ? "problem_recovery" : "solution");
              setScore(null);
              setSavedPath("");
              setSourceDetailsOpen(false);
            }}
          >
            {index.cases.map((caseItem) => (
              <option key={caseItem.case_id} value={caseItem.case_id}>
                {caseItem.title}
              </option>
            ))}
          </select>
        </label>

        <label className="field artifact-select-field">
          <span>Review artifact</span>
          <select
            aria-label="Review artifact"
            value={activeArtifactValue}
            onChange={(event) => {
              const [nextTarget, nextId] = event.target.value.split(":");
              if (nextTarget === "problem_recovery") {
                setRatingTarget("problem_recovery");
                setSelectedProblemRecoveryId(nextId);
              } else {
                setRatingTarget("solution");
                setSelectedSolutionId(nextId);
              }
              setScore(null);
              setSavedPath("");
              setSourceDetailsOpen(false);
            }}
          >
            {visibleProblemRecoveries.map((recovery) => (
              <option key={recovery.problem_recovery_id} value={`problem_recovery:${recovery.problem_recovery_id}`}>
                {recovery.title} ({recovery.human_ratings.length} ratings)
              </option>
            ))}
            {visibleSolutions.map((solution, index) => (
              <option key={solution.solution_id} value={`solution:${solution.solution_id}`}>
                {blindMode ? blindSolutionLabel(index) : solution.title} ({solution.human_ratings.length} ratings)
              </option>
            ))}
          </select>
        </label>

        <div className="review-status" aria-label="Current review status">
          <span>{ratingTarget === "problem_recovery" ? "Problem recovery" : "Solution"}</span>
          <strong>{activeRatingCount} ratings</strong>
          <strong>{unratedCount} unrated</strong>
          {!isWritable ? <em>Static preview</em> : null}
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
      </section>

      <section className="trace-surface" aria-label="Case and selected artifact review">
        <article className="trace-step case-step">
          <p className="trace-label">Case Study</p>
          <h2>{selectedCase.title}</h2>
          <MarkdownBlock text={selectedCase.body} />
        </article>

        <article className="trace-step">
          <p className="trace-label">Stated Context</p>
          <MarkdownBlock text={selectedCase.problem.body} />
        </article>

        <article className="trace-step selected-step">
          <p className="trace-label">{ratingTarget === "problem_recovery" ? "Problem Recovery" : "Solution"}</p>
          <h2>{activeTitle}</h2>
          {blindMode ? (
            <p className="blind-note">Source labels, branch names, and provenance metadata are hidden.</p>
          ) : null}
          {activeReviewArtifact ? <MarkdownBlock text={artifactBody(activeReviewArtifact, blindMode)} /> : null}
          {activeReviewArtifact ? (
            <CalibrationHistory
              ratings={activeReviewArtifact.human_ratings}
              judgeScore={"judge_score" in activeReviewArtifact ? activeReviewArtifact.judge_score : undefined}
            />
          ) : null}
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
              {!blindMode && activeReviewArtifact.adapter_notes ? (
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
            value={reviewerEmail}
            onChange={(event) => setReviewerEmail(event.target.value)}
            placeholder="name@gauntletai.com"
          />
        </label>
        <label className="field notes-field">
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={
              ratingTarget === "problem_recovery"
                ? "Optional note on the recovered problem"
                : "Optional note on the solution"
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
          disabled={score === null || isSubmitting || !isWritable || !activeReviewArtifact}
          onClick={submitRating}
        >
          {isSubmitting ? "Saving..." : `Submit ${ratingTarget === "problem_recovery" ? "problem" : "solution"} rating`}
        </button>
        {!isWritable ? <p className="mode-note">Rating writes require the local dev server.</p> : null}
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
