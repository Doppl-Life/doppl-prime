import { useMemo, useState } from "react";
import type {
  CalibratorCase,
  CalibratorIndex,
  CalibratorProblemRecovery,
  CalibratorRating,
  CalibratorSolution,
} from "./types";
import { reviewMode } from "./reviewability";

type AgoraTarget = "problem_recovery" | "solution";
type SortMode = "disagreement" | "human" | "judge" | "ratings" | "polarization" | "title";

interface AgoraArtifact {
  id: string;
  target: AgoraTarget;
  targetLabel: string;
  caseId: string;
  caseTitle: string;
  title: string;
  nodeId: string;
  sourcePath: string;
  body: string;
  judgeScore: number | null;
  humanMean: number | null;
  humanMedian: number | null;
  ratingCount: number;
  standardDeviation: number | null;
  disagreement: number | null;
  ratings: CalibratorRating[];
  verdict: AgoraVerdict;
}

interface AgoraVerdict {
  label: string;
  tone: "aligned" | "missed" | "overrated" | "polarizing" | "thin" | "unscored";
  detail: string;
}

function targetId(artifact: CalibratorProblemRecovery | CalibratorSolution, target: AgoraTarget): string {
  return target === "problem_recovery"
    ? (artifact as CalibratorProblemRecovery).problem_recovery_id
    : (artifact as CalibratorSolution).solution_id;
}

function boundedScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < -5 || value > 5) return null;
  return value;
}

function judgeScore(artifact: CalibratorProblemRecovery | CalibratorSolution): number | null {
  const scoreFromEnvelope = boundedScore(artifact.scores?.judge);
  if (scoreFromEnvelope !== null) return scoreFromEnvelope;
  if ("judge_score" in artifact) {
    const score = boundedScore(artifact.judge_score);
    if (score !== null) return score;
  }
  if ("fitness_score" in artifact) {
    const score = boundedScore(artifact.fitness_score);
    if (score !== null) return score;
  }
  return null;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint];
}

function standardDeviation(values: number[], average: number | null): number | null {
  if (values.length < 2 || average === null) return null;
  const variance = mean(values.map((value) => (value - average) ** 2));
  return variance === null ? null : Math.sqrt(variance);
}

function scoreText(value: number | null, digits = 1): string {
  if (value === null) return "n/a";
  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

function verdictFor(humanMean: number | null, judge: number | null, ratingCount: number, stdev: number | null): AgoraVerdict {
  if (ratingCount === 0 || humanMean === null) {
    return {
      label: "Awaiting agora",
      tone: "thin",
      detail: "No human ratings yet. This artifact is still invisible to the Agora signal.",
    };
  }
  if (judge === null) {
    return {
      label: "Human-only signal",
      tone: "unscored",
      detail: "Humans have rated this artifact, but no judge score is available to compare against.",
    };
  }
  if (stdev !== null && stdev >= 2) {
    return {
      label: "Polarizing",
      tone: "polarizing",
      detail: "Human raters disagree strongly. This may need a closer qualitative read.",
    };
  }
  const delta = humanMean - judge;
  if (delta >= 2) {
    return {
      label: "Judge missed",
      tone: "missed",
      detail: "Humans rated this materially higher than the judge did.",
    };
  }
  if (delta <= -2) {
    return {
      label: "Judge overrated",
      tone: "overrated",
      detail: "The judge liked this more than the human Agora did.",
    };
  }
  return {
    label: "Aligned",
    tone: "aligned",
    detail: "Human ratings and judge score are directionally close.",
  };
}

function flattenAgoraArtifacts(index: CalibratorIndex): AgoraArtifact[] {
  return index.cases.flatMap((caseItem) => {
    const fromRecoveries = caseItem.problem_recoveries
      .filter((artifact) => reviewMode(artifact) === "primary")
      .map((artifact) => toAgoraArtifact(caseItem, artifact, "problem_recovery"));
    const fromSolutions = caseItem.solutions
      .filter((artifact) => reviewMode(artifact) === "primary")
      .map((artifact) => toAgoraArtifact(caseItem, artifact, "solution"));
    return [...fromRecoveries, ...fromSolutions];
  });
}

function toAgoraArtifact(
  caseItem: CalibratorCase,
  artifact: CalibratorProblemRecovery | CalibratorSolution,
  target: AgoraTarget,
): AgoraArtifact {
  const scores = artifact.human_ratings.map((rating) => rating.score);
  const humanMean = mean(scores);
  const humanMedian = median(scores);
  const stdev = standardDeviation(scores, humanMean);
  const judge = judgeScore(artifact);
  const disagreement = humanMean === null || judge === null ? null : humanMean - judge;
  return {
    id: `${target}:${targetId(artifact, target)}`,
    target,
    targetLabel: target === "problem_recovery" ? "Problem recovery" : "Doppl",
    caseId: caseItem.case_id,
    caseTitle: caseItem.title,
    title: artifact.title,
    nodeId: artifact.node_id ?? targetId(artifact, target),
    sourcePath: artifact.source_path ?? "",
    body: artifact.body,
    judgeScore: judge,
    humanMean,
    humanMedian,
    ratingCount: artifact.human_ratings.length,
    standardDeviation: stdev,
    disagreement,
    ratings: artifact.human_ratings,
    verdict: verdictFor(humanMean, judge, artifact.human_ratings.length, stdev),
  };
}

function cleanExcerpt(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\b(GROWTH\s*[—-]\s*(PROBLEM RECOVERY|DOPPL)|TRACE|DISCOVERY|EVALUATION|PATH NEXT)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 520);
}

