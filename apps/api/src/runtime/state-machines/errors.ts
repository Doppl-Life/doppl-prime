/**
 * Thrown when a state-machine `transition(from, to)` is called with an
 * illegal pair per the closed transition matrix.
 *
 * Stable `.name` lets callers match the error across module boundaries
 * without relying on `instanceof` (cross-bundle quirks).
 */
export class IllegalTransitionError extends Error {
  public readonly machine: string;
  public readonly from: string;
  public readonly to: string;
  constructor(machine: string, from: string, to: string) {
    super(`${machine}: illegal transition from "${from}" to "${to}"`);
    this.name = "IllegalTransitionError";
    this.machine = machine;
    this.from = from;
    this.to = to;
  }
}
