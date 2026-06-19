import { RetryExhaustedError } from "../errors.js";

/**
 * Thin abstraction over `fetch` shared by every HTTP-backed adapter
 * (OpenRouter, OpenAI direct, Tavily). The plan splits the responsibility:
 *  - `withTimeout(ms)` aborts a slow request via AbortController.
 *  - `withRetry({ attempts, backoffMs })` retries on transient errors
 *    (5xx response status, thrown network error like ECONNRESET) but
 *    NOT on 4xx — 4xx is treated as a config issue the adapter must
 *    surface.
 *
 * `baseFetch` is the injection point for tests; production callers leave
 * it unset and the global `fetch` (Node 22+) is used.
 */
export interface HttpClient {
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

export interface HttpClientOptions {
  baseFetch?: typeof fetch;
  timeoutMs?: number;
  retry?: {
    attempts: number;
    backoffMs?: number;
    retryOn?: (err: unknown, response?: Response) => boolean;
  };
}

function defaultRetryOn(err: unknown, response?: Response): boolean {
  if (response !== undefined) {
    return response.status >= 500 && response.status <= 599;
  }
  // Thrown error (network failure, abort). All thrown errors are
  // considered transient — the caller can supply a stricter `retryOn`.
  return err !== undefined;
}

async function runWithTimeout(
  underlying: typeof fetch,
  timeoutMs: number,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const upstreamSignal = init?.signal;
    if (upstreamSignal) {
      upstreamSignal.addEventListener("abort", () => controller.abort());
    }
    return await underlying(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const baseFetch = options.baseFetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs;
  const attempts = options.retry?.attempts ?? 1;
  const backoffMs = options.retry?.backoffMs ?? 200;
  const retryOn = options.retry?.retryOn ?? defaultRetryOn;

  return {
    async fetch(url, init) {
      let lastError: unknown;
      let lastResponse: Response | undefined;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        let response: Response | undefined;
        let err: unknown;
        try {
          response =
            timeoutMs !== undefined
              ? await runWithTimeout(baseFetch, timeoutMs, url, init)
              : await baseFetch(url, init);
        } catch (e) {
          err = e;
        }

        // Decide whether to retry.
        const wasError = err !== undefined;
        const wasRetryable = wasError
          ? retryOn(err, undefined)
          : response !== undefined && retryOn(undefined, response);

        if (!wasError && !wasRetryable && response !== undefined) {
          return response;
        }

        lastError = err;
        lastResponse = response;

        if (attempt < attempts && backoffMs > 0) {
          // Exponential backoff with light jitter; honor backoffMs === 0 for tests.
          const delay = backoffMs * 2 ** (attempt - 1) * (0.8 + Math.random() * 0.4);
          await new Promise((r) => setTimeout(r, delay));
        }
      }

      throw new RetryExhaustedError(
        attempts,
        lastError ??
          (lastResponse
            ? new Error(`HTTP ${lastResponse.status} ${lastResponse.statusText}`)
            : undefined),
      );
    },
  };
}
