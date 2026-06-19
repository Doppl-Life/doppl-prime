import { describe, expect, test, vi } from "vitest";
import { RetryExhaustedError } from "../../errors.js";
import { createHttpClient } from "../http-client.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("createHttpClient — smoke", () => {
  test("returns an object with a fetch method", () => {
    const client = createHttpClient();
    expect(typeof client.fetch).toBe("function");
  });
});

describe("createHttpClient — withTimeout", () => {
  test("a handler slower than the timeout throws inside the timeout window", async () => {
    const slowFetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          }
          setTimeout(() => _resolve(new Response("late")), 200);
        }),
    );
    const client = createHttpClient({ baseFetch: slowFetch, timeoutMs: 50 });
    const start = Date.now();
    await expect(client.fetch("http://example.com")).rejects.toThrow();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(150);
  });

  test("a fast handler completes normally inside the timeout window", async () => {
    const fastFetch = vi.fn(async () => jsonResponse({ ok: true }));
    const client = createHttpClient({ baseFetch: fastFetch, timeoutMs: 100 });
    const res = await client.fetch("http://example.com");
    expect(res.status).toBe(200);
  });
});

describe("createHttpClient — withRetry", () => {
  test("retries on 500 and returns the eventual 200 body", async () => {
    let calls = 0;
    const flakyFetch = vi.fn(async () => {
      calls += 1;
      if (calls < 2) return new Response("error", { status: 500 });
      return jsonResponse({ ok: true });
    });
    const client = createHttpClient({
      baseFetch: flakyFetch,
      retry: { attempts: 3, backoffMs: 0 },
    });
    const res = await client.fetch("http://example.com");
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  test("throws RetryExhaustedError after all attempts return 500", async () => {
    const alwaysFails = vi.fn(async () => new Response("e", { status: 503 }));
    const client = createHttpClient({
      baseFetch: alwaysFails,
      retry: { attempts: 3, backoffMs: 0 },
    });
    await expect(client.fetch("http://example.com")).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(alwaysFails).toHaveBeenCalledTimes(3);
  });

  test("does NOT retry on 4xx", async () => {
    const fourOhFour = vi.fn(async () => new Response("nope", { status: 404 }));
    const client = createHttpClient({
      baseFetch: fourOhFour,
      retry: { attempts: 3, backoffMs: 0 },
    });
    const res = await client.fetch("http://example.com");
    expect(res.status).toBe(404);
    expect(fourOhFour).toHaveBeenCalledTimes(1);
  });

  test("does NOT retry on 401 (auth issue, not a transient error)", async () => {
    const unauthorized = vi.fn(async () => new Response("nope", { status: 401 }));
    const client = createHttpClient({
      baseFetch: unauthorized,
      retry: { attempts: 3, backoffMs: 0 },
    });
    const res = await client.fetch("http://example.com");
    expect(res.status).toBe(401);
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });

  test("retries on a thrown network error and ultimately succeeds", async () => {
    let calls = 0;
    const occasionallyThrows = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error("ECONNRESET");
      return jsonResponse({ ok: true });
    });
    const client = createHttpClient({
      baseFetch: occasionallyThrows,
      retry: { attempts: 3, backoffMs: 0 },
    });
    const res = await client.fetch("http://example.com");
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  test("combined timeout + retry: each attempt has its own timeout window", async () => {
    let calls = 0;
    const slowThenFast = vi.fn(
      (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        calls += 1;
        if (calls === 1) {
          // First call sleeps past the timeout — should be aborted then retried.
          return new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (signal) {
              signal.addEventListener("abort", () => reject(new Error("aborted")));
            }
            setTimeout(() => _resolve(jsonResponse({ ok: true })), 200);
          });
        }
        return Promise.resolve(jsonResponse({ ok: true }));
      },
    );
    const client = createHttpClient({
      baseFetch: slowThenFast,
      timeoutMs: 50,
      retry: { attempts: 2, backoffMs: 0 },
    });
    const res = await client.fetch("http://example.com");
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });
});

describe("createHttpClient — error name stability", () => {
  test("RetryExhaustedError has stable .name", async () => {
    const fail = vi.fn(async () => new Response("e", { status: 502 }));
    const client = createHttpClient({
      baseFetch: fail,
      retry: { attempts: 2, backoffMs: 0 },
    });
    try {
      await client.fetch("http://example.com");
    } catch (e) {
      expect((e as Error).name).toBe("RetryExhaustedError");
    }
  });
});
