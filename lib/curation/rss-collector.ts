import Parser from "rss-parser";
import { load } from "cheerio";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { pgSafe } from "@/lib/pg-safe-text";

interface RSSArticle {
  title: string;
  link: string;
  content: string;
  author?: string;
  publishedAt: Date;
  sourceUrl: string;
  sourceName: string;
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
 * Fetch and parse a single RSS feed
 */
export async function fetchRSSFeed(
  url: string,
  sourceName: string
): Promise<RSSArticle[]> {
  try {
    const feed = await parser.parseURL(url);
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
        author: pgSafe(item.creator || (item as any).author || "") || undefined,
        publishedAt,
        sourceUrl: url,
        sourceName,
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
 * Fetch all RSS feeds from database (or fallback to config)
 * Filters articles by max age in days
 */
export async function fetchAllRSSFeeds(maxAgeDays: number = 7, organizationId?: string): Promise<RSSArticle[]> {
  const allArticles: RSSArticle[] = [];

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  // Try to get sources from database first
  let sources: { name: string; url: string; category: string }[] = [];

  try {
    if (organizationId) {
      const dbSources = await getActiveRSSSources(organizationId);
      if (dbSources.length > 0) {
        sources = dbSources;
      } else {
        // Fall back to config if no sources in DB
        sources = [...config.rssSources];
      }
    } else {
      sources = [...config.rssSources];
    }
  } catch {
    // Fall back to config if DB query fails
    sources = [...config.rssSources];
  }

  for (const source of sources) {
    try {
      console.log(`Fetching RSS feed: ${source.name}...`);
      const articles = await fetchRSSFeed(source.url, source.name);

      // Filter articles by date
      const filteredArticles = articles.filter(
        (article) => article.publishedAt >= cutoffDate
      );

      allArticles.push(...filteredArticles);
      console.log(
        `✓ Fetched ${filteredArticles.length} articles from ${source.name} (${articles.length - filteredArticles.length} filtered by date)`
      );

      // Update last fetched timestamp
      if (organizationId) {
        try {
          await updateRSSSourceFetchedAt(source.url, organizationId);
        } catch {
          // Ignore if source doesn't exist in DB
        }
      }
    } catch (error) {
      console.error(`✗ Failed to fetch ${source.name}`);
      // Update error in database
      if (organizationId) {
        try {
          await updateRSSSourceFetchedAt(
            source.url,
            organizationId,
            error instanceof Error ? error.message : "Unknown error"
          );
        } catch {
          // Ignore if source doesn't exist in DB
        }
      }
      // Continue with other sources even if one fails
    }
  }

  return allArticles;
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
    where: { active: true, organizationId },
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
  const allArticles: RSSArticle[] = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  // Get sources from database by IDs (only active ones)
  const sources = await prisma.rSSSource.findMany({
    where: {
      id: { in: sourceIds },
      active: true,
      ...(organizationId && { organizationId }),
    },
  });

  for (const source of sources) {
    try {
      console.log(`Fetching RSS feed: ${source.name}...`);
      const articles = await fetchRSSFeed(source.url, source.name);

      // Filter articles by date
      const filteredArticles = articles.filter(
        (article) => article.publishedAt >= cutoffDate
      );

      allArticles.push(...filteredArticles);
      console.log(
        `✓ Fetched ${filteredArticles.length} articles from ${source.name} (${articles.length - filteredArticles.length} filtered by date)`
      );

      // Update last fetched timestamp
      if (organizationId) {
        await updateRSSSourceFetchedAt(source.url, organizationId);
      }
    } catch (error) {
      console.error(`✗ Failed to fetch ${source.name}`);
      // Update error in database
      if (organizationId) {
        await updateRSSSourceFetchedAt(
          source.url,
          organizationId,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
      // Continue with other sources even if one fails
    }
  }

  return allArticles;
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
