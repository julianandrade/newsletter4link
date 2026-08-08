import { describe, expect, it, vi } from "vitest";
import { fetchFeedXml, looksLikeFeedUrl, type FetchLike } from "@/lib/curation/feed-fetch";
import type { Resolver } from "@/lib/curation/url-safety";

/**
 * The feed path had no safety check at all until 8 August 2026.
 *
 * `checkUrlTarget` was written for this exact problem, with a docblock saying so, and was
 * wired into one caller: the inbound email path. A feed URL is supplied by an authenticated
 * user through a form or an OPML import and went straight to `rss-parser`, whose only
 * validation was `new URL()`. That accepts `http://169.254.169.254/latest/meta-data/`.
 *
 * It was not theoretical either. The collector was selecting EMAIL sources as if they were
 * feeds, so `avi@dailydoseofds.com` reached the parser and resolved to localhost: the
 * production logs carried `connect ECONNREFUSED 127.0.0.1` every morning.
 */

const publicDns: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];

const metadataDns: Resolver = async (hostname) =>
  hostname === "169.254.169.254"
    ? [{ address: "169.254.169.254", family: 4 }]
    : [{ address: "93.184.216.34", family: 4 }];

const FEED = `<?xml version="1.0"?><rss><channel><title>t</title></channel></rss>`;

/** A fetch that answers from a table. Nothing here touches the network. */
const fetcher = (
  table: Record<string, { status: number; location?: string; body?: string }>
): FetchLike =>
  vi.fn(async (url: string) => {
    const row = table[url] ?? { status: 404 };
    return {
      status: row.status,
      ok: row.status >= 200 && row.status < 300,
      headers: { get: (n: string) => (n.toLowerCase() === "location" ? (row.location ?? null) : null) },
      text: async () => row.body ?? "",
    };
  }) as unknown as FetchLike;

describe("looksLikeFeedUrl", () => {
  it("refuses an email address, which is what an EMAIL source keeps in url", () => {
    expect(looksLikeFeedUrl("avi@dailydoseofds.com")).toBe(false);
    expect(looksLikeFeedUrl("hi@mail.theresanaiforthat.com")).toBe(false);
  });

  it("refuses a scheme a feed cannot use", () => {
    for (const url of ["file:///etc/passwd", "ftp://x.com/a", "javascript:alert(1)", ""]) {
      expect(looksLikeFeedUrl(url), url).toBe(false);
    }
  });

  it("accepts an ordinary feed address", () => {
    expect(looksLikeFeedUrl("https://techcrunch.com/feed/")).toBe(true);
    expect(looksLikeFeedUrl("http://feeds.arstechnica.com/arstechnica/index")).toBe(true);
  });
});

describe("fetchFeedXml refuses what it must not open", () => {
  it("refuses an email address without opening a connection", async () => {
    const fetchImpl = fetcher({});
    const result = await fetchFeedXml("avi@dailydoseofds.com", { fetchImpl, resolve: publicDns });

    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses cloud metadata", async () => {
    const url = "http://169.254.169.254/latest/meta-data/";
    const fetchImpl = fetcher({ [url]: { status: 200, body: FEED } });

    const result = await fetchFeedXml(url, { fetchImpl, resolve: metadataDns });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/refused/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a public feed that redirects to a private address", async () => {
    // The case a check placed before parseURL could never catch, because rss-parser
    // follows its own redirects.
    const start = "https://example.com/feed";
    const evil = "http://169.254.169.254/latest/meta-data/";
    const fetchImpl = fetcher({
      [start]: { status: 302, location: evil },
      [evil]: { status: 200, body: FEED },
    });

    const result = await fetchFeedXml(start, { fetchImpl, resolve: metadataDns });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/refused/);
  });
});

describe("fetchFeedXml on the ordinary paths", () => {
  it("returns the XML of a feed that answers directly", async () => {
    const url = "https://techcrunch.com/feed/";
    const result = await fetchFeedXml(url, {
      fetchImpl: fetcher({ [url]: { status: 200, body: FEED } }),
      resolve: publicDns,
    });

    expect(result).toEqual({ ok: true, xml: FEED, url });
  });

  it("follows a redirect and reports where it landed", async () => {
    const from = "https://example.com/feed";
    const to = "https://example.com/feed.xml";
    const result = await fetchFeedXml(from, {
      fetchImpl: fetcher({
        [from]: { status: 301, location: to },
        [to]: { status: 200, body: FEED },
      }),
      resolve: publicDns,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe(to);
  });

  it("reports a server error as a reason rather than throwing", async () => {
    const url = "https://example.com/feed";
    const result = await fetchFeedXml(url, {
      fetchImpl: fetcher({ [url]: { status: 406 } }),
      resolve: publicDns,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("406");
  });

  it("stops a redirect loop", async () => {
    const a = "https://example.com/a";
    const b = "https://example.com/b";
    const result = await fetchFeedXml(a, {
      fetchImpl: fetcher({
        [a]: { status: 302, location: b },
        [b]: { status: 302, location: a },
      }),
      resolve: publicDns,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/loop/);
  });

  it("gives up on a chain that never ends", async () => {
    let n = 0;
    const fetchImpl = (async () => ({
      status: 302,
      ok: false,
      headers: { get: () => `https://example.com/${(n += 1)}` },
      text: async () => "",
    })) as unknown as FetchLike;

    const result = await fetchFeedXml("https://example.com/0", {
      fetchImpl,
      resolve: publicDns,
      maxHops: 3,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/gave up/);
  });

  it("refuses a feed larger than the cap rather than truncating the XML", async () => {
    const url = "https://example.com/feed";
    const result = await fetchFeedXml(url, {
      fetchImpl: fetcher({ [url]: { status: 200, body: "x".repeat(5_000) } }),
      resolve: publicDns,
      maxBytes: 1_000,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/larger than/);
  });

  it("turns a thrown request into a reason", async () => {
    const fetchImpl = (async () => {
      throw new Error("socket hang up");
    }) as unknown as FetchLike;

    const result = await fetchFeedXml("https://example.com/feed", {
      fetchImpl,
      resolve: publicDns,
    });

    expect(result).toEqual({ ok: false, reason: "socket hang up" });
  });
});
