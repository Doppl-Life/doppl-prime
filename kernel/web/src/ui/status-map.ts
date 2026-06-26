import { STATUS_COLORS } from "./theme.js";

/**
 * Maps every domain status enum value to a fixed visual token (P7.3).
 * Shape AND icon AND label AND color — status is never conveyed by
 * color alone. Unknown values fall through to the neutral token.
 */

export type StatusShape = "circle" | "square" | "triangle" | "diamond" | "hexagon" | "ring";

export type StatusDomain = "agenome" | "candidate" | "check" | "critic_review" | "run" | "run-mode";

export interface StatusToken {
  shape: StatusShape;
  iconName: string;
  label: string;
  color: string;
  aria: string;
}

const NEUTRAL: StatusToken = {
  shape: "ring",
  iconName: "question",
  label: "Unknown",
  color: STATUS_COLORS.neutral,
  aria: "unknown status",
};

const AGENOME_MAP: Record<string, StatusToken> = {
  seeded: {
    shape: "circle",
    iconName: "sprout",
    label: "Seeded",
    color: STATUS_COLORS.info,
    aria: "agenome seeded",
  },
  active: {
    shape: "square",
    iconName: "play",
    label: "Active",
    color: STATUS_COLORS.ok,
    aria: "agenome active",
  },
  spent: {
    shape: "diamond",
    iconName: "pause",
    label: "Spent",
    color: STATUS_COLORS.warn,
    aria: "agenome spent",
  },
  eligible_parent: {
    shape: "hexagon",
    iconName: "star",
    label: "Eligible parent",
    color: STATUS_COLORS.ok,
    aria: "agenome eligible parent",
  },
  reproduced: {
    shape: "hexagon",
    iconName: "split",
    label: "Reproduced",
    color: STATUS_COLORS.info,
    aria: "agenome reproduced",
  },
  culled: {
    shape: "triangle",
    iconName: "x",
    label: "Culled",
    color: STATUS_COLORS.error,
    aria: "agenome culled",
  },
  failed: {
    shape: "triangle",
    iconName: "alert",
    label: "Failed",
    color: STATUS_COLORS.error,
    aria: "agenome failed",
  },
};

const CANDIDATE_MAP: Record<string, StatusToken> = {
  created: {
    shape: "circle",
    iconName: "plus",
    label: "Created",
    color: STATUS_COLORS.info,
    aria: "candidate created",
  },
  under_review: {
    shape: "square",
    iconName: "magnifier",
    label: "Under review",
    color: STATUS_COLORS.pending,
    aria: "candidate under review",
  },
  checked: {
    shape: "square",
    iconName: "check-double",
    label: "Checked",
    color: STATUS_COLORS.info,
    aria: "candidate checked",
  },
  scored: {
    shape: "diamond",
    iconName: "gauge",
    label: "Scored",
    color: STATUS_COLORS.ok,
    aria: "candidate scored",
  },
  selected: {
    shape: "hexagon",
    iconName: "crown",
    label: "Selected",
    color: STATUS_COLORS.ok,
    aria: "candidate selected (winner)",
  },
  rejected: {
    shape: "triangle",
    iconName: "x",
    label: "Rejected",
    color: STATUS_COLORS.error,
    aria: "candidate rejected",
  },
  culled: {
    shape: "triangle",
    iconName: "trash",
    label: "Culled",
    color: STATUS_COLORS.error,
    aria: "candidate culled",
  },
  invalid: {
    shape: "triangle",
    iconName: "alert",
    label: "Invalid",
    color: STATUS_COLORS.error,
    aria: "candidate invalid",
  },
};

const CHECK_MAP: Record<string, StatusToken> = {
  passed: {
    shape: "circle",
    iconName: "check",
    label: "Passed",
    color: STATUS_COLORS.ok,
    aria: "check passed",
  },
  failed: {
    shape: "triangle",
    iconName: "x",
    label: "Failed",
    color: STATUS_COLORS.error,
    aria: "check failed",
  },
  skipped: {
    shape: "diamond",
    iconName: "skip",
    label: "Skipped",
    color: STATUS_COLORS.skip,
    aria: "check skipped",
  },
};