function ratingDistribution(ratings: CalibratorRating[]): Array<{ score: number; count: number }> {
  const counts = new Map<number, number>();
  for (let score = -5; score <= 5; score += 1) counts.set(score, 0);
  for (const rating of ratings) counts.set(rating.score, (counts.get(rating.score) ?? 0) + 1);
  return Array.from(counts, ([score, count]) => ({ score, count }));
}

function sortArtifacts(artifacts: AgoraArtifact[], sortMode: SortMode): AgoraArtifact[] {
  const copy = [...artifacts];
  copy.sort((a, b) => {
    if (sortMode === "human") return (b.humanMean ?? -Infinity) - (a.humanMean ?? -Infinity);
    if (sortMode === "judge") return (b.judgeScore ?? -Infinity) - (a.judgeScore ?? -Infinity);
    if (sortMode === "ratings") return b.ratingCount - a.ratingCount;
    if (sortMode === "polarization") return (b.standardDeviation ?? -Infinity) - (a.standardDeviation ?? -Infinity);
    if (sortMode === "title") return a.title.localeCompare(b.title);
    return Math.abs(b.disagreement ?? 0) - Math.abs(a.disagreement ?? 0);
  });
  return copy;
}

function pointPosition(score: number): number {
  return ((score + 5) / 10) * 100;
}

function AgoraScatter({
  artifacts,
  selectedId,
  onSelect,
}: {
  artifacts: AgoraArtifact[];
  selectedId: string;
  onSelect(id: string): void;
}) {
  const scored = artifacts.filter((artifact) => artifact.humanMean !== null && artifact.judgeScore !== null);
  return (
    <section className="agora-panel agora-scatter-panel" aria-label="Judge to human score map">
      <div className="agora-section-heading">
        <div>
          <p className="agora-kicker">Map</p>
          <h2>Judge vs Agora</h2>
        </div>
        <p>{scored.length} comparable artifacts</p>
      </div>
      <div className="agora-scatter" role="img" aria-label="Scatterplot of judge scores against average human scores">
        <div className="agora-axis-label agora-axis-y">Human average</div>
        <div className="agora-axis-label agora-axis-x">Judge score</div>
        <div className="agora-quadrant q-top-left">Humans saw value</div>
        <div className="agora-quadrant q-bottom-right">Judge was warmer</div>
        {scored.map((artifact) => (
          <button
            type="button"
            key={artifact.id}
            className={`agora-point ${artifact.verdict.tone} ${artifact.id === selectedId ? "selected" : ""}`}
            style={{
              left: `${pointPosition(artifact.judgeScore ?? 0)}%`,
              bottom: `${pointPosition(artifact.humanMean ?? 0)}%`,
            }}
            title={`${artifact.title}: human ${scoreText(artifact.humanMean)}, judge ${scoreText(artifact.judgeScore)}`}
            onClick={() => onSelect(artifact.id)}
          />
        ))}
      </div>
    </section>
  );
}

