import { describe, it, expect } from "vitest";
import { parseOPML } from "./parser";

describe("parseOPML", () => {
  it("parses a simple OPML file with feeds", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>My RSS Feeds</title>
  </head>
  <body>
    <outline text="Tech News" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com"/>
    <outline text="Security Blog" xmlUrl="https://security.example.com/rss"/>
  </body>
</opml>`;

    const result = parseOPML(opml);

    expect(result.title).toBe("My RSS Feeds");
    expect(result.feeds).toHaveLength(2);
    expect(result.errors).toHaveLength(0);

    expect(result.feeds[0]).toEqual({
      name: "Tech News",
      url: "https://example.com/feed.xml",
      siteUrl: "https://example.com",
      category: undefined,
    });

    expect(result.feeds[1]).toEqual({
      name: "Security Blog",
      url: "https://security.example.com/rss",
      siteUrl: undefined,
      category: undefined,
    });
  });

  it("extracts categories from parent outline elements", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Security">
      <outline text="KrebsOnSecurity" xmlUrl="https://krebsonsecurity.com/feed/"/>
      <outline text="Schneier on Security" xmlUrl="https://www.schneier.com/feed/"/>
    </outline>
    <outline text="Tech">
      <outline text="Ars Technica" xmlUrl="https://feeds.arstechnica.com/arstechnica/index"/>
    </outline>
  </body>
</opml>`;

    const result = parseOPML(opml);

    expect(result.feeds).toHaveLength(3);
    expect(result.feeds[0].category).toBe("Security");
    expect(result.feeds[1].category).toBe("Security");
    expect(result.feeds[2].category).toBe("Tech");
  });

  it("uses title attribute as fallback for name", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline title="Feed Title" xmlUrl="https://example.com/feed.xml"/>
  </body>
</opml>`;

    const result = parseOPML(opml);

    expect(result.feeds[0].name).toBe("Feed Title");
  });

  it("uses URL as fallback when no name/title provided", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline xmlUrl="https://example.com/feed.xml"/>
  </body>
</opml>`;

    const result = parseOPML(opml);

    expect(result.feeds[0].name).toBe("https://example.com/feed.xml");
  });

  it("skips invalid URLs and reports errors", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Valid Feed" xmlUrl="https://example.com/feed.xml"/>
    <outline text="Invalid Feed" xmlUrl="not-a-valid-url"/>
  </body>
</opml>`;

    const result = parseOPML(opml);

    expect(result.feeds).toHaveLength(1);
    expect(result.feeds[0].name).toBe("Valid Feed");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Invalid URL skipped");
  });

  it("ignores outline elements without xmlUrl", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Category Folder">
      <outline text="Actual Feed" xmlUrl="https://example.com/feed.xml"/>
    </outline>
    <outline text="Just a folder with no feeds"/>
  </body>
</opml>`;

    const result = parseOPML(opml);

    expect(result.feeds).toHaveLength(1);
    expect(result.feeds[0].name).toBe("Actual Feed");
  });

  it("handles empty OPML with error", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
  </body>
</opml>`;

    const result = parseOPML(opml);

    expect(result.feeds).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("No valid RSS feeds found");
  });

  it("handles malformed XML with error", () => {
    const opml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Unclosed`;

    const result = parseOPML(opml);

    expect(result.feeds).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("trims whitespace from names and URLs", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="  Feed Name  " xmlUrl="  https://example.com/feed.xml  " htmlUrl="  https://example.com  "/>
  </body>
</opml>`;

    const result = parseOPML(opml);

    expect(result.feeds[0].name).toBe("Feed Name");
    expect(result.feeds[0].url).toBe("https://example.com/feed.xml");
    expect(result.feeds[0].siteUrl).toBe("https://example.com");
  });

  it("handles category attribute on outline element", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Feed" xmlUrl="https://example.com/feed.xml" category="InfoSec"/>
  </body>
</opml>`;

    const result = parseOPML(opml);

    expect(result.feeds[0].category).toBe("InfoSec");
  });

  it("prefers category attribute over parent folder name", () => {
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <body>
    <outline text="Parent Folder">
      <outline text="Feed" xmlUrl="https://example.com/feed.xml" category="Explicit Category"/>
    </outline>
  </body>
</opml>`;

    const result = parseOPML(opml);

    expect(result.feeds[0].category).toBe("Explicit Category");
  });

  it("parses AllInfoSecNews-style OPML structure", () => {
    // Simplified version of the AllInfoSecNews OPML structure
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
  <head>
    <title>All InfoSec News</title>
  </head>
  <body>
    <outline text="News" title="News">
      <outline type="rss" text="Krebs on Security" title="Krebs on Security" xmlUrl="https://krebsonsecurity.com/feed/" htmlUrl="https://krebsonsecurity.com"/>
      <outline type="rss" text="The Hacker News" title="The Hacker News" xmlUrl="https://feeds.feedburner.com/TheHackersNews" htmlUrl="https://thehackernews.com"/>
    </outline>
    <outline text="Podcasts" title="Podcasts">
      <outline type="rss" text="Darknet Diaries" title="Darknet Diaries" xmlUrl="https://feeds.megaphone.fm/darknetdiaries" htmlUrl="https://darknetdiaries.com"/>
    </outline>
  </body>
</opml>`;

    const result = parseOPML(opml);

    expect(result.title).toBe("All InfoSec News");
    expect(result.feeds).toHaveLength(3);
    expect(result.errors).toHaveLength(0);

    expect(result.feeds[0]).toEqual({
      name: "Krebs on Security",
      url: "https://krebsonsecurity.com/feed/",
      siteUrl: "https://krebsonsecurity.com",
      category: "News",
    });

    expect(result.feeds[2]).toEqual({
      name: "Darknet Diaries",
      url: "https://feeds.megaphone.fm/darknetdiaries",
      siteUrl: "https://darknetdiaries.com",
      category: "Podcasts",
    });
  });
});
