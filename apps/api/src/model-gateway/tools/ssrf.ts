import { isIP } from 'node:net';

/**
 * fetch_url SSRF guard (tool-use TU.3, KEY SAFETY RULE #3 — the fetch_url tool must never reach an
 * internal/private resource). The URL the LLM picks is UNTRUSTED; `assertSafeFetchUrl` is the PURE,
 * synchronous, fail-closed gate that runs BEFORE any outbound request:
 *  - public `http:`/`https:` only (no `file:`/`ftp:`/`data:`/`gopher:`/`javascript:` …),
 *  - no embedded credentials (a userinfo SSRF/exfil vector),
 *  - no loopback/private/link-local/unspecified/ULA host — IPv4 + IPv6, incl. IPv4-mapped IPv6 and the
 *    cloud metadata IP (169.254.169.254, inside 169.254.0.0/16).
 *
 * This is the FIRST layer (literal host). DNS-rebinding (a public hostname that resolves to a private IP)
 * is the SECOND layer — a resolve-and-verify check the executor performs via an injected resolver before
 * fetching (see `fetch_url`'s `resolveHostIsPublic`). A non-IP, non-localhost hostname passes this literal
 * layer and is caught by that resolve check.
 */

export type SsrfReason =
  | 'invalid_url'
  | 'unsupported_scheme'
  | 'embedded_credentials'
  | 'private_host';

export type SsrfResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: SsrfReason };

/** Parse a dotted-quad to a 32-bit unsigned int, or null if it isn't a well-formed IPv4. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    n = n * 256 + octet;
  }
  return n >>> 0;
}

/** True iff `n` (a 32-bit IPv4 int) falls in a loopback / private / link-local / reserved / multicast block. */
function isPrivateIpv4Int(n: number): boolean {
  const inRange = (base: string, bits: number): boolean => {
    const b = ipv4ToInt(base);
    if (b === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return (
    inRange('0.0.0.0', 8) || // "this" network / unspecified
    inRange('10.0.0.0', 8) || // RFC1918
    inRange('100.64.0.0', 10) || // CGNAT
    inRange('127.0.0.0', 8) || // loopback
    inRange('169.254.0.0', 16) || // link-local (incl. 169.254.169.254 metadata)
    inRange('172.16.0.0', 12) || // RFC1918
    inRange('192.0.0.0', 24) || // IETF protocol assignments
    inRange('192.168.0.0', 16) || // RFC1918
    inRange('198.18.0.0', 15) || // benchmarking
    inRange('224.0.0.0', 4) || // multicast
    inRange('240.0.0.0', 4) // reserved (incl. 255.255.255.255 broadcast)
  );
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → fail closed
  return isPrivateIpv4Int(n);
}

/** True iff `addr` (an unbracketed IPv6 literal) is loopback / unspecified / ULA / link-local / mapped-private. */
function isPrivateIpv6(addr: string): boolean {
  const a = addr.toLowerCase();
  if (a === '::1' || a === '::') return true; // loopback / unspecified
  // IPv4-EMBEDDED forms — decode the trailing 32 bits as a v4 int and reuse the v4 ranges. WHATWG URL
  // normalizes the dotted forms to hex (`::ffff:127.0.0.1` → `::ffff:7f00:1`), so match the hex hextet pair
  // for the three prefixes that carry an embedded v4:
  //   ::ffff:H:H   — IPv4-mapped (the common form)
  //   ::H:H        — IPv4-compatible (deprecated; `::127.0.0.1` → `::7f00:1`)
  //   64:ff9b::H:H — NAT64 well-known prefix (`169.254.169.254` → `64:ff9b::a9fe:a9fe`)
  const embeddedV4Prefix = /^(?:::ffff:|64:ff9b::|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;
  const hex = a.match(embeddedV4Prefix);
  if (hex) return isPrivateIpv4Int(((parseInt(hex[1]!, 16) << 16) | parseInt(hex[2]!, 16)) >>> 0);
  const dotted = a.match(/^(?:::ffff:|64:ff9b::|::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateIpv4(dotted[1]!);
  const firstHextet = a.startsWith('::') ? '' : (a.split(':')[0] ?? '');
  if (/^f[cd]/.test(firstHextet)) return true; // fc00::/7 ULA
  if (/^fe[89ab]/.test(firstHextet)) return true; // fe80::/10 link-local
  return false;
}

/** Strip the brackets WHATWG URL keeps on an IPv6 `hostname` (`[::1]` → `::1`); plain hosts pass through. */
export function unbracketHost(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

/** True iff the host is loopback/private/link-local/etc by LITERAL inspection (localhost + IP literals). */
export function isPrivateHost(hostname: string): boolean {
  const host = unbracketHost(hostname);
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  const kind = isIP(host);
  if (kind === 4) return isPrivateIpv4(host);
  if (kind === 6) return isPrivateIpv6(host);
  return false; // a non-IP, non-localhost hostname — the DNS-resolve layer is the second gate
}

export function assertSafeFetchUrl(raw: string): SsrfResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported_scheme' };
  }
  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'embedded_credentials' };
  }
  if (url.hostname === '') {
    return { ok: false, reason: 'invalid_url' };
  }
  if (isPrivateHost(url.hostname)) {
    return { ok: false, reason: 'private_host' };
  }
  return { ok: true, url: url.href };
}
