/**
 * Bounded retry + per-attempt timeout + one-fallback policy (P2.5, ARCHITECTURE.md §6).
 *
 * Generic + provider-agnostic so the OpenRouter generation (P2.5), direct-OpenAI embedding (P2.6), and
 * retrieval (P2.7) adapters share ONE finiteness policy: a finite number of primary attempts
 * (1 + maxRetries), each bounded by a per-attempt timeout, then exactly ONE fallback attempt before
 * giving up. Returns a discriminated outcome — it never throws on a provider failure — carrying
 * per-attempt `{attempt, reason}` info for the caller's `provider_call_failed` surfacing, and does NO
 * energy accounting (KEY SAFETY RULE #8 — energy is the kernel's success-only concern, P3.5).
 *
 * Deterministic: the backoff (`sleep`) and the per-attempt timeout (`timeoutSignal`) are injectable, so
 * tests need no real timers / `Date.now` / `Math.random`.
 */

export const DEFAULT_MAX_RETRIES = 2;
export const DEFAULT_BACKOFF_MS = 200;

/** A timed-out attempt; its `reason` resolves to the fixed string `'timeout'`. */
export class ProviderTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`attempt exceeded ${timeoutMs}ms timeout`);
    this.name = 'ProviderTimeoutError';
  }
}

/** One failed attempt's surfaced info — the `provider_call_failed{attempt,reason}` shape. */
export interface AttemptFailure {
  /** 1-based, counted across the primary attempts and the fallback attempt. */
  attempt: number;
  /** `'timeout'` for a timed-out attempt, otherwise the attempt error's message. */
  reason: string;
}

export type RetryOutcome<T> =
  | { ok: true; value: T; failures: AttemptFailure[] }
  | { ok: false; failures: AttemptFailure[] };

/** Injected timing seams — deterministic stubs in tests, real timers in production. */
export interface RetryDeps {
  /** Backoff between primary attempts; default waits `ms` via `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Per-attempt timeout; rejects with {@link ProviderTimeoutError} after `ms`. */
  timeoutSignal?: (ms: number) => Promise<never>;
}

export interface RetryPolicy<T> extends RetryDeps {
  /** Retries AFTER the first primary attempt; default {@link DEFAULT_MAX_RETRIES}. */
  maxRetries?: number;
  /** Per-attempt timeout in ms. */
  timeoutMs: number;
  /** Backoff between primary attempts; default {@link DEFAULT_BACKOFF_MS}. */
  backoffMs?: number;
  /** Exactly one fallback attempt after the primary attempts exhaust. */
  fallback?: () => Promise<T>;
}

function reasonOf(error: unknown): string {
  if (error instanceof ProviderTimeoutError) return 'timeout';
  if (error instanceof Error) return error.message;
  return String(error);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Race one attempt against its per-attempt timeout; the default timer is always cleared on settle. */
async function runWithTimeout<T>(
  attempt: () => Promise<T>,
  timeoutMs: number,
  timeoutSignal?: (ms: number) => Promise<never>,
): Promise<T> {
  if (timeoutSignal) {
    return Promise.race([attempt(), timeoutSignal(timeoutMs)]);
  }
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new ProviderTimeoutError(timeoutMs)), timeoutMs);
  });
  const attemptPromise = attempt();
  // If the timeout wins the race the attempt promise is abandoned; swallow a late rejection so it never
  // surfaces as an unhandledRejection (the underlying call carries its own timeout too).
  attemptPromise.catch(() => {});
  try {
    return await Promise.race([attemptPromise, timeout]);
  } finally {
    if (handle !== undefined) clearTimeout(handle);
  }
}

/**
 * Run `attempt` with bounded retries + a per-attempt timeout, then one `fallback` attempt; return a
 * discriminated outcome. Total attempts ≤ (1 + maxRetries) + (fallback ? 1 : 0) — finite by
 * construction. Each failed attempt is recorded as an {@link AttemptFailure}; no throw escapes.
 */
export async function withRetry<T>(
  attempt: () => Promise<T>,
  policy: RetryPolicy<T>,
): Promise<RetryOutcome<T>> {
  const maxRetries = policy.maxRetries ?? DEFAULT_MAX_RETRIES;
  const sleep = policy.sleep ?? defaultSleep;
  const backoffMs = policy.backoffMs ?? DEFAULT_BACKOFF_MS;
  const failures: AttemptFailure[] = [];
  const primaryAttempts = maxRetries + 1;

  for (let i = 0; i < primaryAttempts; i += 1) {
    try {
      const value = await runWithTimeout(attempt, policy.timeoutMs, policy.timeoutSignal);
      return { ok: true, value, failures };
    } catch (error) {
      failures.push({ attempt: failures.length + 1, reason: reasonOf(error) });
    }
    if (i < primaryAttempts - 1) {
      await sleep(backoffMs);
    }
  }

  if (policy.fallback) {
    try {
      const value = await runWithTimeout(policy.fallback, policy.timeoutMs, policy.timeoutSignal);
      return { ok: true, value, failures };
    } catch (error) {
      failures.push({ attempt: failures.length + 1, reason: reasonOf(error) });
    }
  }

  return { ok: false, failures };
}
