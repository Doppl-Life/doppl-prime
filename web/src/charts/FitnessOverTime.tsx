import type { JSX } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { useAgenomeDisplayNames, useFitnessSeries, useRunState } from "../state/runStore.js";
import { pickSeriesTheme } from "./chartTheme.js";

/**
 * Fitness-over-time chart (P7.8). Top-5 candidates' fitness.total
 * plotted by generationIndex. Series encoded with stroke +
 * strokeDasharray + dot shape + label — never color alone.
 *
 * Renders meaningfully with zero/partial data: empty series shows
 * an empty axis pair, allowing the chart to mount before fitness
 * events arrive.
 */

const TOP_N = 5;

interface FitnessSeriesPoint {
  generation: number;
  [candidateId: string]: number;
}

interface NormalizedSeries {
  candidateIds: string[];
  data: FitnessSeriesPoint[];
}

function normalize(
  rows: readonly { candidateId: string; generation: number; total: number }[],
): NormalizedSeries {
  // Pick top-N candidates by latest-generation fitness.
  const latestByCandidate = new Map<string, number>();
  for (const r of rows) {
    const prev = latestByCandidate.get(r.candidateId) ?? Number.NEGATIVE_INFINITY;
    if (r.total > prev) latestByCandidate.set(r.candidateId, r.total);
  }
  const candidateIds = [...latestByCandidate.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([id]) => id);

  const generations = new Set<number>();
  for (const r of rows) generations.add(r.generation);
  const sortedGens = [...generations].sort((a, b) => a - b);

  const data: FitnessSeriesPoint[] = sortedGens.map((gen) => {
    const point: FitnessSeriesPoint = { generation: gen };
    for (const id of candidateIds) {
      const row = rows.find((r) => r.candidateId === id && r.generation === gen);
      if (row) point[id] = row.total;
    }
    return point;
  });
  return { candidateIds, data };
}

export interface FitnessOverTimeProps {
  width?: number;
  height?: number;
}

export function FitnessOverTime({ width = 480, height = 280 }: FitnessOverTimeProps): JSX.Element {
  const rows = useFitnessSeries();
  const state = useRunState();
  const personaNames = useAgenomeDisplayNames();
  const { candidateIds, data } = normalize(rows);

  // Readable legend label per candidate: short title (truncated) + persona,
  // falling back to "Idea <last-6>" if title isn't loaded yet.
  const labelFor = (candidateId: string): string => {
    const cand = state.candidates[candidateId];
    const persona = cand?.agenomeId ? personaNames[cand.agenomeId] : undefined;
    const title = cand?.title?.trim();
    if (title) {
      const shortTitle = title.length > 28 ? `${title.slice(0, 27)}…` : title;
      return persona ? `${shortTitle} · ${persona}` : shortTitle;
    }
    return persona ? `${persona} · Idea ${candidateId.slice(-6)}` : `Idea ${candidateId.slice(-6)}`;
  };

  if (data.length === 0 || candidateIds.length === 0) {
    return (
      <div
        aria-label="Fitness over time"
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--doppl-text-secondary)",
        }}
      >
        No fitness data yet.
      </div>
    );
  }
  return (
    <div aria-label="Fitness over time">
      <LineChart width={width} height={height} data={data}>
        <CartesianGrid stroke="var(--doppl-border)" strokeDasharray="2 2" />
        <XAxis
          dataKey="generation"
          stroke="var(--doppl-border)"
          tick={{ fill: "var(--doppl-text-primary)" }}
          label={{ value: "Generation", position: "insideBottom", offset: -4, fill: "#dce8f7" }}
        />
        <YAxis
          stroke="var(--doppl-border)"
          tick={{ fill: "var(--doppl-text-primary)" }}
          label={{ value: "Fitness total", angle: -90, position: "insideLeft", fill: "#dce8f7" }}
        />
        <Tooltip />
        {candidateIds.map((id, idx) => {
          const theme = pickSeriesTheme(idx);
          return (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={labelFor(id)}
              stroke={theme.stroke}
              strokeDasharray={theme.strokeDasharray}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          );
        })}
      </LineChart>
      {/* Custom legend below the full-width plot. Recharts' built-in vertical
          legend reserves space beside the chart, which squishes it — this
          keeps the chart intact and stacks compact, left-aligned rows. */}
      <ul
        style={{
          listStyle: "none",
          margin: "8px 0 0",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          fontSize: 12,
        }}
      >
        {candidateIds.map((id, idx) => {
          const theme = pickSeriesTheme(idx);
          return (
            <li
              key={id}
              style={{ display: "flex", alignItems: "center", gap: 8, color: theme.stroke }}
            >
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 16,
                  borderTop: `2px ${theme.strokeDasharray ? "dashed" : "solid"} ${theme.stroke}`,
                }}
              />
              <span>{labelFor(id)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
