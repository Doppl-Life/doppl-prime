import * as React from "react";

/**
 * The run-wide energy budget as a draining charge — the visible "finite by
 * construction" signal. Segmented meter + mono spent/budget; glow shrinks as
 * energy drains. Thresholds: nominal / warning (<30% left) / critical / exhausted.
 */
export interface RunEnergyGaugeProps {
  spent: number;
  budget: number;
  mode?: "live" | "replay";
  showLabel?: boolean;
  unit?: string;
}
export function RunEnergyGauge(props: RunEnergyGaugeProps): React.JSX.Element;
