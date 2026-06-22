import * as React from "react";

export interface AgenomeSummary {
  id: string;
  status: string;
  /** 0–2 parents; gen-0 seeds have none, mutation children one, fusion children two. */
  parentIds?: string[];
  spawnBudget?: number;
}

/** A scannable Agenome summary — status, parentage, energy, output count. */
export interface AgenomeCardProps {
  agenome: AgenomeSummary;
  energySpent?: number;
  energyBudget?: number;
  candidatesProduced?: number;
  /** Derived from personaWeights, for the "visible specialization" story. */
  specializationTag?: string;
  onInspect?: (id: string) => void;
}
export function AgenomeCard(props: AgenomeCardProps): React.JSX.Element;
