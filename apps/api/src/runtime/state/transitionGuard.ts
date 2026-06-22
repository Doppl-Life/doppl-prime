/**
 * Shared transition-guard builder (P3.2, ARCHITECTURE.md §3/§5; lesson §5 single-source).
 *
 * The kernel's four lifecycle state machines (Run / Generation / Candidate / Agenome) are each a PURE
 * `(from, to) → TransitionDecision` over a per-machine transition TABLE (which IS the §3 spec) + a set
 * of TERMINAL statuses. This is the one builder all of them share — no duplicated lookup/terminal logic.
 *
 * The guard decides ONLY; it never emits an event, mutates state, or does IO (the generation loop emits
 * + the append writer persists — §5 ownership split). A from-terminal attempt is reported distinctly
 * from a wrong non-terminal pair (the kernel may treat a from-terminal attempt as a likely bug).
 */

export type TransitionDenialReason = 'illegal_transition' | 'from_terminal';

export interface TransitionAllowed {
  readonly allowed: true;
}
export interface TransitionDenied {
  readonly allowed: false;
  readonly reason: TransitionDenialReason;
  /** Echoed for the kernel's rejection log — statuses are enum values (not payload), safe to name. */
  readonly from: string;
  readonly to: string;
}
export type TransitionDecision = TransitionAllowed | TransitionDenied;

/** A per-machine transition table: each status → the statuses it may transition TO (terminals → `[]`). */
export type TransitionTable<S extends string> = Readonly<Record<S, readonly S[]>>;

export type TransitionGuard<S extends string> = (from: S, to: S) => TransitionDecision;

/**
 * Build a pure transition guard from a table + a terminal set. A from-terminal attempt → `from_terminal`
 * (checked first — a terminal has no legal exit regardless of the target); a listed edge → allowed; any
 * other non-terminal pair → `illegal_transition`. Same `(from, to)` → same decision (pure).
 */
export function makeTransitionGuard<S extends string>(
  table: TransitionTable<S>,
  terminals: ReadonlySet<S>,
): TransitionGuard<S> {
  return (from: S, to: S): TransitionDecision => {
    if (terminals.has(from)) {
      return { allowed: false, reason: 'from_terminal', from, to };
    }
    const targets = table[from] ?? [];
    if (targets.includes(to)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'illegal_transition', from, to };
  };
}
