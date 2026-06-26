// createPinnedFetch (TU.5, KEY SAFETY RULE #3) — the IP-PINNED GET primitive that closes the resolve→connect
// TOCTOU: the socket connects to the PRE-VALIDATED IP (via node's `lookup` hook) while the TLS SNI + Host
// header keep the original hostname, so a rebinding DNS that answered "public" to the resolver can't be
// re-resolved to a private IP at connect time. Proven here against a real loopback server (no external net):
// a request to a hostname that does NOT resolve still succeeds when pinned to 127.0.0.1.
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPinnedFetch } from '../../../src/boot/toolSeams';

let server: http.Server | undefined;
afterEach(() => {
  server?.close();
  server = undefined;
});

function startServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<number> {
  return new Promise((resolve) => {
    server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve((server!.address() as AddressInfo).port));
  });
}

describe('createPinnedFetch — connects to the pinned IP, keeps the hostname for Host/SNI', () => {
  it('routes the socket to the pinned IP even when the hostname does NOT resolve (TOCTOU close)', async () => {
    let seenHost: string | undefined;
    const port = await startServer((req, res) => {
      seenHost = req.headers.host;
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('pinned-ok');
    });
    const fetchPinned = createPinnedFetch();
    // `example.invalid` is guaranteed non-resolvable (RFC 6761) — the request can ONLY succeed because the
    // connection was pinned to 127.0.0.1. That is exactly the connect-time IP pin (no second DNS resolution).
    const res = await fetchPinned(`http://example.invalid:${port}/page`, '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.text).toBe('pinned-ok');
    expect(seenHost).toBe(`example.invalid:${port}`); // Host header carries the hostname, not the pinned IP
  });

  it('does NOT follow a redirect — returns status + Location for the loop to re-validate', async () => {
    const port = await startServer((_req, res) => {
      res.writeHead(302, { location: 'https://elsewhere.example/next' });
      res.end();
    });
    const res = await createPinnedFetch()(`http://example.invalid:${port}/`, '127.0.0.1');
    expect(res.status).toBe(302);
    expect(res.location).toBe('https://elsewhere.example/next');
    expect(res.text).toBe(''); // the redirected target is NOT fetched here
  });

  it('bounds the body to the byte cap (no unbounded buffering — DoS bound)', async () => {
    const port = await startServer((_req, res) => {
      res.writeHead(200);
      res.end('x'.repeat(2_000_000)); // 2 MB — far over the ~256 KiB cap
    });
    const res = await createPinnedFetch()(`http://example.invalid:${port}/big`, '127.0.0.1');
    expect(res.status).toBe(200);
    expect(res.text.length).toBeLessThanOrEqual(256 * 1024);
  });
});
