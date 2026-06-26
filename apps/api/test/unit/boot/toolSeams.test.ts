// Real tool-execution IO seams (TU.5) — the live counterparts of the injected ToolExecutorDeps, closing
// the SSRF-hardening obligations (KEY SAFETY RULE #3). Primitives are injected so the seams are
// deterministic: resolveHostIsPublic (all-records DNS + IP-literal + fail-closed), httpGet (redirect-non-
// following + timeout-bounded), webSearch (OpenRouter web-plugin call shape; key env-only, rule #4).
import { describe, it, expect } from 'vitest';
import {
  createGroundedSearch,
  createResolveHostIsPublic,
  createSafeHttpGet,
  createToolExecutorSeams,
  createWebSearch,
} from '../../../src/boot/toolSeams';

describe('createResolveHostIsPublic (TU.5, rule #3 DNS-rebinding defense)', () => {
  it('allows a hostname whose EVERY A/AAAA record is public', async () => {
    const resolve = createResolveHostIsPublic(async () => [
      { address: '93.184.216.34' },
      { address: '2606:2800:220:1:248:1893:25c8:1946' },
    ]);
    expect(await resolve('example.com')).toBe(true);
  });

  it('BLOCKS a hostname with even ONE private record (split-horizon / multi-record rebinding)', async () => {
    const resolve = createResolveHostIsPublic(async () => [
      { address: '93.184.216.34' }, // public
      { address: '10.0.0.5' }, // private — taints the whole hostname
    ]);
    expect(await resolve('rebind.example.com')).toBe(false);
  });

  it('canonicalizes an IP-literal input through the private-range guard (no DNS)', async () => {
    let called = false;
    const resolve = createResolveHostIsPublic(async () => {
      called = true;
      return [];
    });
    expect(await resolve('8.8.8.8')).toBe(true);
    expect(await resolve('127.0.0.1')).toBe(false);
    expect(await resolve('::1')).toBe(false);
    expect(called).toBe(false); // an IP literal never hits DNS
  });

  it('fails CLOSED on a lookup error or empty result', async () => {
    expect(
      await createResolveHostIsPublic(async () => {
        throw new Error('NXDOMAIN');
      })('nope.example.com'),
    ).toBe(false);
    expect(await createResolveHostIsPublic(async () => [])('empty.example.com')).toBe(false);
  });
});

describe('createSafeHttpGet (TU.5, rule #3 redirect-SSRF defense)', () => {
  it('fetches a 200 body with redirect:manual + a timeout signal', async () => {
    let capturedOpts: RequestInit | undefined;
    const httpGet = createSafeHttpGet((async (_url: string, opts?: RequestInit) => {
      capturedOpts = opts;
      return { status: 200, text: async () => 'hello world' } as Response;
    }) as unknown as typeof fetch);
    const result = await httpGet('https://example.com/');
    expect(result).toEqual({ status: 200, text: 'hello world' });
    expect(capturedOpts?.redirect).toBe('manual'); // never follow a redirect to an unguarded host
    expect(capturedOpts?.signal).toBeInstanceOf(AbortSignal); // per-call timeout (finiteness)
  });

  it('stream-reads with a hard byte cap (no unbounded buffering — DoS bound, security-reviewer [medium])', async () => {
    const huge = 'x'.repeat(2_000_000); // 2 MB — far over the ~256 KiB cap
    const httpGet = createSafeHttpGet((async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(huge));
          controller.close();
        },
      });
      return { status: 200, body, text: async () => huge } as unknown as Response;
    }) as unknown as typeof fetch);
    const result = await httpGet('https://example.com/big');
    expect(result.status).toBe(200);
    expect(result.text.length).toBeLessThanOrEqual(256 * 1024); // capped at MAX_FETCH_BODY_BYTES
  });

  it('does NOT follow a 3xx redirect (returns a guard note, not the redirected body)', async () => {
    const httpGet = createSafeHttpGet(
      (async () =>
        ({
          status: 302,
          text: async () => 'should-not-read',
        }) as Response) as unknown as typeof fetch,
    );
    const result = await httpGet('https://example.com/redir');
    expect(result.status).toBe(302);
    expect(result.text).toContain('redirect not followed');
    expect(result.text).not.toContain('should-not-read');
  });
});

describe('createWebSearch (TU.5, Option A — OpenRouter web plugin; key env-only rule #4)', () => {
  it('posts the web-plugin request and extracts the grounded content', async () => {
    let body: unknown;
    let auth: string | undefined;
    const webSearch = createWebSearch({
      fetchFn: (async (_url: string, opts?: RequestInit) => {
        body = JSON.parse(opts!.body as string);
        auth = (opts!.headers as Record<string, string>).Authorization;
        return {
          json: async () => ({ choices: [{ message: { content: 'grounded answer' } }] }),
        } as Response;
      }) as unknown as typeof fetch,
      apiKey: 'test-key-fake',
      model: 'openai/gpt-4o-mini',
    });
    expect(await webSearch('battery chemistry 2026')).toBe('grounded answer');
    expect(body).toMatchObject({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'battery chemistry 2026' }],
      plugins: [{ id: 'web' }],
    });
    expect(auth).toBe('Bearer test-key-fake'); // key in the header, never in the returned content (rule #4)
  });

  it('returns empty string on a malformed provider response (never throws)', async () => {
    const webSearch = createWebSearch({
      fetchFn: (async () => ({ json: async () => ({}) }) as Response) as unknown as typeof fetch,
      apiKey: 'k',
    });
    expect(await webSearch('q')).toBe('');
  });
});

