// fetch_url SSRF guard (tool-use TU.3, KEY SAFETY RULE #3 — the fetch_url tool must never reach an
// internal/private resource). `assertSafeFetchUrl` is a PURE validator: public http(s) only, no embedded
// credentials, no loopback/private/link-local/unspecified/ULA host (IPv4 + IPv6, incl. IPv4-mapped). The
// URL the LLM picks is UNTRUSTED — the guard is the structural gate before any outbound fetch.
import { describe, it, expect } from 'vitest';
import { assertSafeFetchUrl } from '../../../../src/model-gateway/tools/ssrf';

function reason(raw: string): string | 'OK' {
  const r = assertSafeFetchUrl(raw);
  return r.ok ? 'OK' : r.reason;
}

describe('assertSafeFetchUrl — the fetch_url SSRF guard (rule #3)', () => {
  it('allows public http and https URLs', () => {
    const https = assertSafeFetchUrl('https://example.com/article?q=1');
    expect(https.ok).toBe(true);
    if (https.ok) expect(https.url).toContain('example.com');
    expect(reason('http://example.org/page')).toBe('OK');
    expect(reason('https://8.8.8.8/')).toBe('OK'); // a public IP literal is fine
    expect(reason('https://[2606:4700:4700::1111]/')).toBe('OK'); // a public IPv6 literal is fine
  });

  it('rejects non-http(s) schemes', () => {
    for (const u of [
      'file:///etc/passwd',
      'ftp://example.com/x',
      'gopher://example.com',
      'data:text/plain;base64,aGk=',
      'javascript:alert(1)',
      'about:blank',
    ]) {
      expect(reason(u), u).toBe('unsupported_scheme');
    }
  });

  it('rejects embedded credentials (a userinfo SSRF/exfil vector)', () => {
    expect(reason('https://user:pass@example.com/')).toBe('embedded_credentials');
    expect(reason('https://admin@example.com/')).toBe('embedded_credentials');
  });

  it('rejects loopback + localhost', () => {
    for (const u of [
      'http://localhost/',
      'http://localhost:8080/admin',
      'http://sub.localhost/',
      'http://127.0.0.1/',
      'http://127.0.0.2/',
      'https://[::1]/',
    ]) {
      expect(reason(u), u).not.toBe('OK');
    }
  });

  it('rejects RFC1918 private ranges (IPv4)', () => {
    for (const u of [
      'http://10.0.0.1/',
      'http://10.255.255.255/',
      'http://172.16.0.1/',
      'http://172.31.255.1/',
      'http://192.168.1.1/',
    ]) {
      expect(reason(u), u).not.toBe('OK');
    }
    // 172.32.x is PUBLIC (outside 172.16/12) — the guard must not over-block.
    expect(reason('http://172.32.0.1/')).toBe('OK');
  });

  it('rejects link-local incl. the cloud metadata IP (169.254.169.254)', () => {
    expect(reason('http://169.254.169.254/latest/meta-data/')).not.toBe('OK');
    expect(reason('http://169.254.0.1/')).not.toBe('OK');
  });

  it('rejects the unspecified / 0.0.0.0 range', () => {
    expect(reason('http://0.0.0.0/')).not.toBe('OK');
    expect(reason('http://0.0.0.1/')).not.toBe('OK');
  });

  it('rejects IPv6 ULA + link-local + unspecified + IPv4-embedded private (mapped/compatible/NAT64)', () => {
    for (const u of [
      'http://[fc00::1]/', // ULA
      'http://[fd12:3456::1]/', // ULA
      'http://[fe80::1]/', // link-local
      'http://[::]/', // unspecified
      'http://[::ffff:127.0.0.1]/', // IPv4-mapped loopback (normalized → ::ffff:7f00:1)
      'http://[::ffff:10.0.0.1]/', // IPv4-mapped private
      'http://[::7f00:1]/', // IPv4-COMPATIBLE loopback (deprecated; ::127.0.0.1)
      'http://[64:ff9b::a9fe:a9fe]/', // NAT64 of 169.254.169.254 (cloud metadata)
      'http://[64:ff9b::7f00:1]/', // NAT64 of 127.0.0.1
    ]) {
      expect(reason(u), u).not.toBe('OK');
    }
    // a PUBLIC IPv6 (Cloudflare) and a public NAT64 target stay allowed (no over-block).
    expect(reason('http://[2606:4700:4700::1111]/')).toBe('OK');
    expect(reason('http://[64:ff9b::808:808]/')).toBe('OK'); // NAT64 of 8.8.8.8 (public)
  });

  it('rejects malformed / empty input as invalid_url', () => {
    for (const u of ['', 'not a url', 'http://', '://nohost']) {
      expect(reason(u), u).toBe('invalid_url');
    }
  });

  it('rejects OBFUSCATED IP encodings of a private host (the classic SSRF bypass)', () => {
    // WHATWG `new URL` normalizes decimal / hex / octal / short-form / fullwidth-unicode / trailing-dot
    // IPv4 to the canonical dotted-quad BEFORE we inspect `hostname`, so each decodes to 127.0.0.1 / 0.0.0.0
    // and is blocked — there is no pre-normalization literal to slip past the guard.
    for (const u of [
      'http://2130706433/', // decimal  127.0.0.1
      'http://0x7f000001/', // hex      127.0.0.1
      'http://0x7f.0.0.1/', // mixed    127.0.0.1
      'http://127.1/', // short    127.0.0.1
      'http://017700000001/', // octal    127.0.0.1
      'http://127.0.0.1./', // trailing dot
      'http://①②⑦.0.0.1/', // fullwidth circled-digits ①②⑦ → 127.0.0.1
      'http://０．０．０．０/', // fullwidth 0.0.0.0
    ]) {
      expect(reason(u), u).toBe('private_host');
    }
  });
});
