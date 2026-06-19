/**
 * Runtime errors. Stable `.name` fields let callers (and the eventual
 * Phase 6 HTTP layer) match without `instanceof` cross-bundle quirks.
 */

export class RunAlreadyActiveError extends Error {
  public readonly activeRunId: string;
  constructor(activeRunId: string) {
    super(
      `A run is already active (${activeRunId}). The kernel enforces single-active-run per ARCHITECTURE.md §3.`,
    );
    this.name = "RunAlreadyActiveError";
    this.activeRunId = activeRunId;
  }
}

export class CapExhaustedError extends Error {
  public readonly cap: string;
  public readonly value: number;
  public readonly limit: number;
  constructor(cap: string, value: number, limit: number) {
    super(`Cap "${cap}" exhausted: value=${value} >= limit=${limit}`);
    this.name = "CapExhaustedError";
    this.cap = cap;
    this.value = value;
    this.limit = limit;
  }
}
