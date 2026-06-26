// youtube_search real-transcript seam (TU.7 rewrite). The OLD seam was a single "find and summarize"
// Gemini call → ungrounded model summaries, NOT transcripts. The NEW seam: (1) discover real YouTube watch
// URLs via a web-grounded Gemini call, then (2) ingest each video IN PARALLEL through Gemini's native
// `video_url` part (live-verified: Gemini transcribes the actual audio/video, e.g. returns the exact sung
// lyrics, not a hallucinated summary), then (3) combine. Deterministic given an injected fetchFn → TDD-able.
import { describe, it, expect } from 'vitest';
import {
  createYoutubeResearch,
  extractYoutubeUrls,
  isVideoRefusal,
} from '../../../src/boot/toolSeams';

describe('isVideoRefusal (pure — distinguishes a model decline from a real transcript)', () => {
  // the exact refusal shapes observed LIVE from gemini-2.5-flash on un-ingestable videos:
  it('flags the real-world refusal phrasings', () => {
    for (const refusal of [
      "I'm sorry, I cannot access external links or watch videos.",
      'I am sorry, but I cannot watch or access external YouTube videos or content.',
      'I cannot directly process YouTube videos. My current capabilities do not allow me to access external websites.',
      'I am unable to access the video at the provided link.',
    ]) {
      expect(isVideoRefusal(refusal)).toBe(true);
    }
  });

  it('does NOT flag a genuine transcript (even one that uses the word "cannot")', () => {
    expect(
      isVideoRefusal(
        'The presenter explains that current solid-state cells cannot yet be mass-produced cheaply, ' +
          'and demonstrates a sulfide electrolyte at the bench.',
      ),
    ).toBe(false);
  });
});

describe('extractYoutubeUrls (pure — canonicalizes + dedups video ids across URL forms)', () => {
  it('extracts watch?v / youtu.be / shorts / embed and canonicalizes to a watch URL', () => {
    const text = [
      'See https://www.youtube.com/watch?v=dQw4w9WgXcQ&vl=en for the demo,',
      'or the short youtu.be/abcdefghijk, also https://youtube.com/shorts/12345678901',
      'and https://www.youtube.com/embed/ABCDEFGHIJK?start=5',
    ].join(' ');
    expect(extractYoutubeUrls(text)).toEqual([
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=abcdefghijk',
      'https://www.youtube.com/watch?v=12345678901',
      'https://www.youtube.com/watch?v=ABCDEFGHIJK',
    ]);
  });

  it('dedups the same video id appearing in different URL forms, and ignores non-YouTube URLs', () => {
    const text =
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ and youtu.be/dQw4w9WgXcQ and https://example.com/watch?v=notyoutube1';
    expect(extractYoutubeUrls(text)).toEqual(['https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
  });

  it('returns [] when there are no YouTube URLs', () => {
    expect(extractYoutubeUrls('no videos here, just https://example.com')).toEqual([]);
  });
});

/** A fake OpenRouter that branches discovery (string content + web plugin) vs ingestion (video_url part). */
function fakeOpenRouter(opts: {
  discoveryContent: string;
  transcriptFor: (videoUrl: string) => Promise<string> | string; // throw to simulate a per-video failure
  recordIngestUrls?: string[];
  recordDiscoveryPlugins?: unknown[];
}): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string) as {
      plugins?: unknown[];
      messages: { content: unknown }[];
    };
    const content = body.messages[0]?.content;
    // Ingestion: the first message content is an array carrying a { type:'video_url', video_url:{url} } part.
    if (Array.isArray(content)) {
      const part = content.find(
        (p): p is { type: string; video_url: { url: string } } =>
          (p as { type?: string }).type === 'video_url',
      );
      const url = part!.video_url.url;
      opts.recordIngestUrls?.push(url);
      const text = await opts.transcriptFor(url); // may throw → per-video failure
      return { json: async () => ({ choices: [{ message: { content: text } }] }) } as Response;
    }
    // Discovery: a plain string prompt + the web plugin (grounded URL discovery).
    if (opts.recordDiscoveryPlugins !== undefined && body.plugins !== undefined) {
      opts.recordDiscoveryPlugins.push(...body.plugins);
    }
    return {
      json: async () => ({ choices: [{ message: { content: opts.discoveryContent } }] }),
    } as Response;
  }) as unknown as typeof fetch;
}

