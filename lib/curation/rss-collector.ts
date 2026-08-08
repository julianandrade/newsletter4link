import Parser from "rss-parser";
import { load } from "cheerio";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { mapWithConcurrency } from "@/lib/concurrency";
import { fetchFeedXml } from "@/lib/curation/feed-fetch";
import { pgSafe } from "@/lib/pg-safe-text";

interface RSSArticle {
  title: string;
  link: string;
  content: string;
  author?: string;
  publishedAt: Date;
  sourceUrl: string;
  sourceName: string;
  /**
   * Finding D1: the feed's own row id, so the article can point back at it.
   *
   * Optional because the config fallback below has no database row. `sourceName` has been
   * carried here all along and the curator used it in log lines and then dropped it, which
   * is why no article knew which of the 442 feeds found it.
   */
  sourceId?: string;
}

/**
 * Upper bound on stored feed content.
 *
 * Matches the rewrite pipeline's own input cap, so nothing is stored that could never
 * be used, and nothing usable is discarded on the way in.
 */
const MAX_FEED_CONTENT_CHARS = 24_000;

/**
 * Most items to take from one feed.
 *
 * Feeds are supposed to carry a recent window. The OpenAI blog feed returns 834 items,
 * its whole archive, while every other active feed returns between 10 and 41, and that
 * one feed was 81% of everything collected. Scoring an archive on every run is spend on
 * news nobody will publish.
 */
const MAX_ITEMS_PER_FEED = 60;

const parser = new Parser({
  /**
   * Some publishers refuse an unidentified client. InfoQ answers 406 to the default
   * user agent, so it was silently absent from every collection while showing as an
   * active source.
   */
  headers: {
    "User-Agent":
      "newsletter4link/1.0 (+https://newsletter4link.vercel.app; julian.andrade@linkconsulting.com)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["description", "description"],
      ["media:content", "mediaContent"],
    ],
  },
});

/**
 * Clean HTML content and extract plain text
 */
function cleanHtmlContent(html: string): string {
  const $ = load(html);

  // Remove script and style tags
  $("script, style, iframe, img, video").remove();

  // Get text and clean up
  let text = $.text();

  // Remove extra whitespace
  text = text.replace(/\s+/g, " ").trim();

  /**
   * Kept long. The old cap was 2000 characters, for the embedding.
   *
   * That cap was redundant: `generateEmbedding` already truncates its own input to
   * 8000 characters, because that is its model's limit and not this function's
   * business. What the cap did instead was throw away text the publisher had already
   * given us. MIT Technology Review, Ars Technica and The Verge all publish more than
   * 2000 characters in their feeds, and 1416 stored articles are cut at exactly 2003.
   *
   * It matters for RQ-006, which needs real text to write from and refuses when there
   * is too little. Recovering what the feed already carries is a better answer than
   * fetching the publisher's page, and it raises no question about scraping at all.
   *
   * The remaining cap is a sanity bound against a feed that inlines an entire book.
   */
  if (text.length > MAX_FEED_CONTENT_CHARS) {
    text = text.substring(0, MAX_FEED_CONTENT_CHARS) + "...";
  }

  return text;
}

/**
 * The author of a feed item, whatever shape the feed chose to express it in.
 *
 * This was `pgSafe(item.creator || (item as any).author || "")`, which assumes both fields
 * are strings. Atom allows `<author>` to be a structured element and `rss-parser` returns
 * it as an object, so `pgSafe` called `.replace` on an object and threw. The throw escapes
 * the item loop rather than skipping the item, so **one such item loses the whole feed**:
 * that is the entirety of "Failed to fetch RSS feed Google AI Blog: e.replace is not a
 * function", and why no article from Google had ever arrived.
 *
 * Undefined rather than a placeholder when it cannot be read. An author is optional
 * everywhere downstream, and a feed is worth more than a byline.
 */
export function feedAuthor(item: unknown): string | undefined {
  const source = (item ?? {}) as { creator?: unknown; author?: unknown };

  const read = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    // `{ name: "..." }`, and the same wrapped in an array, which is how some parsers hand
    // back a repeated element.
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const name = (value as { name?: unknown }).name;
      if (typeof name === "string") return name;
      if (Array.isArray(name) && typeof name[0] === "string") return name[0];
    }
    return null;
  };

  const raw = read(source.creator) ?? read(source.author);
  if (raw === null) return undefined;

  const cleaned = pgSafe(raw).trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Fetch and parse a single RSS feed
 */
