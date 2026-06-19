/**
 * Gateway-side error classes. Each has a stable `.name` so callers can
 * match on it programmatically without depending on `instanceof` working
 * across module-system boundaries.
 */

export class GatewayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GatewayConfigError";
  }
}

export class RouteNotFoundError extends Error {
  public readonly role: string;
  constructor(role: string) {
    super(`No model route registered for role: ${role}`);
    this.name = "RouteNotFoundError";
    this.role = role;
  }
}

export class RetryExhaustedError extends Error {
  public readonly attempts: number;
  public override readonly cause?: unknown;
  constructor(attempts: number, cause?: unknown) {
    super(`HTTP request failed after ${attempts} attempt(s)`);
    this.name = "RetryExhaustedError";
    this.attempts = attempts;
    if (cause !== undefined) this.cause = cause;
  }
}

export class OutputSchemaRejectedError extends Error {
  public readonly validationError: string;
  public readonly repairAttempts: number;
  constructor(validationError: string, repairAttempts: number) {
    super(
      `Model output failed schema validation after ${repairAttempts} repair attempt(s): ${validationError}`,
    );
    this.name = "OutputSchemaRejectedError";
    this.validationError = validationError;
    this.repairAttempts = repairAttempts;
  }
}

export class RecordedFixtureNotFoundError extends Error {
  public readonly fixturePath: string;
  constructor(fixturePath: string) {
    super(`Recorded fixture not found: ${fixturePath}`);
    this.name = "RecordedFixtureNotFoundError";
    this.fixturePath = fixturePath;
  }
}
