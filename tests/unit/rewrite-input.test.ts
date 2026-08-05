import { describe, expect, it, vi } from "vitest";
import {
  extractArticleText,
  FULL_TEXT_CHARS,
  resolveRewriteInput,
  type FetchPage,
} from "@/lib/rewrite/input";
import { MIN_USABLE_INPUT_CHARS } from "@/lib/rewrite/config";

const ALLOWED = [{ domain: "example.com", reason: "publishes full text in its feed" }];

/** Exactly `chars` characters, never ending in a space: the resolver trims, and a
 *  trailing space would make every length assertion off by one. */
const longText = (chars: number) =>
  "palavra ".repeat(Math.ceil(chars / 8)).slice(0, chars - 1) + "x";

const page = (body: string, status = 200) => ({ status, body });

const html = (paragraphs: string[]) =>
  `<html><body><nav>Menu Home About</nav><article>${paragraphs
    .map((text) => `<p>${text}</p>`)
    .join("")}</article><footer>Copyright</footer></body></html>`;

describe("the feed comes first", () => {
  it("uses the feed when it already carries the article, without fetching", async () => {
    const fetchPage = vi.fn<FetchPage>(async () => page("should not be called"));

    const result = await resolveRewriteInput(
      { feedContent: longText(FULL_TEXT_CHARS + 10), sourceUrl: "https://example.com/a" },
      { allowlist: ALLOWED, fetchPage }
    );

    // Reading what a feed carries covers more of the corpus than fetching, and raises
    // no question about scraping.
    expect(fetchPage).not.toHaveBeenCalled();
    expect(result.mode).toBe("FULL_TEXT");
    expect(result.provenance).toBe("feed-full");
    expect(result.note).toContain("was not fetched");
  });
});

describe("when fetching is not permitted", () => {
  it("falls back to the excerpt and says why", async () => {
    const fetchPage = vi.fn<FetchPage>(async () => page("nope"));

    const result = await resolveRewriteInput(
      { feedContent: longText(400), sourceUrl: "https://techcrunch.com/a" },
      { allowlist: ALLOWED, fetchPage }
    );

    expect(fetchPage).not.toHaveBeenCalled();
    expect(result.mode).toBe("EXCERPT");
    expect(result.provenance).toBe("feed-excerpt");
    expect(result.note).toContain("default deny");
  });

  it("refuses outright when the excerpt is under the floor", async () => {
    const result = await resolveRewriteInput(
      { feedContent: "Two sentences, barely.", sourceUrl: "https://techcrunch.com/a" },
      { allowlist: ALLOWED }
    );

    expect(result.usable).toBe(false);
    expect(result.provenance).toBe("none");
    expect(result.source).toBe("");
    expect(result.note).toContain(`${MIN_USABLE_INPUT_CHARS} character floor`);
  });

  it("never fetches in offline mode, even for an allowed domain", async () => {
    const fetchPage = vi.fn<FetchPage>(async () => page(html(["long"])));

    await resolveRewriteInput(
      { feedContent: longText(400), sourceUrl: "https://example.com/a" },
      { allowlist: ALLOWED, fetchPage, offline: true }
    );

    expect(fetchPage).not.toHaveBeenCalled();
  });
});

describe("robots.txt decides the path", () => {
  it("fetches when robots permits", async () => {
    const body = html([longText(800), longText(800)]);
    const fetchPage: FetchPage = async (url) =>
      url.endsWith("/robots.txt")
        ? page("User-agent: *\nDisallow: /private")
        : page(body);

    const result = await resolveRewriteInput(
      { feedContent: longText(300), sourceUrl: "https://example.com/2026/article" },
      { allowlist: ALLOWED, fetchPage }
    );

    expect(result.provenance).toBe("fetched");
    expect(result.mode).toBe("FULL_TEXT");
  });

  it("does not fetch a disallowed path", async () => {
    const fetchPage: FetchPage = async (url) =>
      url.endsWith("/robots.txt") ? page("User-agent: *\nDisallow: /premium") : page("x");

    const result = await resolveRewriteInput(
      { feedContent: longText(300), sourceUrl: "https://example.com/premium/a" },
      { allowlist: ALLOWED, fetchPage }
    );

    expect(result.provenance).toBe("feed-excerpt");
    expect(result.note).toContain("robots.txt disallows");
  });

  it("treats a missing robots.txt as no restrictions", async () => {
    const body = html([longText(900), longText(900)]);
    const fetchPage: FetchPage = async (url) =>
      url.endsWith("/robots.txt") ? page("", 404) : page(body);

    const result = await resolveRewriteInput(
      { feedContent: longText(300), sourceUrl: "https://example.com/a" },
      { allowlist: ALLOWED, fetchPage }
    );

    expect(result.provenance).toBe("fetched");
  });

  it("refuses when robots.txt cannot be read, because not knowing is not permission", async () => {
    const fetchPage: FetchPage = async (url) =>
      url.endsWith("/robots.txt") ? page("", 500) : page(html([longText(2000)]));

    const result = await resolveRewriteInput(
      { feedContent: longText(300), sourceUrl: "https://example.com/a" },
      { allowlist: ALLOWED, fetchPage }
    );

    expect(result.provenance).toBe("feed-excerpt");
    expect(result.note).toContain("answered 500");
  });
});

