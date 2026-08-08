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
  /**
   * Substack's `?redirect=app-store`, which is not a campaign tag but a change of
   * destination: the slug is the article's, and the parameter sends the reader to an app
   * listing instead. Three production articles carried it and none of them opened the
   * piece they were titled after.
   */
  /^redirect$/i,
];

/**
 * Wrappers whose own address is never an article.
 *
 * Narrow and explicit, because the cost of a false positive is a warning chip on a link
 * that was fine, and the cost of a false negative is one wrong article. A host is only
 * listed here if landing on it means the unwrapping did not finish.
 */
function isWrapperUrl(raw: string): boolean {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  // beehiiv's click trackers, which answer 200 and redirect in the browser.
  if (/(^|\.)beehiiv\.com$/.test(host) && /^\/(ss|v2)\/c\//.test(path)) return true;
  // Substack's, in both the decodable and the opaque spelling.
  if (/(^|\.)substack\.com$/.test(host) && path.startsWith("/redirect/")) return true;

  return false;
}

/**
 * The target a Substack redirect carries in its own path.
 *
 * `substack.com/redirect/2/<base64url>` decodes to `{"e":"https://…"}`. No round trip, no
 * guess, and it works even when the wrapper refuses us. The other spelling,
 * `/redirect/<uuid>?j=…`, encodes the *subscriber* rather than the target and is not
 * decodable, so it falls through to the network path.
 */
function decodeWrapper(raw: string): string | null {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (!/(^|\.)substack\.com$/.test(url.hostname.toLowerCase())) return null;

  const match = url.pathname.match(/^\/redirect\/2\/([A-Za-z0-9_-]+)\/?$/);
  if (!match) return null;

  try {
    const decoded = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8"));
    const target = typeof decoded?.e === "string" ? decoded.e : null;
    // Validated as a URL here rather than trusted: this is attacker-influenced input, and
    // the caller resolves it as a hop, which runs it through the safety check.
    return target && /^https?:\/\//i.test(target) ? target : null;
  } catch {
    return null;
  }
}

/**
 * A redirect expressed in the page rather than in a header.
 *
 * A tracking wrapper that answers 200 has not told us anything yet; the redirect is in the
 * body, as a meta refresh or a `location` assignment. Both spellings are read, because
 * beehiiv uses the second and plenty of others use the first.
 *
 * Only the prefix of the body is searched, which the fetch already bounds: a redirect stub
 * is a few hundred bytes, and anything that needs more than that is a real page.
 */
export function inPageRedirect(body: string): string | null {
  const meta = body.match(
    /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=\s*([^"'\s;]+)/i
  );
  if (meta?.[1]) return meta[1];

  // `location = "x"`, `location.href = "x"`, `location.replace("x")`, `location.assign("x")`,
  // with or without the `window.` prefix, which is how these stubs are actually written.
  const script = body.match(
    /location(?:\.href)?\s*(?:=|\.replace\s*\(|\.assign\s*\()\s*["']([^"']+)["']/i
  );
  if (script?.[1] && /^https?:\/\//i.test(script[1])) return script[1];

  return null;
}

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
) => Promise<{ status: number; location: string | null; body?: string | null }>;

/**
 * How much of a wrapper's page is read looking for an in-page redirect.
 *
 * A redirect stub is a few hundred bytes and puts its target in the head. Anything past
 * this is a real page, whose content we do not want and must not pay to download: the
 * original design read no body at all precisely so a hop could not stream a gigabyte.
 */
const MAX_BODY_CHARS = 16_000;

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

    /**
     * The body is read only for a GET, and only a bounded prefix of it.
     *
     * HEAD still costs nothing, which is why it is still tried first. The GET happens on
     * one path: a wrapper answered without a Location and the redirect can only be in the
     * page. The stream is cancelled the moment enough has been seen.
     */
    let body: string | null = null;

    if (method === "GET" && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let collected = "";

      try {
        while (collected.length < MAX_BODY_CHARS) {
          const { done, value } = await reader.read();
          if (done) break;
          collected += decoder.decode(value, { stream: true });
        }
      } finally {
        await reader.cancel().catch(() => {});
      }

      body = collected.slice(0, MAX_BODY_CHARS);
    }

    return { status: response.status, location: response.headers.get("location"), body };
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

  /**
   * Landing on a wrapper is not an answer.
   *
   * Applied to every exit from the loop rather than to one branch, because the loop can
   * leave for six different reasons and five of them used to claim success. A URL still
   * on a tracking host is the newsletter's link, not the publisher's, and saying so is
   * what puts the warning on the row instead of quietly shipping it.
   */
  const finish = (result: UnwrapResult): UnwrapResult =>
    result.unwrapped && isWrapperUrl(result.url)
      ? { ...result, unwrapped: false, note: result.note ?? "stopped: still a tracking wrapper" }
      : result;

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
      return finish({
        // The last safe URL, or the caller's own input when the input was the problem: the
        // caller already has that one, so returning it reveals nothing new.
        url: cleanUrl(lastSafe ?? raw),
        unwrapped: false,
        hops,
        note: `stopped: ${verdict.reason}`,
      });
    }

    lastSafe = current;

    if (hops >= maxHops) {
      return finish({
        url: cleanUrl(current),
        unwrapped: false,
        hops,
        note: `stopped after ${maxHops} hops`,
      });
    }

    /**
     * The wrapper that answers itself.
     *
     * Checked before any request, because a Substack redirect carries its target in its
     * own path and asking the network for it would be slower, less reliable and no more
     * correct. The target becomes an ordinary hop, so it goes through the safety check
     * at the top of the next iteration like everything else.
     */
    const carried = decodeWrapper(current);

    if (carried && !seen.has(carried)) {
      seen.add(carried);
      current = carried;
      hops += 1;
      continue;
    }

    let response: { status: number; location: string | null; body?: string | null };

    try {
      response = await fetchHead(current, "HEAD");

      if (response.status === 405 || response.status === 501) {
        response = await fetchHead(current, "GET");
      }
    } catch (error) {
      return finish({
        url: cleanUrl(current),
        unwrapped: hops > 0,
        hops,
        note: `stopped: ${error instanceof Error ? error.message : "request failed"}`,
      });
    }

    if (!isRedirect(response.status) || !response.location) {
      /**
       * A wrapper that answered without a Location has not finished talking.
       *
       * beehiiv's click trackers answer 200 with a page that redirects in the browser, so
       * treating "not a 3xx" as "this is the destination" stored the wrapper as the
       * article's own address, and asserted it had resolved it. Only wrappers get this
       * second look: a publisher answering 200 is a page, and fetching its body to be told
       * so would cost a download per article for nothing.
       */
      if (isWrapperUrl(current)) {
        const body =
          response.body ??
          (await fetchHead(current, "GET").catch(() => null))?.body ??
          "";
        const target = inPageRedirect(body);

        if (target) {
          let resolved: string | null = null;

          try {
            resolved = new URL(target, current).toString();
          } catch {
            resolved = null;
          }

          if (resolved && !seen.has(resolved)) {
            seen.add(resolved);
            current = resolved;
            hops += 1;
            continue;
          }
        }
      }

      return finish({
        url: cleanUrl(current),
        // True once at least one hop was followed, or when the URL was never a wrapper and
        // resolved to itself, which is the same fact: this is where it points. `finish`
        // takes it back when the URL is still a wrapper.
        unwrapped: true,
        hops,
        note: null,
      });
    }

    let next: string;

    try {
      // Resolved against the current URL, because a Location may be relative.
      next = new URL(response.location, current).toString();
    } catch {
      return finish({
        url: cleanUrl(current),
        unwrapped: hops > 0,
        hops,
        note: "stopped: the redirect target was not a URL",
      });
    }

    if (seen.has(next)) {
      return finish({
        url: cleanUrl(current),
        unwrapped: false,
        hops,
        note: "stopped: the redirects loop",
      });
    }

    seen.add(next);
    current = next;
    hops += 1;
  }
}
