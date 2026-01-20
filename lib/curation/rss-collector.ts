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
        author: item.creator || item.author,
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
 * Fetch all configured RSS feeds
 */
export async function fetchAllRSSFeeds(): Promise<RSSArticle[]> {
  const allArticles: RSSArticle[] = [];

  for (const source of config.rssSources) {
    try {
      console.log(`Fetching RSS feed: ${source.name}...`);
      const articles = await fetchRSSFeed(source.url, source.name);
      allArticles.push(...articles);
      console.log(`✓ Fetched ${articles.length} articles from ${source.name}`);
    } catch (error) {
      console.error(`✗ Failed to fetch ${source.name}`);
      // Continue with other sources even if one fails
    }
  }

  return allArticles;
}

/**
 * Save RSS source to database
 */
export async function saveRSSSource(
  name: string,
  url: string,
  category: string
) {
  return await prisma.rSSSource.upsert({
    where: { url },
    create: {
      name,
      url,
      category,
      active: true,
    },
    update: {
      name,
      category,
      active: true,
    },
  });
}

/**
 * Update RSS source last fetched timestamp
 */
export async function updateRSSSourceFetchedAt(url: string, error?: string) {
  return await prisma.rSSSource.update({
    where: { url },
    data: {
      lastFetchedAt: new Date(),
      lastError: error || null,
    },
  });
}

/**
 * Get all active RSS sources from database
 */
export async function getActiveRSSSources() {
  return await prisma.rSSSource.findMany({
    where: { active: true },
  });
}

/**
 * Initialize default RSS sources in database
 */
export async function seedRSSSources() {
  console.log("Seeding RSS sources...");

  for (const source of config.rssSources) {
    await saveRSSSource(source.name, source.url, source.category);
  }

  console.log(`✓ Seeded ${config.rssSources.length} RSS sources`);
}