describe("the gate: a paywalled source yields a short honest output or none", () => {
  it("falls back to the excerpt when the page is a subscribe wall", async () => {
    const wall = html(["The opening paragraph.", "Subscribe to continue reading."]);
    const fetchPage: FetchPage = async (url) =>
      url.endsWith("/robots.txt") ? page("") : page(wall);

    const result = await resolveRewriteInput(
      { feedContent: longText(400), sourceUrl: "https://example.com/a" },
      { allowlist: ALLOWED, fetchPage }
    );

    expect(result.mode).toBe("EXCERPT");
    expect(result.source).toHaveLength(400);
    expect(result.note).toContain("subscribe");
  });

  it("yields nothing when the page is walled and the excerpt is too thin", async () => {
    const wall = html(["Subscribe to read this article."]);
    const fetchPage: FetchPage = async (url) =>
      url.endsWith("/robots.txt") ? page("") : page(wall);

    const result = await resolveRewriteInput(
      { feedContent: "Tiny.", sourceUrl: "https://example.com/a" },
      { allowlist: ALLOWED, fetchPage }
    );

    expect(result.usable).toBe(false);
    expect(result.provenance).toBe("none");
  });

  it("does not treat a 200 with a gate as a successful fetch", async () => {
    // The plan keyed on 401, 402 and 403. A paywalled page usually answers 200.
    const fetchPage: FetchPage = async (url) =>
      url.endsWith("/robots.txt")
        ? page("")
        : page(html(["Already a subscriber? Sign in."]), 200);

    const result = await resolveRewriteInput(
      { feedContent: longText(400), sourceUrl: "https://example.com/a" },
      { allowlist: ALLOWED, fetchPage }
    );

    expect(result.provenance).not.toBe("fetched");
  });

  it("falls back on a non-200 page", async () => {
    const fetchPage: FetchPage = async (url) =>
      url.endsWith("/robots.txt") ? page("") : page("gone", 404);

    const result = await resolveRewriteInput(
      { feedContent: longText(400), sourceUrl: "https://example.com/a" },
      { allowlist: ALLOWED, fetchPage }
    );

    expect(result.note).toContain("answered 404");
    expect(result.mode).toBe("EXCERPT");
  });

  it("falls back when the fetch throws", async () => {
    const fetchPage: FetchPage = async () => {
      throw new Error("connection reset");
    };

    const result = await resolveRewriteInput(
      { feedContent: longText(400), sourceUrl: "https://example.com/a" },
      { allowlist: ALLOWED, fetchPage }
    );

    expect(result.mode).toBe("EXCERPT");
    expect(result.note).toContain("connection reset");
  });

  it("treats a page shorter than the full-text bar as an excerpt", async () => {
    const fetchPage: FetchPage = async (url) =>
      url.endsWith("/robots.txt") ? page("") : page(html([longText(500)]));

    const result = await resolveRewriteInput(
      { feedContent: longText(400), sourceUrl: "https://example.com/a" },
      { allowlist: ALLOWED, fetchPage }
    );

    expect(result.mode).toBe("EXCERPT");
    expect(result.note).toContain("treated as an excerpt");
  });
});

describe("extractArticleText", () => {
  it("takes the paragraphs and leaves the furniture", () => {
    const text = extractArticleText(
      html(["First paragraph here.", "Second paragraph here."])
    );

    expect(text).toContain("First paragraph here.");
    expect(text).toContain("Second paragraph here.");
    expect(text).not.toContain("Menu");
    expect(text).not.toContain("Copyright");
  });

  it("prefers the article element over the whole body", () => {
    const page = `<html><body><p>Sidebar noise</p><article><p>The real text.</p></article></body></html>`;

    expect(extractArticleText(page)).toBe("The real text.");
  });

  it("falls back to the body text when there are no paragraphs", () => {
    expect(extractArticleText("<html><body><div>Just a div</div></body></html>")).toBe(
      "Just a div"
    );
  });

  it("drops scripts and styles rather than reading them as text", () => {
    const page = `<html><body><script>var x = "hello";</script><style>p{color:red}</style><p>Text.</p></body></html>`;

    const text = extractArticleText(page);
    expect(text).toBe("Text.");
  });

  it("collapses runs of whitespace", () => {
    expect(extractArticleText("<p>a     b</p>")).toBe("a b");
  });

  it("survives empty input", () => {
    expect(extractArticleText("")).toBe("");
  });
});