function AgoraInspector({ artifact }: { artifact: AgoraArtifact | null }) {
  if (!artifact) {
    return (
      <aside className="agora-panel agora-inspector">
        <p className="agora-empty">Select an artifact to inspect its ratings.</p>
      </aside>
    );
  }

  const distribution = ratingDistribution(artifact.ratings);
  const maxCount = Math.max(1, ...distribution.map((item) => item.count));
  return (
    <aside className="agora-panel agora-inspector">
      <p className="agora-kicker">{artifact.targetLabel}</p>
      <h2>{artifact.title}</h2>
      <p className="agora-case-line">{artifact.caseTitle}</p>
      <div className={`agora-verdict ${artifact.verdict.tone}`}>
        <strong>{artifact.verdict.label}</strong>
        <span>{artifact.verdict.detail}</span>
      </div>
      <div className="agora-score-grid" aria-label="Score comparison">
        <div>
          <span>Human mean</span>
          <strong>{scoreText(artifact.humanMean)}</strong>
        </div>
        <div>
          <span>Judge</span>
          <strong>{scoreText(artifact.judgeScore)}</strong>
        </div>
        <div>
          <span>Delta</span>
          <strong>{scoreText(artifact.disagreement)}</strong>
        </div>
        <div>
          <span>Ratings</span>
          <strong>{artifact.ratingCount}</strong>
        </div>
      </div>
      <section className="agora-distribution" aria-label="Human rating distribution">
        <h3>Human distribution</h3>
        {distribution.map((item) => (
          <div className="agora-bar-row" key={item.score}>
            <span>{scoreText(item.score, 0)}</span>
            <div>
              <i style={{ width: `${(item.count / maxCount) * 100}%` }} />
            </div>
            <b>{item.count}</b>
          </div>
        ))}
      </section>
      <section className="agora-raters" aria-label="Individual human ratings">
        <h3>Rater notes</h3>
        {artifact.ratings.length > 0 ? (
          artifact.ratings.map((rating) => (
            <div className="agora-rater-row" key={rating.rating_id}>
              <span>{rating.reviewer_email ?? rating.reviewer_name ?? "Unknown reviewer"}</span>
              <strong>{scoreText(rating.score, 0)}</strong>
            </div>
          ))
        ) : (
          <p>No human ratings have been submitted yet.</p>
        )}
      </section>
      <section className="agora-excerpt">
        <h3>Artifact excerpt</h3>
        <p>{cleanExcerpt(artifact.body) || "No artifact text available."}</p>
      </section>
    </aside>
  );
}

