import type { JSX } from "react";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { useFitnessSeries } from "../state/runStore.js";
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
  const { candidateIds, data } = normalize(rows);
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
          stroke="#000"
          tick={{ fill: "var(--doppl-text-primary)" }}
          label={{ value: "Generation", position: "insideBottom", offset: -4, fill: "#14150c" }}
        />
        <YAxis
          stroke="#000"
          tick={{ fill: "var(--doppl-text-primary)" }}
          label={{ value: "Fitness total", angle: -90, position: "insideLeft", fill: "#14150c" }}
        />
        <Tooltip />
        <Legend />
        {candidateIds.map((id, idx) => {
          const theme = pickSeriesTheme(idx);
          return (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              name={id}
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
    </div>
  );
}
