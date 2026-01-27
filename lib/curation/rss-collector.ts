import Parser from "rss-parser";
import { load } from "cheerio";
import { prisma } from "@/lib/db";
import { config } from "@/lib/config";

interface RSSArticle {
  title: string;
  link: string;
  content: string;
  author?: string;
  publishedAt: Date;
  sourceUrl: string;
  sourceName: string;
}

const parser = new Parser({
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

  // Limit length to ~2000 characters for embedding
  if (text.length > 2000) {
    text = text.substring(0, 2000) + "...";
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

    for (const item of feed.items) {
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
        title: item.title,
        link: item.link,
        content,
        author: item.creator || (item as any).author,
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
