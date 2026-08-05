import { load } from "cheerio";
import { MIN_USABLE_INPUT_CHARS } from "@/lib/rewrite/config";
import {
  detectWall,
  FETCH_ALLOWLIST,
  FETCH_USER_AGENT,
  mayFetch,
  parseRobots,
  robotsAllows,
  type PublisherPolicy,
} from "@/lib/rewrite/fetch-policy";
import type { RewriteMode } from "@/lib/rewrite/prompt";

/**
 * RQ-006_02: decide what a rewrite is written from, and in which mode.
 *
 * The order is deliberate and it is the opposite of the plan's. The plan fetched the
 * page first and fell back to the excerpt. This uses what the feed already carries
 * first, and only considers fetching when the feed is thin and the publisher is on the
 * allowlist.
 *
 * That order came out of measuring the corpus. The collector used to truncate every
 * feed at 2000 characters, so text publishers already give away was being discarded on
 * ingestion; MIT Technology Review, Ars Technica and The Verge all publish more than
 * that. Reading what a feed carries covers more of the corpus than fetching would, and
 * raises no question about scraping.
 *
 * The unit's gate is that a paywalled source yields either a short honest output or
 * none. Both paths here end that way: a walled page falls back to the excerpt, and an
 * excerpt below the usable floor refuses outright.
 */

/** At or above this much text, the feed is treated as the full article. */
export const FULL_TEXT_CHARS = 1_500;

export type Provenance =
  | "feed-full"
  | "feed-excerpt"
  | "fetched"
  | "none";

export interface ResolvedInput {
  mode: RewriteMode;
  /** The text to write from. Empty only when `usable` is false. */
  source: string;
  provenance: Provenance;
  usable: boolean;
  /** One sentence for the record: why this text, and what was not done. */
  note: string;
}

/** Injected so the whole decision is testable without a network. */
export type FetchPage = (url: string) => Promise<{ status: number; body: string }>;

/**
 * Article text from an HTML page.
 *
 * Deliberately conservative: strip the furniture, prefer an <article> element when the
 * page has one, and otherwise take the paragraphs. Anything cleverer is a content
 * extractor, and getting that wrong quietly produces navigation text as an article.
 */
export function extractArticleText(html: string): string {
  const $ = load(html);

  $(
    "script, style, noscript, iframe, img, video, svg, nav, header, footer, aside, form, button"
  ).remove();

  const article = $("article").first();
  const scope = article.length > 0 ? article : $("body");

  const paragraphs = scope
    .find("p")
    .map((_, element) => $(element).text().trim())
    .get()
    .filter((text) => text.length > 0);

  const text = paragraphs.length > 0 ? paragraphs.join("\n\n") : scope.text();

  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

const fetchWithIdentity: FetchPage = async (url) => {
  const response = await fetch(url, {
    headers: { "User-Agent": FETCH_USER_AGENT },
    redirect: "follow",
  });

  return { status: response.status, body: await response.text() };
};

/**
 * Resolve the input for one article.
 *
 * `feedContent` is what the collector stored. `sourceUrl` is only used when a fetch is
 * both allowed and needed, and the allowlist is default deny, so on a default
 * deployment this function never makes a request.
 */
export async function resolveRewriteInput(
  input: {
    feedContent: string;
    sourceUrl: string;
  },
  options: {
    allowlist?: PublisherPolicy[];
    fetchPage?: FetchPage;
    /** Skip the network entirely, whatever the allowlist says. */
    offline?: boolean;
  } = {}
): Promise<ResolvedInput> {
  const feed = input.feedContent.trim();
  const allowlist = options.allowlist ?? FETCH_ALLOWLIST;

  // 1. The feed already carries the article. Nothing else to decide.
  if (feed.length >= FULL_TEXT_CHARS) {
    return {
      mode: "FULL_TEXT",
      source: feed,
      provenance: "feed-full",
      usable: true,
      note: `The feed carried ${feed.length} characters, so the article was not fetched.`,
    };
  }

  const verdict = mayFetch(input.sourceUrl, allowlist);

  // 2. The feed is thin and fetching is not permitted. Use what there is, honestly.
  if (!verdict.allowed || options.offline) {
    return excerptOrNothing(
      feed,
      options.offline
        ? "Fetching was skipped, so the feed excerpt is all there is."
        : `${verdict.allowed ? "Fetching was skipped" : verdict.reason}, so the feed excerpt is all there is.`
    );
  }

  // 3. Permitted. robots.txt decides the path, and a failure to read it is a refusal
  //    rather than an assumption: not knowing what a publisher allows is not
  //    permission.
  const fetchPage = options.fetchPage ?? fetchWithIdentity;
  const target = new URL(input.sourceUrl);

  try {
    const robots = await fetchPage(`${target.origin}/robots.txt`);

    // A missing robots.txt is an absence of restrictions, which is different from an
    // unreadable one. 404 means there are no rules; a 500 means we do not know.
    const rules =
      robots.status === 404
        ? parseRobots("")
        : robots.status === 200
          ? parseRobots(robots.body)
          : null;

    if (!rules) {
      return excerptOrNothing(
        feed,
        `robots.txt for ${verdict.domain} answered ${robots.status}, so the page was not fetched.`
      );
    }

    if (!robotsAllows(rules, target.pathname)) {
      return excerptOrNothing(
        feed,
        `robots.txt disallows ${target.pathname}, so the page was not fetched.`
      );
    }

    const page = await fetchPage(input.sourceUrl);

    if (page.status !== 200) {
      return excerptOrNothing(
        feed,
        `the page answered ${page.status}, so the feed excerpt is all there is.`
      );
    }

    const extracted = extractArticleText(page.body);
    const wall = detectWall({ extracted, excerpt: feed });

    if (wall.walled) {
      return excerptOrNothing(feed, `${wall.reason}, so the excerpt was used instead.`);
    }

    if (extracted.length < FULL_TEXT_CHARS) {
      return excerptOrNothing(
        feed,
        `the page yielded only ${extracted.length} characters, so it was treated as an excerpt.`
      );
    }

    return {
      mode: "FULL_TEXT",
      source: extracted,
      provenance: "fetched",
      usable: true,
      note: `Fetched from ${verdict.domain}, which is on the allowlist, and robots.txt permits it.`,
    };
  } catch (error) {
    return excerptOrNothing(
      feed,
      `fetching failed (${error instanceof Error ? error.message : "unknown error"}), so the feed excerpt is all there is.`
    );
  }
}

/**
 * The excerpt, or a refusal when there is not enough of it.
 *
 * This is where the unit's gate lands: a paywalled source ends up here, and it either
 * produces a short honest piece from the excerpt or nothing at all.
 */
function excerptOrNothing(feed: string, why: string): ResolvedInput {
  if (feed.length >= MIN_USABLE_INPUT_CHARS) {
    return {
      mode: "EXCERPT",
      source: feed,
      provenance: "feed-excerpt",
      usable: true,
      note: `Written from the feed excerpt: ${why}`,
    };
  }

  return {
    mode: "EXCERPT",
    source: "",
    provenance: "none",
    usable: false,
    note: `Nothing was generated: ${why} The excerpt is under the ${MIN_USABLE_INPUT_CHARS} character floor.`,
  };
}
