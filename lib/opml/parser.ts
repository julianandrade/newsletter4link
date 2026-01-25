/**
 * OPML Parser Utility
 * Parses OPML files to extract RSS feed information
 */

import * as cheerio from "cheerio";

export interface OPMLFeed {
  name: string;
  url: string; // xmlUrl from OPML
  siteUrl?: string; // htmlUrl from OPML
  category?: string; // text attribute from parent outline or category attribute
}

export interface OPMLParseResult {
  feeds: OPMLFeed[];
  title?: string;
  errors: string[];
}

/**
 * Parse OPML content and extract RSS feeds
 * @param opmlContent - Raw OPML XML content as string
 * @returns Parsed feeds with any errors encountered
 */
export function parseOPML(opmlContent: string): OPMLParseResult {
  const result: OPMLParseResult = {
    feeds: [],
    errors: [],
  };

  try {
    // Parse XML using cheerio
    const $ = cheerio.load(opmlContent, { xml: true });

    // Get document title if available
    const titleElement = $("head > title");
    if (titleElement.length > 0 && titleElement.text()) {
      result.title = titleElement.text();
    }

    // Find all outline elements with xmlUrl (these are actual feeds)
    $("outline[xmlUrl]").each((_, element) => {
      const outline = $(element);
      const xmlUrl = outline.attr("xmlUrl");
      if (!xmlUrl) return;

      // Get feed name from text or title attribute
      const name = outline.attr("text") || outline.attr("title") || xmlUrl;

      // Get site URL if available
      const siteUrl = outline.attr("htmlUrl") || undefined;

      // Get category from parent outline or category attribute
      let category: string | undefined;
      const categoryAttr = outline.attr("category");
      if (categoryAttr) {
        category = categoryAttr;
      } else {
        // Check parent outline for category/folder name
        const parent = outline.parent("outline");
        if (parent.length > 0) {
          category = parent.attr("text") || parent.attr("title") || undefined;
        }
      }

      // Validate URL
      try {
        new URL(xmlUrl);
        result.feeds.push({
          name: name.trim(),
          url: xmlUrl.trim(),
          siteUrl: siteUrl?.trim(),
          category: category?.trim(),
        });
      } catch {
        result.errors.push(`Invalid URL skipped: ${xmlUrl}`);
      }
    });

    if (result.feeds.length === 0 && result.errors.length === 0) {
      result.errors.push("No valid RSS feeds found in OPML file");
    }
  } catch (error) {
    result.errors.push(
      `Failed to parse OPML: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }

  return result;
}

/**
 * Fetch OPML content from a URL
 * @param url - URL to fetch OPML from
 * @returns OPML content as string
 */
export async function fetchOPML(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/xml, text/xml, text/x-opml, */*",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch OPML: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";

  // Allow common content types for OPML files
  const validTypes = [
    "application/xml",
    "text/xml",
    "text/x-opml",
    "application/octet-stream",
    "text/plain",
  ];

  const isValidType = validTypes.some((type) => contentType.includes(type));
  if (!isValidType && !contentType.includes("xml")) {
    throw new Error(`Unexpected content type: ${contentType}`);
  }

  return response.text();
}
