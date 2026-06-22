import * as React from "react";

/**
 * The length-is-truth meter behind energy, novelty, and fitness. The fill LENGTH
 * carries the value; color only grades it; a mono number sits alongside. Never
 * communicate these quantities by hue alone.
 */
export interface MeterProps {
  /** Normalized 0..1. */
  value: number;
  /** Grades the fill color + glow. fitness = low/mid/high thresholds; energy = drains + glows; novelty = violet. */
  kind?: "fitness" | "novelty" | "energy";
  /** Mono label to the left (e.g. "novelty", an agenome id). */
  label?: string;
  /** Override the numeric readout (e.g. "61%", "0.84"). Defaults to value.toFixed(2). */
  valueLabel?: string;
  showValue?: boolean;
  /** novelty_scoring_degraded → striped fill + "~est" flag. */
  degraded?: boolean;
  height?: number;
  style?: React.CSSProperties;
}

export function Meter(props: MeterProps): React.JSX.Element;
