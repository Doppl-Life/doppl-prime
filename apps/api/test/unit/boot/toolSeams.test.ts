// Real tool-execution IO seams (TU.5) — the live counterparts of the injected ToolExecutorDeps, closing
// the SSRF-hardening obligations (KEY SAFETY RULE #3). Primitives are injected so the seams are
// deterministic: resolveHostIsPublic (all-records DNS + IP-literal + fail-closed), httpGet (redirect-non-
// following + timeout-bounded), webSearch (OpenRouter web-plugin call shape; key env-only, rule #4).
import { describe, it, expect } from 'vitest';
import {
  createGroundedSearch,
  createResolveAddresses,
  createResolveHostIsPublic,
  createSafeHttpGet,
  createToolExecutorSeams,
  createWebSearch,
} from '../../../src/boot/toolSeams';

/** A fake `fetchPinned` that plays a scripted sequence of responses, recording the (url, pinnedIp) each hop. */
function fakePinned(steps: { status: number; location?: string; text?: string }[]): {
  fetchPinned: (
    url: string,
    ip: string,
  ) => Promise<{ status: number; location?: string; text: string }>;
  calls: { url: string; ip: string }[];
} {
  const calls: { url: string; ip: string }[] = [];
  let i = 0;
  return {
    calls,
    fetchPinned: async (url, ip) => {
      calls.push({ url, ip });
      const step = steps[i++] ?? { status: 200, text: 'END' };
      return {
        status: step.status,
        ...(step.location !== undefined ? { location: step.location } : {}),
        text: step.text ?? '',
      };
    },
  };
}

/** A resolver over a host→addresses map; an unmapped host resolves to null (blocked, fail-closed). */
function fakeResolver(
  map: Record<string, string[]>,
): (hostname: string) => Promise<string[] | null> {
  return async (hostname) => map[hostname] ?? null;
}

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

describe('createResolveAddresses (TU.5 — the DNS-rebinding primitive that ALSO returns the pin IP)', () => {
  it('returns EVERY resolved address when all are public', async () => {
    const resolve = createResolveAddresses(async () => [
      { address: '93.184.216.34' },
      { address: '2606:2800:220:1:248:1893:25c8:1946' },
    ]);
    expect(await resolve('example.com')).toEqual([
      '93.184.216.34',
      '2606:2800:220:1:248:1893:25c8:1946',
    ]);
  });

  it('returns null when ANY record is private (split-horizon / multi-record rebinding)', async () => {
    const resolve = createResolveAddresses(async () => [
      { address: '93.184.216.34' },
      { address: '10.0.0.5' },
    ]);
    expect(await resolve('rebind.example.com')).toBeNull();
  });

  it('canonicalizes an IP literal (no DNS): public → [ip], private → null', async () => {
    const resolve = createResolveAddresses(async () => {
      throw new Error('DNS must not be called for an IP literal');
    });
    expect(await resolve('8.8.8.8')).toEqual(['8.8.8.8']);
    expect(await resolve('127.0.0.1')).toBeNull();
  });

  it('fails closed (null) on a lookup error or empty result', async () => {
    expect(
      await createResolveAddresses(async () => {
        throw new Error('NXDOMAIN');
      })('nope.example.com'),
    ).toBeNull();
    expect(await createResolveAddresses(async () => [])('empty.example.com')).toBeNull();
  });
});