describe('createYoutubeResearch — discover → parallel video ingestion → combine', () => {
  it('discovers (web-grounded) then ingests each video natively and combines the real content', async () => {
    const ingestUrls: string[] = [];
    const plugins: unknown[] = [];
    const youtube = createYoutubeResearch({
      fetchFn: fakeOpenRouter({
        discoveryContent:
          'Try https://www.youtube.com/watch?v=aaaaaaaaaaa and https://youtu.be/bbbbbbbbbbb',
        transcriptFor: (url) =>
          url.includes('aaaaaaaaaaa')
            ? 'TRANSCRIPT-A: cathode chemistry'
            : 'TRANSCRIPT-B: anode design',
        recordIngestUrls: ingestUrls,
        recordDiscoveryPlugins: plugins,
      }),
      apiKey: 'k',
    });

    const out = await youtube('solid state batteries');
    // both real video URLs were ingested via the native video_url part...
    expect(ingestUrls.sort()).toEqual([
      'https://www.youtube.com/watch?v=aaaaaaaaaaa',
      'https://www.youtube.com/watch?v=bbbbbbbbbbb',
    ]);
    // ...discovery used the web plugin (grounded, real URLs — not hallucinated)...
    expect(plugins).toEqual([{ id: 'web' }]);
    // ...and the combined result carries BOTH transcripts + their source URLs.
    expect(out).toContain('TRANSCRIPT-A: cathode chemistry');
    expect(out).toContain('TRANSCRIPT-B: anode design');
    expect(out).toContain('https://www.youtube.com/watch?v=aaaaaaaaaaa');
    expect(out).toContain('https://www.youtube.com/watch?v=bbbbbbbbbbb');
  });

  it('bounds the OUTPUT to maxVideos successful transcripts (extra successes are dropped)', async () => {
    const youtube = createYoutubeResearch({
      fetchFn: fakeOpenRouter({
        discoveryContent: [
          'https://youtu.be/aaaaaaaaaaa',
          'https://youtu.be/bbbbbbbbbbb',
          'https://youtu.be/ccccccccccc',
          'https://youtu.be/ddddddddddd',
        ].join('\n'),
        transcriptFor: (url) => `T-${url.slice(-3)}`,
      }),
      apiKey: 'k',
      maxVideos: 2,
      discoverCount: 4,
    });
    const out = await youtube('q');
    expect((out.match(/^Video: /gm) ?? []).length).toBe(2); // only maxVideos sections, though all 4 succeeded
  });

  it('bounds ATTEMPTS to discoverCount (never ingests every URL the model lists)', async () => {
    const ingestUrls: string[] = [];
    const youtube = createYoutubeResearch({
      fetchFn: fakeOpenRouter({
        discoveryContent: Array.from(
          { length: 8 },
          (_v, i) => `https://youtu.be/vid${String(i).padStart(8, '0')}`,
        ).join('\n'),
        transcriptFor: () => 'T',
        recordIngestUrls: ingestUrls,
      }),
      apiKey: 'k',
      discoverCount: 3,
    });
    await youtube('q');
    expect(ingestUrls).toHaveLength(3); // attempts capped at discoverCount (3), not all 8 discovered
  });

  it('SKIPS a refusal so refusal prose never masquerades as a transcript (keeps only real ones)', async () => {
    const youtube = createYoutubeResearch({
      fetchFn: fakeOpenRouter({
        discoveryContent: 'https://youtu.be/aaaaaaaaaaa https://youtu.be/bbbbbbbbbbb',
        transcriptFor: (url) =>
          url.includes('aaaaaaaaaaa')
            ? 'I am sorry, but I cannot access or watch external YouTube videos.'
            : 'TRANSCRIPT-B: real grounded content',
      }),
      apiKey: 'k',
    });
    const out = await youtube('q');
    expect(out).toContain('TRANSCRIPT-B: real grounded content'); // the genuine transcript survives
    expect(out).not.toContain('cannot access'); // the refusal is filtered out, not surfaced as content
    expect((out.match(/^Video: /gm) ?? []).length).toBe(1); // only the one real transcript
  });

  it('survives a per-video ingestion failure (one throws → the other still returns; no total throw)', async () => {
    const youtube = createYoutubeResearch({
      fetchFn: fakeOpenRouter({
        discoveryContent: 'https://youtu.be/aaaaaaaaaaa https://youtu.be/bbbbbbbbbbb',
        transcriptFor: (url) => {
          if (url.includes('aaaaaaaaaaa')) throw new Error('provider 500');
          return 'TRANSCRIPT-B ok';
        },
      }),
      apiKey: 'k',
    });
    const out = await youtube('q');
    expect(out).toContain('TRANSCRIPT-B ok'); // the healthy video still surfaces
    expect(out).not.toContain('provider 500'); // the raw error never leaks into the result
  });

  it('returns an honest note (no throw, no ingestion) when discovery finds no usable videos', async () => {
    const ingestUrls: string[] = [];
    const youtube = createYoutubeResearch({
      fetchFn: fakeOpenRouter({
        discoveryContent: 'I could not find any relevant videos.',
        transcriptFor: () => 'unused',
        recordIngestUrls: ingestUrls,
      }),
      apiKey: 'k',
    });
    const out = await youtube('something obscure');
    expect(ingestUrls).toHaveLength(0);
    expect(out.toLowerCase()).toContain('no');
  });
});
