/**
 * RQ-007 review F3: is this URL safe to make a request to?
 *
 * The URLs this guards come out of emails, which makes them attacker-supplied by
 * definition: anyone who can get a message to the ingestion address chooses them. Resolving
 * a tracking wrapper means following redirects, and a redirect chain can end wherever it
 * likes, including inside whatever network the function runs in.
 *
 * The plan followed up to five hops with no restriction on where a hop could go. That is a
 * server-side request forgery: `http://169.254.169.254/` is the cloud metadata service,
 * `http://localhost:3000/` is this application, and a private address is whatever else is
 * reachable from the runtime.
 *
 * Two properties matter and both are easy to get wrong:
 *
 * - Every hop is checked, not only the first. A public URL redirecting to a private one is
 *   the whole technique.
 * - The hostname is resolved rather than pattern matched. `http://127.0.0.1/` is obvious,
 *   `http://localtest.me/` resolves to it, and no amount of string matching catches a name
 *   whose owner points it at loopback.
 */

import { lookup } from "dns/promises";

export type UrlVerdict = { safe: true } | { safe: false; reason: string };

/** Ports a public web page is served from. Anything else is a service, not a page. */
const ALLOWED_PORTS = new Set(["", "80", "443"]);

/**
 * Checks that do not need the network.
 *
 * Separated so the cheap refusals happen before any DNS traffic, and so this half can be
 * tested without resolving anything.
 */
export function checkUrlShape(raw: string): UrlVerdict {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return { safe: false, reason: "not a URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    // file:, gopher:, data: and friends. An email is not allowed to name them.
    return { safe: false, reason: `scheme ${url.protocol} is not allowed` };
  }

  if (url.username.length > 0 || url.password.length > 0) {
    // Credentials in a URL are either a phishing shape or an attempt to authenticate
    // somewhere on our behalf.
    return { safe: false, reason: "the URL carries credentials" };
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    return { safe: false, reason: `port ${url.port} is not allowed` };
  }

  if (url.hostname.length === 0) {
    return { safe: false, reason: "no hostname" };
  }

  return { safe: true };
}

/** Whether an IPv4 address is somewhere we must not send a request. */
export function isBlockedIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;

  const [a, b, c] = parts;

  /**
   * The narrow ranges are /24s and must be matched as /24s.
   *
   * Three of them were written as /16s, which blocked 256 times more address space than
   * the reservation covers. It was not theoretical: on 6 August 2026 one Morning Brew
   * issue lost five articles, because techcrunch.com, variety.com, deadline.com and
   * hollywoodreporter.com all resolve into 192.0.66.0/24 — ordinary public space that
   * happens to sit inside the /16 next to the reserved /24s.
   *
   * A guard that refuses real publishers is not a stricter guard, it is a broken one.
   */
  return (
    a === 0 || // this network
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier grade NAT
    (a === 169 && b === 254) || // link local, which is where cloud metadata lives
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments, 192.0.0.0/24
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1, 192.0.2.0/24
    (a === 198 && (b === 18 || b === 19)) || // benchmarking, 198.18.0.0/15
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2, 198.51.100.0/24
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3, 203.0.113.0/24
    a >= 224 // multicast, reserved and broadcast
  );
}

/** Whether an IPv6 address is somewhere we must not send a request. */
export function isBlockedIpv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0];

  if (value === "::" || value === "::1") return true;

  // An IPv4-mapped address is an IPv4 address wearing a hat, so it is judged as one.
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);

  const first = value.split(":")[0];
  const leading = parseInt(first || "0", 16);

  // fc00::/7 unique local, fe80::/10 link local, ff00::/8 multicast.
  if ((leading & 0xfe00) === 0xfc00) return true;
  if ((leading & 0xffc0) === 0xfe80) return true;
  if ((leading & 0xff00) === 0xff00) return true;

  return false;
}

export type Resolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const systemResolver: Resolver = (hostname) => lookup(hostname, { all: true });

/**
 * The full check: shape, then where the name actually points.
 *
 * Every resolved address must be acceptable, not just the first. A name answering with one
 * public and one private address would otherwise pass here and connect to the private one,
 * since which address a connection uses is not ours to choose.
 */
export async function checkUrlTarget(
  raw: string,
  resolve: Resolver = systemResolver
): Promise<UrlVerdict> {
  const shape = checkUrlShape(raw);
  if (!shape.safe) return shape;

  const hostname = new URL(raw).hostname.replace(/^\[|\]$/g, "");

  // A literal address needs no resolution, and passing one to a resolver is how a check
  // gets skipped by a DNS server that answers anything.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return isBlockedIpv4(hostname)
      ? { safe: false, reason: `${hostname} is not a public address` }
      : { safe: true };
  }

  if (hostname.includes(":")) {
    return isBlockedIpv6(hostname)
      ? { safe: false, reason: `${hostname} is not a public address` }
      : { safe: true };
  }

  let addresses: Array<{ address: string; family: number }>;

  try {
    addresses = await resolve(hostname);
  } catch {
    // A name that does not resolve is not followed. Not knowing where it points is not a
    // reason to try.
    return { safe: false, reason: `${hostname} did not resolve` };
  }

  if (addresses.length === 0) {
    return { safe: false, reason: `${hostname} resolved to nothing` };
  }

  for (const { address, family } of addresses) {
    const blocked = family === 6 ? isBlockedIpv6(address) : isBlockedIpv4(address);

    if (blocked) {
      return {
        safe: false,
        reason: `${hostname} resolves to ${address}, which is not a public address`,
      };
    }
  }

  return { safe: true };
}
