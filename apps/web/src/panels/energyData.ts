import { EnergyEvent, RunConfig } from '../data/contracts';
import type { RunEventEnvelope } from '../data/contracts';

/**
 * energyData — the PURE event-derived energy selectors (same events-derived pattern as the P7.8 charts,
 * LESSONS §6). The lean P7.2 run-store `ViewState` holds per-entity STATUS, not energy VALUES, so the
 * panel folds the `energy.spent` events. KEY SAFETY RULE #8 (energy = successful productive spend only):
 * the selectors count ONLY `energy.spent` and read `EnergyEvent.actual` (the reconciled post-call debit,
 * never `estimate`) VERBATIM — failed/retried/repaired attempts (`provider_call_failed`,
 * `output_schema_rejected`) add NOTHING. The kernel is the authoritative energy ledger; this only
 * DISPLAYS the success-only totals, never re-deriving the debit. The exhaustion decision is the kernel's
 * (`energy_exhausted` event), never a client-side total≥budget compare.
 */

export interface AgenomeEnergyRow {
  /** The agenome id — ALSO the P7.7 lineage node `dataRef` (the link target). */
  readonly agenomeId: string;
  /** Sum of EnergyEvent.actual (doppl_energy) across this agenome's `energy.spent` events. */
  readonly total: number;
  readonly spendCount: number;
}

export interface EnergyBudgetProgress {
  /** RunCaps.energyBudget from the `run.configured` payload — null if not yet seen. */
  readonly budget: number | null;
  /** Total success-only spend across the whole run (Σ all energy.spent.actual). */
  readonly spent: number;
  /** spent / budget — null when the budget is unknown (never divides by zero). */
  readonly fraction: number | null;
  /** The kernel-owned exhaustion decision (an `energy_exhausted` event is present). */
  readonly exhausted: boolean;
}

/** Sum EnergyEvent.actual per agenomeId from `energy.spent` events; ordered by first-seen sequence. */
export function deriveEnergyByAgenome(events: readonly RunEventEnvelope[]): AgenomeEnergyRow[] {
  const firstSeq = new Map<string, number>();
  const total = new Map<string, number>();
  const count = new Map<string, number>();

  for (const e of events) {
    if (e.type !== 'energy.spent') continue; // rule #8: ONLY successful productive spend debits
    const parsed = EnergyEvent.safeParse(e.payload);
    if (!parsed.success) continue; // skip a malformed payload defensively
    const agenomeId = parsed.data.agenomeId ?? e.agenomeId;
    if (agenomeId === undefined) continue; // unattributed spend → not a per-agenome row

    const prev = firstSeq.get(agenomeId);
    if (prev === undefined || e.sequence < prev) firstSeq.set(agenomeId, e.sequence);
    total.set(agenomeId, (total.get(agenomeId) ?? 0) + parsed.data.actual);
    count.set(agenomeId, (count.get(agenomeId) ?? 0) + 1);
  }

  return [...total.keys()]
    .sort((a, b) => firstSeq.get(a)! - firstSeq.get(b)!)
    .map((agenomeId) => ({
      agenomeId,
      total: total.get(agenomeId)!,
      spendCount: count.get(agenomeId)!,
    }));
}

/** Run-wide energy budget progress: budget (from run.configured), success-only spent, exhausted flag. */
export function energyBudgetProgress(events: readonly RunEventEnvelope[]): EnergyBudgetProgress {
  let budget: number | null = null;
  let spent = 0;
  let exhausted = false;

  for (const e of events) {
    if (e.type === 'run.configured') {
      if (budget === null) {
        const cfg = RunConfig.safeParse(e.payload);
        if (cfg.success) budget = cfg.data.caps.energyBudget;
      }
    } else if (e.type === 'energy.spent') {
      const en = EnergyEvent.safeParse(e.payload);
      if (en.success) spent += en.data.actual; // run-wide total includes unattributed spend
    } else if (e.type === 'energy_exhausted') {
      exhausted = true; // the kernel-owned exhaustion decision (never re-derived here)
    }
  }

  const fraction = budget !== null && budget > 0 ? spent / budget : null;
  return { budget, spent, fraction, exhausted };
}