export function AgoraApp({ index }: { index: CalibratorIndex }) {
  const artifacts = useMemo(() => flattenAgoraArtifacts(index), [index]);
  const [caseId, setCaseId] = useState("all");
  const [target, setTarget] = useState<"all" | AgoraTarget>("all");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("disagreement");
  const [selectedId, setSelectedId] = useState(() => artifacts[0]?.id ?? "");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const subset = artifacts.filter((artifact) => {
      const caseMatches = caseId === "all" || artifact.caseId === caseId;
      const targetMatches = target === "all" || artifact.target === target;
      const queryMatches =
        !normalizedQuery ||
        `${artifact.title} ${artifact.caseTitle} ${artifact.nodeId} ${artifact.sourcePath}`.toLowerCase().includes(normalizedQuery);
      return caseMatches && targetMatches && queryMatches;
    });
    return sortArtifacts(subset, sortMode);
  }, [artifacts, caseId, query, sortMode, target]);

  const selectedArtifact =
    filtered.find((artifact) => artifact.id === selectedId) ??
    artifacts.find((artifact) => artifact.id === selectedId) ??
    filtered[0] ??
    null;

  const ratingCount = artifacts.reduce((sum, artifact) => sum + artifact.ratingCount, 0);
  const ratedArtifacts = artifacts.filter((artifact) => artifact.ratingCount > 0);
  const comparableArtifacts = artifacts.filter((artifact) => artifact.humanMean !== null && artifact.judgeScore !== null);
  const averageHuman = mean(ratedArtifacts.map((artifact) => artifact.humanMean).filter((score): score is number => score !== null));
  const largestDisagreement = comparableArtifacts.reduce<AgoraArtifact | null>((current, artifact) => {
    if (!current) return artifact;
    return Math.abs(artifact.disagreement ?? 0) > Math.abs(current.disagreement ?? 0) ? artifact : current;
  }, null);

  return (
    <main className="agora-app">
      <section className="agora-hero">
        <div>
          <p className="agora-kicker">Doppl Life</p>
          <h1>Agora</h1>
          <p>
            Compare the human ratings from the Calibrator with the kernel judge scores for every problem recovery and doppl.
            Use this page to spot agreement, judge misses, overrating, and polarizing artifacts.
          </p>
        </div>
        <div className="agora-legend" aria-label="How to read Agora">
          <span><i className="aligned" /> Aligned</span>
          <span><i className="missed" /> Judge missed</span>
          <span><i className="overrated" /> Judge overrated</span>
          <span><i className="polarizing" /> Polarizing</span>
        </div>
      </section>

      <section className="agora-metrics" aria-label="Agora summary">
        <div>
          <span>Artifacts with ratings</span>
          <strong>{ratedArtifacts.length}</strong>
        </div>
        <div>
          <span>Total human ratings</span>
          <strong>{ratingCount}</strong>
        </div>
        <div>
          <span>Average human score</span>
          <strong>{scoreText(averageHuman)}</strong>
        </div>
        <div>
          <span>Largest disagreement</span>
          <strong>{largestDisagreement ? scoreText(largestDisagreement.disagreement) : "n/a"}</strong>
        </div>
      </section>

      <section className="agora-controls" aria-label="Agora filters">
        <label className="field">
          <span>Case study</span>
          <select value={caseId} onChange={(event) => setCaseId(event.target.value)}>
            <option value="all">All case studies</option>
            {index.cases.map((caseItem) => (
              <option key={caseItem.case_id} value={caseItem.case_id}>
                {caseItem.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Artifact type</span>
          <select value={target} onChange={(event) => setTarget(event.target.value as "all" | AgoraTarget)}>
            <option value="all">Problem recoveries and doppls</option>
            <option value="problem_recovery">Problem recoveries</option>
            <option value="solution">Doppls</option>
          </select>
        </label>
        <label className="field">
          <span>Sort</span>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="disagreement">Largest judge-human gap</option>
            <option value="human">Highest human score</option>
            <option value="judge">Highest judge score</option>
            <option value="ratings">Most human ratings</option>
            <option value="polarization">Most polarizing</option>
            <option value="title">Title</option>
          </select>
        </label>
        <label className="field agora-search">
          <span>Search</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find title, case, node, or path"
          />
        </label>
      </section>

      <div className="agora-workspace">
        <div className="agora-main-column">
          <AgoraScatter artifacts={filtered} selectedId={selectedArtifact?.id ?? ""} onSelect={setSelectedId} />
          <section className="agora-panel" aria-label="Agora artifacts">
            <div className="agora-section-heading">
              <div>
                <p className="agora-kicker">Artifacts</p>
                <h2>{filtered.length} results</h2>
              </div>
              <p>Human average minus judge score is shown as delta.</p>
            </div>
            <div className="agora-table" role="table" aria-label="Human and judge comparison table">
              <div className="agora-table-head" role="row">
                <span>Artifact</span>
                <span>Human</span>
                <span>Judge</span>
                <span>Delta</span>
                <span>Status</span>
              </div>
              {filtered.map((artifact) => (
                <button
                  type="button"
                  className={`agora-table-row ${artifact.id === selectedArtifact?.id ? "selected" : ""}`}
                  key={artifact.id}
                  onClick={() => setSelectedId(artifact.id)}
                  role="row"
                >
                  <span className="agora-artifact-title">
                    <strong>{artifact.title}</strong>
                    <small>{artifact.targetLabel} · {artifact.caseTitle}</small>
                  </span>
                  <span>{scoreText(artifact.humanMean)}</span>
                  <span>{scoreText(artifact.judgeScore)}</span>
                  <span>{scoreText(artifact.disagreement)}</span>
                  <span><i className={`agora-status ${artifact.verdict.tone}`}>{artifact.verdict.label}</i></span>
                </button>
              ))}
            </div>
          </section>
        </div>
        <AgoraInspector artifact={selectedArtifact} />
      </div>
    </main>
  );
}
