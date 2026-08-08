import { config } from "@/lib/config";
import { checkUrlTarget, type Resolver } from "@/lib/curation/url-safety";

/**
 * Fetch a feed's or an OPML file's XML, with every hop checked.
 *
 * ## Why this exists
 *
 * `rss-parser`'s `parseURL` does its own fetch, follows its own redirects, and applies no
 * safety check to any of them. `checkUrlTarget` was written for exactly this problem and
 * until 8 August 2026 it was used in one place: the inbound email path. The feed path,
 * whose URLs are supplied by an authenticated user through a form or an OPML import, had
 * no guard at all. `new URL("http://169.254.169.254/latest/meta-data/")` is a perfectly
 * valid URL, and that is the whole of the validation a new source had to pass.
 *
 * The symptom that made it visible was benign and pointed straight at it: the collector was
 * handing email addresses to the parser and the runtime logs filled with
 * `connect ECONNREFUSED 127.0.0.1`. The server was already attempting to connect to itself
 * every morning. Refused, this time.
 *
 * ## Why the body is fetched here rather than by the parser
 *
 * A check before `parseURL` would guard the first URL and nothing else, because the parser
 * follows redirects internally: a feed at a public address that answers 302 to a private
 * one would sail through. Following the chain here, one guarded hop at a time, is the only
 * version that holds. The caller then hands the XML to `parser.parseString`.
 *
 * This mirrors `unwrapUrl`, deliberately, and for the same reason stated there: manual
 * redirects, because `redirect: "follow"` hands the decision to the runtime and skips the
 * check on every hop after the first.
 */

export type FeedFetchResult =
  | { ok: true; xml: string; url: string }
  | { ok: false; reason: string };

export type FetchLike = (
  url: string,
  init: { method: string; redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }
) => Promise<{
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

const USER_AGENT =
  "newsletter4link/1.0 (+https://newsletter4link.vercel.app; julian.andrade@linkconsulting.com)";

const ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml, text/xml, text/x-opml, */*";

const isRedirect = (status: number) =>
  status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

/**
 * A URL that could not be a feed, refused before anything is opened.
 *
 * The first line of defence, and the one that catches the bug that exposed all of this: an
 * EMAIL source keeps its sender address in `url`, so `avi@dailydoseofds.com` reached the
 * parser and was resolved as a relative reference against nothing, which is how a feed
 * fetch became a connection to localhost. The query that selects sources is filtered by
 * type now, and this refuses the same thing again if any other caller gets it wrong.
 */
export function looksLikeFeedUrl(raw: string): boolean {
  return /^https?:\/\/[^\s/@]+\.[^\s/@]+/i.test(raw.trim());
}

export async function fetchFeedXml(
  url: string,
  options: {
    fetchImpl?: FetchLike;
    resolve?: Resolver;
    maxHops?: number;
    timeoutMs?: number;
    maxBytes?: number;
  } = {}
): Promise<FeedFetchResult> {
  const doFetch = (options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const maxHops = options.maxHops ?? config.feeds.maxRedirectHops;
  const timeoutMs = options.timeoutMs ?? config.feeds.timeoutMs;
  const maxBytes = options.maxBytes ?? config.feeds.maxBytes;

  if (!looksLikeFeedUrl(url)) {
    return { ok: false, reason: `"${url.slice(0, 60)}" is not an http feed address` };
  }

  let current = url;
  const seen = new Set<string>([url]);

  for (let hop = 0; ; hop += 1) {
    const verdict = await checkUrlTarget(current, options.resolve);

    if (!verdict.safe) {
      // The reason is stated but the address is not echoed back beyond what the caller
      // already supplied: this runs on behalf of a user who chose the URL, and a resolved
      // private address is the one detail worth not repeating into a stored error string.
      return { ok: false, reason: `refused: ${verdict.reason}` };
    }

    if (hop > maxHops) {
      return { ok: false, reason: `gave up after ${maxHops} redirects` };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Awaited<ReturnType<FetchLike>>;

    try {
      response = await doFetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: ACCEPT },
      });
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof Error ? error.message : "the request failed",
      };
    } finally {
      clearTimeout(timer);
    }

    if (isRedirect(response.status)) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, reason: `${response.status} with no location` };

      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return { ok: false, reason: "the redirect target was not a URL" };
      }

      if (seen.has(next)) return { ok: false, reason: "the redirects loop" };

      seen.add(next);
      current = next;
      continue;
    }

    if (!response.ok) {
      return { ok: false, reason: `${response.status} from the server` };
    }

    const xml = await response.text();

    /**
     * Bounded after reading rather than while streaming.
     *
     * `unwrapUrl` streams because it wants only the first few hundred bytes of a page it
     * is not interested in. A feed is wanted in full, so the cap is a sanity bound against
     * a source that serves a gigabyte, and truncating XML mid-document would hand the
     * parser something it must reject anyway.
     */
    if (xml.length > maxBytes) {
      return { ok: false, reason: `the feed is larger than ${maxBytes} characters` };
    }

    return { ok: true, xml, url: current };
  }
}