describe('createGroundedSearch (TU.7 — x_search / youtube_search over the web plugin)', () => {
  it('x_search posts the grok model with the web plugin (web plugin enables X search for xAI)', async () => {
    let body: { model?: string; plugins?: unknown; messages?: { content?: string }[] } | undefined;
    const xSearch = createGroundedSearch({
      fetchFn: (async (_url: string, opts?: RequestInit) => {
        body = JSON.parse(opts!.body as string);
        return {
          json: async () => ({ choices: [{ message: { content: 'X chatter' } }] }),
        } as Response;
      }) as unknown as typeof fetch,
      apiKey: 'k',
      model: 'x-ai/grok-4.3',
    });
    expect(await xSearch('battery startup')).toBe('X chatter');
    expect(body?.model).toBe('x-ai/grok-4.3');
    expect(body?.plugins).toEqual([{ id: 'web' }]);
    expect(body?.messages?.[0]?.content).toBe('battery startup'); // no prefix on x_search
  });

  it('THROWS on an OpenRouter API error (a deprecated model must fail LOUDLY, never silent empty)', async () => {
    // The bug this pins: x-ai/grok-4.1-fast was deprecated → the API returned {error:{code:404}} and the
    // old `content ?? ''` swallowed it to '' → x_search silently "returned nothing". An error must throw so
    // the executor surfaces `x_search_failed` (ok:false → no energy debit, rule #8) instead of a silent void.
    const search = createGroundedSearch({
      fetchFn: (async () =>
        ({
          json: async () => ({ error: { message: 'Grok 4.1 Fast is deprecated', code: 404 } }),
        }) as Response) as unknown as typeof fetch,
      apiKey: 'k',
      model: 'x-ai/grok-deprecated',
    });
    await expect(search('q')).rejects.toThrow();
  });

  it('appends the web-plugin url_citation source URLs so the agent gets concrete grounding links', async () => {
    const search = createGroundedSearch({
      fetchFn: (async () =>
        ({
          json: async () => ({
            choices: [
              {
                message: {
                  content: 'Solid-state batteries are heating up.',
                  annotations: [
                    {
                      type: 'url_citation',
                      url_citation: { url: 'https://x.com/foo/status/123', title: '1' },
                    },
                    {
                      type: 'url_citation',
                      url_citation: { url: 'https://example.com/article', title: '2' },
                    },
                  ],
                },
              },
            ],
          }),
        }) as Response) as unknown as typeof fetch,
      apiKey: 'k',
      model: 'x-ai/grok-4.3',
    });
    const out = await search('batteries');
    expect(out).toContain('Solid-state batteries are heating up.');
    expect(out).toContain('https://x.com/foo/status/123');
    expect(out).toContain('https://example.com/article');
  });

  it('youtube_search applies the query prefix to nudge the gemini model toward video content', async () => {
    let content: string | undefined;
    const youtube = createGroundedSearch({
      fetchFn: (async (_url: string, opts?: RequestInit) => {
        content = (JSON.parse(opts!.body as string) as { messages: { content: string }[] })
          .messages[0]?.content;
        return {
          json: async () => ({ choices: [{ message: { content: 'video summary' } }] }),
        } as Response;
      }) as unknown as typeof fetch,
      apiKey: 'k',
      model: 'google/gemini-2.5-flash',
      queryPrefix: 'Find and summarize YouTube videos about: ',
    });
    expect(await youtube('how batteries work')).toBe('video summary');
    expect(content).toBe('Find and summarize YouTube videos about: how batteries work');
  });
});

describe('createToolExecutorSeams — default grounded-search models (no deprecated ids)', () => {
  it("defaults x_search to a CURRENT xAI model (grok-4.1-fast was deprecated → 404 → silent '')", async () => {
    let body: { model?: string; plugins?: unknown } | undefined;
    const seams = createToolExecutorSeams({
      openRouterApiKey: 'k',
      fetchFn: (async (_url: string, opts?: RequestInit) => {
        body = JSON.parse(opts!.body as string);
        return { json: async () => ({ choices: [{ message: { content: 'ok' } }] }) } as Response;
      }) as unknown as typeof fetch,
    });
    await seams.xSearch!('q');
    expect(body?.model).toBe('x-ai/grok-4.3'); // the live default, not the deprecated grok-4.1-fast
    expect(body?.plugins).toEqual([{ id: 'web' }]); // web plugin enables X citations for xAI
  });
});
