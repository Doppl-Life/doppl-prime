/**
 * P3.6 — the LIVE/REPLAY outcome-persistence bridge (ARCHITECTURE.md §4 (a)≡(b), KEY SAFETY RULE #7).
 *
 * LIVE draws from the seeded RNG and RECORDS each concrete outcome into an ordered, JSON-safe log
 * destined for the open-JSONB `agenome.mutated` / `agenome.fused` / `lineage.culled` payloads. REPLAY
 * reads that persisted log in draw order and reconstructs each draw WITHOUT constructing or advancing a
 * PRNG (rule #7 — replay calls no providers and never re-samples).
 *
 * Replay-safety is STRUCTURAL, mirroring the replay reader's no-provider-import discipline (lesson §30):
 * this module imports NO seeded-RNG seam. LIVE depends only on the minimal `RngDraws` shape (which
 * `SeededRng` satisfies structurally), so the whole module is PRNG-free and REPLAY cannot instantiate or
 * advance a generator even by accident. LIVE and REPLAY are two SEPARATE factories — not one factory
 * with a mode flag that still pulls in the PRNG.
 *
 * `pick` records the chosen INDEX (the actual RNG outcome), never the element: the log stays JSON-safe
 * for arbitrary item types, and REPLAY reconstructs `items[index]` from the caller-supplied items.
 * Recording the element instead would drop non-serializable fields on JSON round-trip → silent lineage
 * divergence (a rule #7 / §4 violation that only surfaces as a replay that doesn't match live).
 *
 * Corruption is never silently re-sampled or re-sorted (mirrors `ReplayIntegrityError`): REPLAY throws
 * on a label mismatch, an overdraw past the log end, or a persisted index out of range for the items.
 */

/** A recorded RNG outcome is a primitive number (a float, an int, or a chosen index) — JSON-safe. */
export type OutcomeValue = number;

export interface OutcomeEntry {
  readonly label: string;
  readonly value: OutcomeValue;
}

/**
 * The minimal draw surface LIVE depends on. `SeededRng` satisfies it structurally — declaring it here
 * (rather than importing `SeededRng`) keeps this module free of any PRNG import (rule #7, structural).
 */
export interface RngDraws {
  nextFloat(): number;
  nextInt(loInclusive: number, hiExclusive: number): number;
}

/**
 * The draw API both sources expose. Draws are recorded (LIVE) or replayed (REPLAY) in the SAME order;
 * `outcomes()` returns the ordered log drawn so far (the payload-bound record).
 */
export interface OutcomeSource {
  float(label: string): number;
  int(label: string, loInclusive: number, hiExclusive: number): number;
  pick<T>(label: string, items: readonly T[]): T;
  outcomes(): readonly OutcomeEntry[];
}

/** Thrown when a persisted outcome log disagrees with the replayed draw sequence (no silent re-sample). */
export class ReplayOutcomeError extends Error {
  constructor(
    public readonly reason: 'overdraw' | 'label_mismatch' | 'index_out_of_range',
    message: string,
  ) {
    super(message);
    this.name = 'ReplayOutcomeError';
  }
}

/**
 * LIVE source — draws from the seeded RNG and appends each concrete outcome to an ordered log. The log
 * (`.outcomes()`) is what the kernel embeds into the event payload it appends (P3.10/P3.12).
 */
export function createLiveOutcomeSource(rng: RngDraws): OutcomeSource {
  const log: OutcomeEntry[] = [];
  const record = (label: string, value: number): number => {
    log.push({ label, value });
    return value;
  };
  return {
    float: (label) => record(label, rng.nextFloat()),
    int: (label, loInclusive, hiExclusive) => record(label, rng.nextInt(loInclusive, hiExclusive)),
    pick: (label, items) => {
      if (items.length === 0) {
        throw new Error(`outcome pick '${label}': cannot pick from an empty array`);
      }
      const index = rng.nextInt(0, items.length);
      record(label, index);
      return items[index]!; // index ∈ [0, length) for a non-empty array (guarded above)
    },
    outcomes: () => log.slice(),
  };
}

/**
 * REPLAY source — reconstructs the draw sequence from a persisted outcome log ONLY. Constructs no PRNG
 * and advances no generator: each draw consumes the next persisted entry in order. Throws loud on any
 * disagreement (label, overdraw, index range) rather than silently re-sampling or skipping.
 */
export function createReplayOutcomeSource(persisted: readonly OutcomeEntry[]): OutcomeSource {
  let cursor = 0;
  const consumed: OutcomeEntry[] = [];
  const next = (label: string): OutcomeEntry => {
    if (cursor >= persisted.length) {
      throw new ReplayOutcomeError(
        'overdraw',
        `replay overdraw at '${label}': persisted log has ${persisted.length} entries`,
      );
    }
    const entry = persisted[cursor]!; // cursor < persisted.length (guarded above)
    if (entry.label !== label) {
      throw new ReplayOutcomeError(
        'label_mismatch',
        `replay label mismatch at index ${cursor}: expected '${entry.label}', got '${label}'`,
      );
    }
    cursor += 1;
    consumed.push(entry);
    return entry;
  };
  return {
    float: (label) => next(label).value,
    int: (label) => next(label).value,
    pick: (label, items) => {
      const index = next(label).value;
      if (index < 0 || index >= items.length) {
        throw new ReplayOutcomeError(
          'index_out_of_range',
          `replay pick '${label}': persisted index ${index} out of range for ${items.length} items`,
        );
      }
      return items[index]!; // in range (guarded above)
    },
    outcomes: () => consumed.slice(),
  };
}
