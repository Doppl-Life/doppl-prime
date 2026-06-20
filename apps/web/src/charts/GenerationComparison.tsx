import type { JSX } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from "recharts";
import { useFitnessSeries } from "../state/runStore.js";
import { PALETTE } from "../ui/theme.js";

/**
 * Generation-comparison chart (P7.8). Per-generation mean + median +
 * max fitness as grouped bars. The three series use distinct fills,
 * labels, and patterns so the chart remains readable on a projector.
 */

interface GenerationStat {
  generation: number;
  mean: number;
  median: number;
  max: number;
  count: number;
}

function aggregate(rows: readonly { generation: number; total: number }[]): GenerationStat[] {
  const byGen = new Map<number, number[]>();
  for (const r of rows) {
    const list = byGen.get(r.generation) ?? [];
    list.push(r.total);
    byGen.set(r.generation, list);
  }
  return [...byGen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([generation, totals]) => {
      const sorted = [...totals].sort((a, b) => a - b);
      const sum = totals.reduce((a, b) => a + b, 0);
      const median =
        sorted.length % 2 === 1
          ? (sorted[Math.floor(sorted.length / 2)] ?? 0)
          : ((sorted[sorted.length / 2 - 1] ?? 0) + (sorted[sorted.length / 2] ?? 0)) / 2;
      const max = Math.max(...totals);
      return {
        generation,
        mean: sum / totals.length,
        median,
        max,
        count: totals.length,
      };
    });
}

export interface GenerationComparisonProps {
  width?: number;
  height?: number;
}

export function GenerationComparison({
  width = 480,
  height = 280,
}: GenerationComparisonProps): JSX.Element {
  const rows = useFitnessSeries();
  const data = aggregate(rows);
  if (data.length === 0) {
    return (
      <div
        aria-label="Generation comparison"
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--doppl-text-secondary)",
        }}
      >
        No generation data yet.
      </div>
    );
  }
  return (
    <div aria-label="Generation comparison">
      <BarChart width={width} height={height} data={data}>
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
          label={{ value: "Fitness", angle: -90, position: "insideLeft", fill: "#dce8f7" }}
        />
        <Tooltip />
        <Legend />
        <Bar dataKey="mean" name="Mean" fill={PALETTE.cyan} isAnimationActive={false} />
        <Bar dataKey="median" name="Median" fill={PALETTE.orange} isAnimationActive={false} />
        <Bar dataKey="max" name="Max" fill={PALETTE.green} isAnimationActive={false} />
      </BarChart>
    </div>
  );
}