export async function fetchRSSFeed(
  url: string,
  sourceName: string,
  sourceId?: string
): Promise<RSSArticle[]> {
  try {
    /**
     * Fetched through `fetchFeedXml`, not `parser.parseURL`.
     *
     * `parseURL` does its own fetch and follows its own redirects with no safety check on
     * any of them, which left the whole feed path without the SSRF guard the inbound email
     * path has had since it was written. See `lib/curation/feed-fetch.ts`: the check has to
     * happen per hop, so the body is fetched here and only the parsing is left to the
     * library.
     */
    const fetched = await fetchFeedXml(url);

    if (!fetched.ok) throw new Error(fetched.reason);

    const feed = await parser.parseString(fetched.xml);
    const articles: RSSArticle[] = [];

    // Newest first is the order feeds publish in, so the cap keeps the recent window
    // rather than an arbitrary slice.
    for (const item of feed.items.slice(0, MAX_ITEMS_PER_FEED)) {
      if (!item.link || !item.title) continue;

      // Get content from various possible fields
      const rawContent =
        (item as any).contentEncoded ||
        item.content ||
        item.description ||
        item.summary ||
        "";

      // Clean HTML to plain text
      const content = cleanHtmlContent(rawContent);

      // Skip if content is too short
      if (content.length < 100) continue;

      // Parse published date
      let publishedAt = new Date();
      if (item.pubDate) {
        publishedAt = new Date(item.pubDate);
      } else if (item.isoDate) {
        publishedAt = new Date(item.isoDate);
      }

      articles.push({
        // Cleaned at the boundary, like the search provider and the inbound email path.
        // Feed XML forbids a NUL, and malformed feeds carry them anyway.
        title: pgSafe(item.title ?? ""),
        link: item.link,
        content: pgSafe(content),
        author: feedAuthor(item),
        publishedAt,
        sourceUrl: url,
        sourceName,
        sourceId,
      });
    }

    return articles;
  } catch (error) {
    console.error(`Error fetching RSS feed ${sourceName}:`, error);
    throw new Error(
      `Failed to fetch RSS feed ${sourceName}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * One feed: fetch it, keep what is recent, and record the outcome on its row.
 *
 * Its own function because two callers had the same twenty lines and only one of them
 * would have been fixed. Nothing here throws: a pool that rejects takes the whole
 * collection with it, and one publisher answering 406 must not cost the other fourteen
 * their articles.
 */
async function collectOne(
  source: { id?: string; name: string; url: string },
  cutoffDate: Date,
  organizationId?: string
): Promise<{ articles: RSSArticle[]; error: string | null }> {
  try {
    const articles = await fetchRSSFeed(source.url, source.name, source.id);
    const fresh = articles.filter((article) => article.publishedAt >= cutoffDate);

    console.log(
      `✓ ${source.name}: ${fresh.length} articles (${articles.length - fresh.length} older than the window)`
    );

    if (organizationId) {
      try {
        await updateRSSSourceFetchedAt(source.url, organizationId);
      } catch {
        // The config fallback has no row to update.
      }
    }

    return { articles: fresh, error: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    console.error(`✗ ${source.name}: ${reason}`);

    if (organizationId) {
      try {
        await updateRSSSourceFetchedAt(source.url, organizationId, reason);
      } catch {
        // As above.
      }
    }

    return { articles: [], error: reason };
  }
}

/**
 * Fetch a list of feeds, several at a time, inside a time budget.
 *
 * ## Why this is not a `for` loop any more
 *
 * It was one, with an `await` per feed, and a feed fetch is almost entirely waiting. At
 * fifteen active feeds that is tolerable. This project has 434 feeds in one organization,
 * 427 of them imported and dormant because the OPML import creates everything inactive by
 * default, and the day somebody switches them on a sequential run cannot finish inside the
 * 300-second function ceiling. "Curation API Timeout" is already a known issue here.
 *
 * ## Why there is a deadline as well as a pool
 *
 * Concurrency alone only moves the wall. The budget makes a list too long to finish
 * degrade into "these are the ones that fitted, and here is what was left", which a caller
 * can report, rather than an invocation killed mid-flight that says nothing at all. That
 * is the same lesson the email ingest learned on 6 August 2026.
 */
async function collectFromSources(
  sources: Array<{ id?: string; name: string; url: string }>,
  maxAgeDays: number,
  organizationId?: string
): Promise<RSSArticle[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  const deadline = Date.now() + config.feeds.fetchBudgetMs;
  let skipped = 0;

  const results = await mapWithConcurrency(
    sources,
    config.feeds.concurrency,
    async (source) => {
      if (Date.now() >= deadline) {
        skipped += 1;
        return { articles: [] as RSSArticle[], error: null };
      }

      return collectOne(source, cutoffDate, organizationId);
    }
  );

  if (skipped > 0) {
    // Stated, never silent. A shorter list of articles is indistinguishable from a quiet
    // news day unless the run says it ran out of time.
    console.warn(
      `[RSS] the ${config.feeds.fetchBudgetMs}ms fetch budget ran out with ${skipped} of ${sources.length} feed(s) untouched`
    );
  }

  return results.flatMap((result) => result.articles);
}

/**
 * Fetch every active feed for an organization.
 */
export async function fetchAllRSSFeeds(
  maxAgeDays: number = 7,
  organizationId?: string
): Promise<RSSArticle[]> {
  let sources: Array<{ id?: string; name: string; url: string }> = [];

  /**
   * The fallback to `config.rssSources` is now announced.
   *
   * It used to be silent in both of its branches, which is the shape of bug this codebase
   * keeps finding: an organization with every feed paused, or one whose query failed,
   * quietly collected from a seven-entry list hardcoded in `lib/config.ts` and the result
   * looked like a normal run. Somebody reading the articles would have had no way to know
   * they came from somebody else's defaults.
   */
  if (!organizationId) {
    console.warn("[RSS] no organization given, collecting from the built-in default feeds");
    sources = [...config.rssSources];
  } else {
    try {
      const dbSources = await getActiveRSSSources(organizationId);

      if (dbSources.length > 0) {
        sources = dbSources;
      } else {
        console.warn(
          `[RSS] organization ${organizationId} has no active RSS source; collecting from the built-in default feeds`
        );
        sources = [...config.rssSources];
      }
    } catch (error) {
      console.error(
        `[RSS] could not read the sources of ${organizationId}, falling back to the built-in default feeds:`,
        error
      );
      sources = [...config.rssSources];
    }
  }

  return collectFromSources(sources, maxAgeDays, organizationId);
}

/**
 * Save RSS source to database (for a specific organization)
 */
export async function saveRSSSource(
  name: string,
  url: string,
  category: string,
  organizationId: string
) {
  return await prisma.rSSSource.upsert({
    where: {
      url_organizationId: {
        url,
        organizationId,
      },
    },
    create: {
      name,
      url,
      category,
      active: true,
      organizationId,
    },
    update: {
      name,
      category,
      active: true,
    },
  });
}

/**
 * Update RSS source last fetched timestamp (for a specific organization)
 */
export async function updateRSSSourceFetchedAt(url: string, organizationId: string, error?: string) {
  return await prisma.rSSSource.update({
    where: {
      url_organizationId: {
        url,
        organizationId,
      },
    },
    data: {
      lastFetchedAt: new Date(),
      lastError: error || null,
    },
  });
}

/**
 * Get all active RSS sources from database (for a specific organization)
 */
export async function getActiveRSSSources(organizationId: string) {
  return await prisma.rSSSource.findMany({
    /**
     * `type: "RSS"`, which was missing, and that omission was doing real damage daily.
     *
     * An EMAIL source keeps its sender address in `url`, deliberately, so this query
     * returned all thirty of this project's newsletters and the collector handed
     * `avi@dailydoseofds.com` to the feed parser. Every morning the run made thirty
     * failing requests, the logs filled with `connect ECONNREFUSED 127.0.0.1`, and
     * `updateRSSSourceFetchedAt` then stamped `lastError` onto the EMAIL rows.
     *
     * That last part is the bit that mattered. The sources screen reads `lastError` to
     * show a source's health, so on 8 August 2026 all thirty newsletters were displayed
     * as broken while every one of them was working.
     */
    where: { active: true, organizationId, type: "RSS" },
  });
}

/**
 * Fetch RSS feeds by specific source IDs (for a specific organization)
 * Only fetches from sources that exist and are active
 */
export async function fetchRSSFeedsByIds(
  sourceIds: string[],
  maxAgeDays: number = 7,
  organizationId?: string
): Promise<RSSArticle[]> {
  // Get sources from database by IDs (only active ones)
  const sources = await prisma.rSSSource.findMany({
    where: {
      id: { in: sourceIds },
      active: true,
      // See getActiveRSSSources: an EMAIL source's `url` is an address, not a feed.
      type: "RSS",
      ...(organizationId && { organizationId }),
    },
  });

  return collectFromSources(sources, maxAgeDays, organizationId);
}

/**
 * Initialize default RSS sources in database (for a specific organization)
 */
export async function seedRSSSources(organizationId: string) {
  console.log("Seeding RSS sources...");

  for (const source of config.rssSources) {
    await saveRSSSource(source.name, source.url, source.category, organizationId);
  }

  console.log(`✓ Seeded ${config.rssSources.length} RSS sources`);
}