describe('createSafeHttpGet (TU.5 — safe redirect-FOLLOWING + resolve→connect TOCTOU close)', () => {
  it('FOLLOWS a redirect, re-validating + re-pinning EACH hop to the freshly-resolved IP', async () => {
    const resolve = fakeResolver({ 'a.example': ['1.1.1.1'], 'b.example': ['2.2.2.2'] });
    const { fetchPinned, calls } = fakePinned([
      { status: 302, location: 'https://b.example/landing' },
      { status: 200, text: 'FINAL BODY' },
    ]);
    const httpGet = createSafeHttpGet({ resolveAddresses: resolve, fetchPinned });
    const result = await httpGet('https://a.example/start');
    expect(result).toEqual({ status: 200, text: 'FINAL BODY' });
    // each hop pinned to ITS host's freshly-validated IP — the TOCTOU close, end to end
    expect(calls).toEqual([
      { url: 'https://a.example/start', ip: '1.1.1.1' },
      { url: 'https://b.example/landing', ip: '2.2.2.2' },
    ]);
  });

  it('pins the socket to the VALIDATED IP, never the hostname (TOCTOU close)', async () => {
    const resolve = fakeResolver({ 'host.example': ['93.184.216.34'] });
    const { fetchPinned, calls } = fakePinned([{ status: 200, text: 'ok' }]);
    const httpGet = createSafeHttpGet({ resolveAddresses: resolve, fetchPinned });
    await httpGet('https://host.example/page');
    expect(calls[0]?.ip).toBe('93.184.216.34'); // the resolved IP — not 'host.example'
  });

  it('BLOCKS a redirect to a literal private host (cloud-metadata SSRF) and never connects to it', async () => {
    const resolve = fakeResolver({ 'a.example': ['1.1.1.1'] });
    const { fetchPinned, calls } = fakePinned([
      { status: 301, location: 'http://169.254.169.254/latest/meta-data/' },
    ]);
    const httpGet = createSafeHttpGet({ resolveAddresses: resolve, fetchPinned });
    await expect(httpGet('https://a.example/')).rejects.toThrow();
    expect(calls.map((c) => c.url)).toEqual(['https://a.example/']); // never connected to the metadata IP
  });

  it('BLOCKS a redirect whose host RESOLVES private (DNS-rebinding on the hop)', async () => {
    const resolve = fakeResolver({ 'a.example': ['1.1.1.1'] }); // rebind.example → unmapped → null
    const { fetchPinned, calls } = fakePinned([
      { status: 302, location: 'http://rebind.example/' },
    ]);
    const httpGet = createSafeHttpGet({ resolveAddresses: resolve, fetchPinned });
    await expect(httpGet('https://a.example/')).rejects.toThrow();
    expect(calls).toHaveLength(1); // the rebinding host was never connected to
  });

  it('throws on TOO MANY redirects (no infinite loop)', async () => {
    const resolve = fakeResolver({ 'loop.example': ['1.1.1.1'] });
    const { fetchPinned, calls } = fakePinned(
      Array.from({ length: 20 }, () => ({ status: 302, location: 'https://loop.example/next' })),
    );
    const httpGet = createSafeHttpGet({ resolveAddresses: resolve, fetchPinned, maxRedirects: 3 });
    await expect(httpGet('https://loop.example/start')).rejects.toThrow();
    expect(calls.length).toBeLessThanOrEqual(4); // initial + at most maxRedirects hops
  });

  it('fails closed when the INITIAL host resolves private (defense in depth)', async () => {
    const resolve = fakeResolver({}); // every host → null
    const { fetchPinned, calls } = fakePinned([{ status: 200, text: 'never' }]);
    const httpGet = createSafeHttpGet({ resolveAddresses: resolve, fetchPinned });
    await expect(httpGet('https://private.example/')).rejects.toThrow();
    expect(calls).toHaveLength(0);
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
    let body: { model?: string; plugins?: unknown; messages?: { content?: string }[] } | undefined;
    const seams = createToolExecutorSeams({
      openRouterApiKey: 'k',
      fetchFn: (async (_url: string, opts?: RequestInit) => {
        body = JSON.parse(opts!.body as string);
        return { json: async () => ({ choices: [{ message: { content: 'ok' } }] }) } as Response;
      }) as unknown as typeof fetch,
    });
    await seams.xSearch!('solid-state batteries');
    expect(body?.model).toBe('x-ai/grok-4.3'); // the live default, not the deprecated grok-4.1-fast
    expect(body?.plugins).toEqual([{ id: 'web' }]); // web plugin enables X citations for xAI
    // FRAME the topic for X so grok+web pulls actual X posts (a bare topic → a generic web explainer,
    // live-verified): the sent content must carry an X(Twitter) framing AND the agent's topic.
    expect(body?.messages?.[0]?.content).toMatch(/\bX\b.*Twitter|Twitter.*\bX\b|on X\b/i);
    expect(body?.messages?.[0]?.content).toContain('solid-state batteries');
  });
});
