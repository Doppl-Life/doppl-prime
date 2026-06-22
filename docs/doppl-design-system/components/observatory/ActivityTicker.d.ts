import * as React from "react";

export interface TickerEvent {
  sequence?: number;
  /** Canonical RunEventType, e.g. "agenome.fused", "fitness.scored", "energy.spent". */
  type: string;
  /** Actor role, e.g. "kernel", "selection", "critic". */
  actor?: string;
  /** Human phrase, e.g. "ag_a3 fused from ag_a0 + ag_a2". */
  phrase?: string;
  label?: string;
  /** ISO string or epoch ms — drives the relative "2s" stamp. */
  occurredAt?: string | number;
}

/**
 * The live heartbeat — a streaming feed of kernel RunEvents so the room feels the
 * organism working in real time. Ordered by `sequence`; newest on top.
 */
export interface ActivityTickerProps {
  events: TickerEvent[];
  mode?: "live" | "replay";
  maxRows?: number;
  title?: string;
}
export function ActivityTicker(props: ActivityTickerProps): React.JSX.Element;
