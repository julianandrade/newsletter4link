import { config } from "@/lib/config";
import { checkUrlTarget, type Resolver } from "@/lib/curation/url-safety";

/**
 * RQ-007 step 3: resolve a tracking wrapper to the article it points at, and strip the
 * campaign parameters.
 *
 * Mandatory, as the plan says, and for the reason it gives: URL dedup breaks without it.
 * The same story arriving through an RSS feed and through two newsletters produces three
 * different wrapper URLs, and none of them equals the article's own.
 *
 * Every hop goes through the safety check. The URLs come from an email, so a chain ending
 * at a private address is the expected attack rather than an unlikely accident.
 */

/** Parameters that identify a campaign rather than a document. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^ref$/i,
  /^ref_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^mc_cid$/i,
  /^mc_eid$/i,
  /^_bhlid$/i,
  /^publication_id$/i,
  /^post_id$/i,
  /^triedRedirect$/i,
  /^isFreemail$/i,
  /^email$/i,
  /^r$/i,
  /^s$/i,
];

export interface UnwrapResult {
  /** The best URL found. The input, cleaned, when nothing better was reachable. */
  url: string;
  /** False when the chain could not be followed, so a caller can say so rather than assume. */
  unwrapped: boolean;
  /** How many hops were followed. */
  hops: number;
  /** Why unwrapping stopped, when it stopped early. */
  note: string | null;
}

/**
 * Remove campaign parameters, and normalize enough that two spellings of one URL match.
 *
 * Fragment goes: `#section` is a position in a document, not a different document, and a
 * newsletter appends `#readmore` freely. A trailing slash on a path is kept, because
 * `/a/` and `/a` are genuinely different for some servers, but a bare trailing slash on the
 * root is dropped since `https://x.com/` and `https://x.com` are not.
 */
export function cleanUrl(raw: string): string {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) {
      url.searchParams.delete(key);
    }
  }

  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  if (url.pathname === "/") url.pathname = "";

  // Drop a default port so it cannot make two identical URLs compare unequal.
  if (
    (url.protocol === "http:" && url.port === "80") ||
    (url.protocol === "https:" && url.port === "443")
  ) {
    url.port = "";
  }

  return url.toString();
}

export type HeadFetch = (
  url: string,
  method: "HEAD" | "GET"
) => Promise<{ status: number; location: string | null }>;

const realFetch: HeadFetch = async (url, method) => {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    config.emailIngest.redirectTimeoutMs
  );

  try {
    const response = await fetch(url, {
      method,
      // Manual, so every Location is checked before it is followed. `redirect: "follow"`
      // would hand the whole decision to the runtime and skip the safety check on every hop
      // after the first.
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "newsletter4link/1.0 (+https://newsletter4link.vercel.app; julian.andrade@linkconsulting.com)",
      },
    });

    // The body is never read. Only the final URL is wanted, and a hop that starts streaming
    // a gigabyte should cost nothing.
    return { status: response.status, location: response.headers.get("location") };
  } finally {
    clearTimeout(timer);
  }
};

const isRedirect = (status: number) =>
  status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

/**
 * Follow a wrapper to what it wraps.
 *
 * HEAD first, because it costs nothing, then GET once if HEAD is refused: plenty of tracking
 * endpoints answer 405 to HEAD, and giving up there would leave every one of those wrapped.
 */
export async function unwrapUrl(
  raw: string,
  options: {
    fetchHead?: HeadFetch;
    resolve?: Resolver;
    maxHops?: number;
  } = {}
): Promise<UnwrapResult> {
  const fetchHead = options.fetchHead ?? realFetch;
  const maxHops = options.maxHops ?? config.emailIngest.maxRedirectHops;

  let current = raw;
  let hops = 0;

  /**
   * The last URL that passed the safety check.
   *
   * Needed because the check runs at the top of the loop, on the URL just moved to, so at
   * the moment a hop is refused `current` is the refused URL. Returning that would hand a
   * private address back to be stored as an article's source and fetched by something else
   * later, which is the whole thing this guard exists to prevent.
   */
  let lastSafe: string | null = null;

  const seen = new Set<string>([raw]);

  for (;;) {
    const verdict = await checkUrlTarget(current, options.resolve);

    if (!verdict.safe) {
      return {
        // The last safe URL, or the caller's own input when the input was the problem: the
        // caller already has that one, so returning it reveals nothing new.
        url: cleanUrl(lastSafe ?? raw),
        unwrapped: false,
        hops,
        note: `stopped: ${verdict.reason}`,
      };
    }

    lastSafe = current;

    if (hops >= maxHops) {
      return {
        url: cleanUrl(current),
        unwrapped: false,
        hops,
        note: `stopped after ${maxHops} hops`,
      };
    }

    let response: { status: number; location: string | null };

    try {
      response = await fetchHead(current, "HEAD");

      if (response.status === 405 || response.status === 501) {
        response = await fetchHead(current, "GET");
      }
    } catch (error) {
      return {
        url: cleanUrl(current),
        unwrapped: hops > 0,
        hops,
        note: `stopped: ${error instanceof Error ? error.message : "request failed"}`,
      };
    }

    if (!isRedirect(response.status) || !response.location) {
      return {
        url: cleanUrl(current),
        // True once at least one hop was followed, or when the URL was never a wrapper and
        // resolved to itself, which is the same fact: this is where it points.
        unwrapped: true,
        hops,
        note: null,
      };
    }

    let next: string;

    try {
      // Resolved against the current URL, because a Location may be relative.
      next = new URL(response.location, current).toString();
    } catch {
      return {
        url: cleanUrl(current),
        unwrapped: hops > 0,
        hops,
        note: "stopped: the redirect target was not a URL",
      };
    }

    if (seen.has(next)) {
      return {
        url: cleanUrl(current),
        unwrapped: false,
        hops,
        note: "stopped: the redirects loop",
      };
    }

    seen.add(next);
    current = next;
    hops += 1;
  }
}
