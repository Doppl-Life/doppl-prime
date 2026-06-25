// Tool registry (tool-use TU.3, KEY SAFETY RULE #3 — no arbitrary code execution). The allowlist mirrors
// the check-runner registry (lesson §11/§39): a frozen descriptor registry (the offered surface, non-
// executing by the contract `ToolDescriptor` shape) + a PARALLEL frozen executor-impl map + a fail-safe
// `resolveTool` own-property gate (an unregistered/unimplemented tool resolves to a skip, never executes).
import { describe, it, expect } from 'vitest';
import { ToolDescriptor } from '@doppl/contracts';
import {
  TOOL_REGISTRY,
  TOOL_IMPLS,
  resolveTool,
  offeredToolDescriptors,
  type ToolExecutorDeps,
} from '../../../../src/model-gateway/tools/registry';

describe('tool registry — the allowlist gate (rule #3, mirrors check-runners)', () => {
  it('registers all four research tools as valid non-executing ToolDescriptors', () => {
    // TU.7 — the full offered set (web_search + fetch_url + x_search + youtube_search).
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      'fetch_url',
      'web_search',
      'x_search',
      'youtube_search',
    ]);
    for (const descriptor of offeredToolDescriptors()) {
      // each offered descriptor round-trips the frozen contract shape (no code field representable).
      expect(ToolDescriptor.parse(descriptor)).toEqual(descriptor);
    }
    // every registered descriptor has a PARALLEL impl (no registered-but-unimplemented offered tool).
    expect(Object.keys(TOOL_IMPLS).sort()).toEqual(Object.keys(TOOL_REGISTRY).sort());
  });

  it('the registry + impl map are frozen (no runtime register path, rule #3)', () => {
    expect(Object.isFrozen(TOOL_REGISTRY)).toBe(true);
    expect(Object.isFrozen(TOOL_IMPLS)).toBe(true);
  });

  it('resolveTool is a fail-safe own-property gate', () => {
    for (const name of ['web_search', 'fetch_url', 'x_search', 'youtube_search']) {
      expect(resolveTool(name).ok, name).toBe(true);
    }
    // an unknown tool → unavailable.
    expect(resolveTool('exec_shell').ok).toBe(false);
    // a prototype-pollution probe must NOT resolve to an Object.prototype member (own-property lookup).
    expect(resolveTool('__proto__').ok).toBe(false);
    expect(resolveTool('constructor').ok).toBe(false);
    expect(resolveTool('toString').ok).toBe(false);
  });
});

describe('fetch_url executor — SSRF-guarded HTTP fetch (rule #3)', () => {
  const fetched: string[] = [];
  const baseDeps: ToolExecutorDeps = {
    httpGet: async (url) => {
      fetched.push(url);
      return { status: 200, text: `<html>content of ${url}</html>` };
    },
    resolveHostIsPublic: async () => true,
  };
  const run = (args: unknown, deps: ToolExecutorDeps = baseDeps) =>
    TOOL_IMPLS.fetch_url!(args, deps);

  it('fetches a safe public URL and returns the body as DATA', async () => {
    fetched.length = 0;
    const r = await run({ url: 'https://example.com/article' });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('content of https://example.com/article');
    expect(fetched).toEqual(['https://example.com/article']);
  });

  it('BLOCKS an SSRF target BEFORE any fetch (rule #3)', async () => {
    fetched.length = 0;
    for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://localhost/admin']) {
      const r = await run({ url });
      expect(r.ok, url).toBe(false);
    }
    expect(fetched).toEqual([]); // the guard runs before httpGet — no outbound request was made
  });

  it('BLOCKS a public hostname that resolves to a private IP (DNS-rebinding defense)', async () => {
    fetched.length = 0;
    const r = await run(
      { url: 'https://rebind.example.com/' },
      { ...baseDeps, resolveHostIsPublic: async () => false },
    );
    expect(r.ok).toBe(false);
    expect(fetched).toEqual([]);
  });

  it('fails CLOSED on bad arguments or an unwired seam (never throws)', async () => {
    expect((await run({ notUrl: 1 })).ok).toBe(false);
    expect((await run('https://example.com')).ok).toBe(false); // not an object
    // BOTH http + resolver must be wired — a missing EITHER fails closed (the resolver is the only DNS-name
    // SSRF defense, so it can never be silently skipped).
    expect(
      (await run({ url: 'https://example.com' }, { resolveHostIsPublic: async () => true })).ok,
    ).toBe(false); // no httpGet seam
    expect(
      (
        await run(
          { url: 'https://example.com' },
          { httpGet: async () => ({ status: 200, text: 'x' }) },
        )
      ).ok,
    ).toBe(false); // no resolver seam → must NOT fetch
  });
});

describe('web_search executor — grounded search via an injected seam (Option A, no new keys)', () => {
  const run = (args: unknown, deps: ToolExecutorDeps) => TOOL_IMPLS.web_search!(args, deps);

  it('runs the query through the injected webSearch seam and returns the grounded text', async () => {
    const r = await run(
      { query: 'solid-state battery breakthroughs 2026' },
      { webSearch: async (q) => `grounded results for: ${q}` },
    );
    expect(r.ok).toBe(true);
    expect(r.content).toContain('solid-state battery breakthroughs 2026');
  });

  it('fails safe on bad arguments or a missing seam (never throws)', async () => {
    expect((await run({ q: 'x' }, { webSearch: async () => 'x' })).ok).toBe(false); // wrong arg key
    expect((await run({ query: 'x' }, {})).ok).toBe(false); // no webSearch seam
  });
});

describe('x_search + youtube_search executors (TU.7, grounded via injected seams)', () => {
  it('x_search routes the query through the injected xSearch seam', async () => {
    const r = await TOOL_IMPLS.x_search!(
      { query: 'reactions to the new battery startup' },
      { xSearch: async (q) => `X discussion about: ${q}` },
    );
    expect(r.ok).toBe(true);
    expect(r.content).toContain('reactions to the new battery startup');
  });

  it('youtube_search routes the query through the injected youtubeSearch seam', async () => {
    const r = await TOOL_IMPLS.youtube_search!(
      { query: 'how solid-state batteries work' },
      { youtubeSearch: async (q) => `YouTube videos about: ${q}` },
    );
    expect(r.ok).toBe(true);
    expect(r.content).toContain('how solid-state batteries work');
  });

  it('each fails safe to ok:false when its seam is unwired (rule #3 — never executes)', async () => {
    expect((await TOOL_IMPLS.x_search!({ query: 'x' }, {})).ok).toBe(false);
    expect((await TOOL_IMPLS.youtube_search!({ query: 'x' }, {})).ok).toBe(false);
    const xr = await TOOL_IMPLS.x_search!({ query: 'x' }, {});
    expect(xr.content).toContain('tool_unavailable');
  });
});
