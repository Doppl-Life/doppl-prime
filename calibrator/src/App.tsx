import { useEffect, useMemo, useState } from "react";
import type { CalibratorIndex, CalibratorSolution, RatingSubmitResponse } from "./types";

const scores = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const verdicts = ["dead", "obvious", "interesting", "investigate", "keeper"];

function scoreLabel(score: number): string {
  return score > 0 ? `+${score}` : String(score);
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

function KernelMeta({ solution }: { solution: CalibratorSolution }) {
  const fields = [
    ["kernel", solution.kernel],
    ["class", solution.output_class],
    ["phase", solution.phase],
    ["subtype", solution.subtype],
    ["branch", solution.branch],
    ["run", solution.run_id],
    ["generation", solution.generation_id],
    ["agenome", solution.agenome_id],
    ["candidate", solution.candidate_id],
    ["judge", solution.judge_score?.toString()],
    ["fitness", solution.fitness_score?.toString()],
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

export function App() {
  const [index, setIndex] = useState<CalibratorIndex | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState("fsd-accident-economy");
  const [selectedSolutionId, setSelectedSolutionId] = useState<string | null>(null);
  const [caseOpen, setCaseOpen] = useState(true);
  const [problemOpen, setProblemOpen] = useState(true);
  const [solutionOpen, setSolutionOpen] = useState(true);
  const [score, setScore] = useState<number | null>(null);
  const [verdict, setVerdict] = useState("");
  const [notes, setNotes] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [savedPath, setSavedPath] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/index")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load vault index");
        return response.json() as Promise<CalibratorIndex>;
      })
      .then((data) => {
        setIndex(data);
        const firstCase = data.cases[0];
        if (firstCase) {
          setSelectedCaseId(firstCase.case_id);
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
  const selectedSolution = useMemo(
    () =>
      selectedCase?.solutions.find((solution) => solution.solution_id === selectedSolutionId) ??
      selectedCase?.solutions[0] ??
      null,
    [selectedCase, selectedSolutionId],
  );

  async function submitRating() {
    if (!selectedCase || !selectedSolution || score === null) return;
    setError("");
    setSavedPath("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          case_id: selectedCase.case_id,
          solution_id: selectedSolution.solution_id,
          score,
          verdict: verdict || undefined,
          notes,
          reviewer_email: reviewerEmail,
        }),
      });
      const body = (await response.json()) as Partial<RatingSubmitResponse> & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "Rating submission failed");
        return;
      }
      setSavedPath(body.relativePath ?? "");
      setNotes("");
      setScore(null);
      setVerdict("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rating submission failed");
    } finally {
      setIsSubmitting(false);
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
    <main className="workspace">
      <aside className="sidebar" aria-label="Calibration controls">
        <p className="eyebrow">Doppl Life</p>
        <h1>Calibrator</h1>

        <label className="field">
          <span>Case study</span>
          <select
            value={selectedCaseId}
            onChange={(event) => {
              const nextCase = index.cases.find((item) => item.case_id === event.target.value);
              setSelectedCaseId(event.target.value);
              setSelectedSolutionId(nextCase?.solutions[0]?.solution_id ?? null);
              setScore(null);
              setVerdict("");
              setSavedPath("");
            }}
          >
            {index.cases.map((caseItem) => (
              <option key={caseItem.case_id} value={caseItem.case_id}>
                {caseItem.title}
              </option>
            ))}
          </select>
        </label>

        <section className="solution-list" aria-label="Solutions">
          <h2>Solutions</h2>
          {selectedCase.solutions.map((solution) => (
            <button
              className={solution.solution_id === selectedSolution?.solution_id ? "selected" : ""}
              key={solution.solution_id}
              type="button"
              onClick={() => {
                setSelectedSolutionId(solution.solution_id);
                setScore(null);
                setVerdict("");
                setSavedPath("");
              }}
            >
              <span>{solution.title}</span>
              <small>{solution.kernel ?? solution.source_type}</small>
            </button>
          ))}
        </section>
      </aside>

      <section className="review-surface" aria-label="Case and solution review">
        <header className="surface-header">
          <div>
            <p className="eyebrow">Case Study</p>
            <h2>{selectedCase.title}</h2>
          </div>
          <p>{selectedCase.solutions.length} solutions in vault</p>
        </header>

        <section className="context-grid">
          <article className="panel">
            <button className="panel-toggle" type="button" onClick={() => setCaseOpen((open) => !open)}>
              <span>Case details</span>
              <span>{caseOpen ? "Collapse" : "Expand"}</span>
            </button>
            {caseOpen ? <MarkdownBlock text={selectedCase.body} /> : null}
          </article>
          <article className="panel">
            <button className="panel-toggle" type="button" onClick={() => setProblemOpen((open) => !open)}>
              <span>Problem context</span>
              <span>{problemOpen ? "Collapse" : "Expand"}</span>
            </button>
            {problemOpen ? <MarkdownBlock text={selectedCase.problem.body} /> : null}
          </article>
        </section>

        {selectedSolution ? (
          <article className="solution-detail">
            <button className="panel-toggle" type="button" onClick={() => setSolutionOpen((open) => !open)}>
              <span>{selectedSolution.title}</span>
              <span>{solutionOpen ? "Collapse" : "Expand"}</span>
            </button>
            <KernelMeta solution={selectedSolution} />
            {solutionOpen ? <MarkdownBlock text={selectedSolution.body} /> : null}
          </article>
        ) : (
          <p>No solution selected.</p>
        )}
      </section>

      <aside className="rating-panel" aria-label="Rating controls">
        <h2>Solution rating</h2>
        <div className="score-row" aria-label="Score">
          {scores.map((value) => (
            <button
              className={score === value ? "score selected" : "score"}
              key={value}
              type="button"
              onClick={() => setScore(value)}
              aria-pressed={score === value}
            >
              {scoreLabel(value)}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Reviewer email</span>
          <input
            type="email"
            value={reviewerEmail}
            onChange={(event) => setReviewerEmail(event.target.value)}
            placeholder="name@gauntletai.com"
          />
        </label>
        <div className="field">
          <span>Verdict</span>
          <div className="verdict-row" aria-label="Verdict">
            {verdicts.map((value) => (
              <button
                className={verdict === value ? "verdict selected" : "verdict"}
                key={value}
                type="button"
                onClick={() => setVerdict((current) => (current === value ? "" : value))}
                aria-pressed={verdict === value}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span>Notes</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="What made this solution useful or weak?"
          />
        </label>
        <button
          className="submit-button"
          type="button"
          disabled={score === null || isSubmitting}
          onClick={submitRating}
        >
          {isSubmitting ? "Saving..." : "Submit rating"}
        </button>
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        {savedPath ? <p className="saved-path">Saved to {savedPath}</p> : null}
      </aside>
    </main>
  );
}
