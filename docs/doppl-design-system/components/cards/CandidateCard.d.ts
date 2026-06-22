import * as React from "react";

export interface CandidateSummary {
  id: string;
  subtype: "cross_domain_transfer" | "zeitgeist_synthesis";
  title?: string;
  summary?: string;
  status: string;
  agenomeId?: string;
}

/** A scannable CandidateIdea summary — generation lists, in-flight, inspector header. */
export interface CandidateCardProps {
  candidate: CandidateSummary;
  /** 0..1 */
  fitnessTotal?: number;
  /** 0..1 */
  novelty?: number;
  criticSummary?: { passed: number; total: number };
  checkSummary?: { passed: number; failed: number; skipped: number };
  generation?: number;
  agenomeId?: string;
  /** Force the selected (gold) treatment; defaults to status === "selected". */
  selected?: boolean;
  onInspect?: (id: string) => void;
}
export function CandidateCard(props: CandidateCardProps): React.JSX.Element;