const RUN_MAP: Record<string, StatusToken> = {
  configured: {
    shape: "circle",
    iconName: "doc",
    label: "Configured",
    color: STATUS_COLORS.info,
    aria: "run configured",
  },
  running: {
    shape: "square",
    iconName: "play",
    label: "Running",
    color: STATUS_COLORS.ok,
    aria: "run running",
  },
  completing: {
    shape: "square",
    iconName: "play",
    label: "Completing",
    color: STATUS_COLORS.pending,
    aria: "run completing",
  },
  stopping: {
    shape: "square",
    iconName: "pause",
    label: "Stopping",
    color: STATUS_COLORS.warn,
    aria: "run stopping",
  },
  completed: {
    shape: "hexagon",
    iconName: "flag",
    label: "Completed",
    color: STATUS_COLORS.ok,
    aria: "run completed",
  },
  stopped: {
    shape: "diamond",
    iconName: "stop",
    label: "Stopped",
    color: STATUS_COLORS.warn,
    aria: "run stopped",
  },
  failed: {
    shape: "triangle",
    iconName: "alert",
    label: "Failed",
    color: STATUS_COLORS.error,
    aria: "run failed",
  },
  cancelled: {
    shape: "triangle",
    iconName: "x",
    label: "Cancelled",
    color: STATUS_COLORS.error,
    aria: "run cancelled",
  },
  stalled: {
    shape: "diamond",
    iconName: "warning",
    label: "Stalled",
    color: STATUS_COLORS.warn,
    aria: "run stalled",
  },
  unknown: NEUTRAL,
};

const RUN_MODE_MAP: Record<string, StatusToken> = {
  live: {
    shape: "circle",
    iconName: "bolt",
    label: "LIVE",
    color: STATUS_COLORS.ok,
    aria: "live mode",
  },
  replay: {
    shape: "square",
    iconName: "rewind",
    label: "REPLAY",
    color: STATUS_COLORS.info,
    aria: "replay mode",
  },
  rehearsal: {
    shape: "hexagon",
    iconName: "rehearsal",
    label: "REHEARSAL",
    color: STATUS_COLORS.info,
    aria: "rehearsal mode",
  },
  polling: {
    shape: "diamond",
    iconName: "warning",
    label: "DEGRADED — polling",
    color: STATUS_COLORS.warn,
    aria: "polling fallback mode",
  },
  idle: {
    shape: "ring",
    iconName: "pause",
    label: "IDLE — no run loaded",
    color: STATUS_COLORS.neutral,
    aria: "idle mode",
  },
};

const CRITIC_REVIEW_MAP: Record<string, StatusToken> = {
  accepted: {
    shape: "circle",
    iconName: "check",
    label: "Accepted",
    color: STATUS_COLORS.ok,
    aria: "review accepted",
  },
  rejected: {
    shape: "triangle",
    iconName: "x",
    label: "Rejected",
    color: STATUS_COLORS.error,
    aria: "review rejected",
  },
};

export function getStatusToken(
  domain: StatusDomain,
  status: string | undefined | null,
): StatusToken {
  if (!status) return NEUTRAL;
  let map: Record<string, StatusToken>;
  switch (domain) {
    case "agenome":
      map = AGENOME_MAP;
      break;
    case "candidate":
      map = CANDIDATE_MAP;
      break;
    case "check":
      map = CHECK_MAP;
      break;
    case "run":
      map = RUN_MAP;
      break;
    case "run-mode":
      map = RUN_MODE_MAP;
      break;
    case "critic_review":
      map = CRITIC_REVIEW_MAP;
      break;
  }
  return map[status] ?? NEUTRAL;
}

export { NEUTRAL };
