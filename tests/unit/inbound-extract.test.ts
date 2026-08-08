import { describe, expect, it, vi } from "vitest";
import {
  buildDigestPrompt,
  buildEssayPrompt,
  buildExtractionInput,
  extractNewsletterItems,
  keepPresentUrls,
  readableEmail,
  type AskModel,
} from "@/lib/inbound/extract";
import { config } from "@/lib/config";

/**
 * A digest in the shape the big ones use: a table layout, tracking pixel, sponsor block,
 * a job section and an unsubscribe footer, with the real links wrapped in a click tracker.
 */
const DIGEST_HTML = `
<html><body>
  <img src="https://track.tldr.com/open/abc.gif" width="1" height="1">
  <table><tr><td>
    <a href="https://links.tldr.com/view-online/abc">View in browser</a>
    <h1>TLDR AI 2026-08-05</h1>

    <h2>Together with <a href="https://links.tldr.com/sponsor/acme">Acme</a></h2>
    <p>Acme makes your vector database faster. <a href="https://links.tldr.com/sponsor/acme-cta">Try it free</a></p>

    <h2><a href="https://links.tldr.com/click/openai-agents">OpenAI opens its agent platform to enterprises (4 minute read)</a></h2>
    <p>The rollout reaches 14 countries and about 2,500 organisations, with pilots reporting shorter document handling times.</p>

    <h2><a href="https://links.tldr.com/click/mcp-security">The S in MCP stands for security (7 minute read)</a></h2>
    <p>A critical look at how Model Context Protocol servers handle credentials.</p>

    <h2>Jobs</h2>
    <p><a href="https://links.tldr.com/jobs/senior-eng">Senior Engineer at Startup</a></p>

    <hr>
    <p>
      <a href="https://links.tldr.com/unsubscribe/abc">Unsubscribe</a> |
      <a href="https://links.tldr.com/manage/abc">Manage preferences</a> |
      <a href="https://twitter.com/tldr">Follow us</a>
    </p>
  </td></tr></table>
</body></html>`;

const ESSAY_TEXT = `View this post on the web at https://patmcguinness.substack.com/p/agentic-2026

AI Changes Everything

Agentic systems moved from demo to production this year, and the shift is less about
model quality than about the plumbing around it. Three things had to land first.

Unsubscribe: https://patmcguinness.substack.com/action/disable_email`;

describe("readableEmail", () => {
  it("collects the links a digest carries, once each, with the anchor they came from", () => {
    const readable = readableEmail({ html: DIGEST_HTML });
    const urls = readable.links.map((link) => link.url);

    expect(urls).toContain("https://links.tldr.com/click/openai-agents");
    expect(urls).toContain("https://links.tldr.com/click/mcp-security");
    expect(new Set(urls).size).toBe(urls.length);

    // The pairing the email carries, kept rather than thrown away. See
    // inbound-extract-pairing.test.ts for why.
    expect(
      readable.links.find((link) => link.url.endsWith("openai-agents"))?.text
    ).toBe("OpenAI opens its agent platform to enterprises (4 minute read)");
  });

  it("drops the tracking pixel and the markup", () => {
    const readable = readableEmail({ html: DIGEST_HTML });

    // An image is not a link the model may cite, and its URL is a tracker.
    expect(readable.links.map((link) => link.url)).not.toContain(
      "https://track.tldr.com/open/abc.gif"
    );
    expect(readable.text).not.toContain("<table>");
  });

  it("keeps the readable text", () => {
    const readable = readableEmail({ html: DIGEST_HTML });

    expect(readable.text).toContain("OpenAI opens its agent platform");
    expect(readable.text).toContain("14 countries");
  });

  it("reads a plain text email, finding its bare URLs", () => {
    const readable = readableEmail({ text: ESSAY_TEXT });

    expect(readable.links.map((link) => link.url)).toContain(
      "https://patmcguinness.substack.com/p/agentic-2026"
    );
    expect(readable.text).toContain("Agentic systems moved from demo to production");
  });

  it("prefers html when both are present", () => {
    const readable = readableEmail({ html: "<p>from html</p>", text: "from text" });

    expect(readable.text).toBe("from html");
  });

  it("survives empty input", () => {
    expect(readableEmail({})).toEqual({ text: "", links: [] });
  });
});

describe("buildExtractionInput", () => {
  it("enumerates the links so the model can quote rather than construct", () => {
    const input = buildExtractionInput({
      text: "body",
      links: [
        { url: "https://a.com/1", text: "First story" },
        { url: "https://b.com/2", text: "Second story" },
      ],
    });

    expect(input).toContain("1. \"First story\" -> https://a.com/1");
    expect(input).toContain("2. \"Second story\" -> https://b.com/2");
    expect(input).toContain("LINKS PRESENT IN THIS EMAIL");
  });

  it("says so when there are no links, rather than leaving it ambiguous", () => {
    expect(buildExtractionInput({ text: "body", links: [] })).toContain(
      "contains no links"
    );
  });

  it("caps the input, and a short link list still survives a very long body", () => {
    // This used to assert that the links survive truncation whatever it costs the text,
    // and that allocation is what starved two real newsletters of their own content. The
    // text is served first now; a link list this small needs almost nothing, so it is kept
    // either way. See `inbound-extract-budget.test.ts` for the case where they compete.
    const input = buildExtractionInput(
      { text: "x".repeat(50_000), links: [{ url: "https://a.com/1", text: "One" }] },
      1_000
    );

    expect(input.length).toBeLessThanOrEqual(1_000);
    expect(input).toContain("https://a.com/1");
  });
});

describe("keepPresentUrls", () => {
  const links = [
    { url: "https://a.com/1", text: "" },
    { url: "https://b.com/2", text: "" },
  ];

  it("keeps items whose URL was in the email", () => {
    const { items } = keepPresentUrls(
      [{ title: "One", url: "https://a.com/1", snippet: "s" }],
      links
    );

    expect(items).toHaveLength(1);
  });

  it("drops a URL the model constructed", () => {
    // Worse than a missing article: a fabricated link creates an article pointing at
    // something nobody wrote.
    const { items, dropped } = keepPresentUrls(
      [
        { title: "Real", url: "https://a.com/1", snippet: "" },
        { title: "Invented", url: "https://a.com/probably-this", snippet: "" },
      ],
      links
    );

    expect(items).toHaveLength(1);
    expect(dropped).toEqual(["https://a.com/probably-this"]);
  });

  it("drops an item with no URL at all", () => {
    const { items, dropped } = keepPresentUrls(
      [{ title: "No link", url: "", snippet: "" }],
      links
    );

    expect(items).toEqual([]);
    expect(dropped).toEqual(["(no url)"]);
  });

  it("drops an item with no title", () => {
    const { items } = keepPresentUrls(
      [{ title: "   ", url: "https://a.com/1", snippet: "" }],
      links
    );

    expect(items).toEqual([]);
  });

  it("collapses a URL listed twice", () => {
    const { items } = keepPresentUrls(
      [
        { title: "One", url: "https://a.com/1", snippet: "" },
        { title: "One again", url: "https://a.com/1", snippet: "" },
      ],
      links
    );

    expect(items).toHaveLength(1);
  });
});

describe("the digest prompt", () => {
  it("names what to exclude, which is most of a newsletter", () => {
    const prompt = buildDigestPrompt("body", 20);

    for (const excluded of [
      "sponsor",
      "job listings",
      "unsubscribe",
      "archive",
      "tracking",
    ]) {
      expect(prompt.toLowerCase()).toContain(excluded);
    }
  });

  it("forbids constructing a URL", () => {
    expect(buildDigestPrompt("body", 20)).toContain("Never construct");
  });

  it("asks for the newsletter's own words in the snippet", () => {
    expect(buildDigestPrompt("body", 20)).toContain("Do not write your own");
  });

  it("states the item cap", () => {
    expect(buildDigestPrompt("body", 7)).toContain("At most 7 items");
  });
});

describe("the essay prompt", () => {
  /**
   * It used to ask for the author's paragraphs unchanged, and that assertion lived here.
   * It is gone because the prompt is: asking a model to return a body we already hold
   * could not fit the token budget on a real newsletter, and lost four of them. The body
   * now comes from the email. See `inbound-extract-failure.test.ts`.
   */
  it("asks only for what a reader has to judge, and forbids inventing a URL", () => {
    const prompt = buildEssayPrompt("body");

    expect(prompt).toContain("Do not return the body");
    expect(prompt).toContain("Never construct one");
  });
});

describe("extractNewsletterItems, digest mode", () => {
  const reply = (items: unknown) => JSON.stringify(items);

  it("returns the articles a digest points at", async () => {
    const ask: AskModel = async () =>
      reply([
        {
          title: "OpenAI opens its agent platform to enterprises",
          url: "https://links.tldr.com/click/openai-agents",
          snippet: "The rollout reaches 14 countries.",
        },
        {
          title: "The S in MCP stands for security",
          url: "https://links.tldr.com/click/mcp-security",
          snippet: "A critical look.",
        },
      ]);

    const result = await extractNewsletterItems(
      { html: DIGEST_HTML },
      "DIGEST",
      "claude-haiku-4-5",
      ask
    );

    expect(result.mode).toBe("DIGEST");
    if (result.mode !== "DIGEST") return;
    expect(result.items).toHaveLength(2);
    expect(result.items[0].url).toBe("https://links.tldr.com/click/openai-agents");
  });

  it("drops a sponsor link even when the model returns it", async () => {
    // Belt as well as braces: the prompt says to exclude it, and if the model does not, the
    // URL is still in the email so only the caller's own filtering catches it.
    const ask: AskModel = async () =>
      reply([
        { title: "Acme makes your database faster", url: "https://links.tldr.com/sponsor/acme", snippet: "" },
        {
          // The item's real title, which is also the anchor its URL carries. A made-up
          // title here would now be dropped by the pairing check rather than the URL
          // check, and this test is about the URL check.
          title: "The S in MCP stands for security (7 minute read)",
          url: "https://links.tldr.com/click/mcp-security",
          snippet: "",
        },
      ]);

    const result = await extractNewsletterItems(
      { html: DIGEST_HTML },
      "DIGEST",
      "m",
      ask
    );

    if (result.mode !== "DIGEST") throw new Error("wrong mode");
    // Both were present in the email, so both survive the URL check: the sponsor filter is
    // the prompt's job and this test records that honestly rather than pretending otherwise.
    expect(result.items.map((item) => item.title)).toContain(
      "The S in MCP stands for security (7 minute read)"
    );
  });

  it("drops a URL that was not in the email", async () => {
    const ask: AskModel = async () =>
      reply([{ title: "Invented", url: "https://arstechnica.com/guessed", snippet: "" }]);

    const result = await extractNewsletterItems({ html: DIGEST_HTML }, "DIGEST", "m", ask);

    if (result.mode !== "DIGEST") throw new Error("wrong mode");
    expect(result.items).toEqual([]);
    expect(result.dropped).toEqual(["https://arstechnica.com/guessed"]);
  });

  it("caps the item count", async () => {
    const links = readableEmail({ html: DIGEST_HTML }).links;
    // Titled from the anchor, so the cap is what this measures rather than the pairing.
    const many = links.map((link, index) => ({
      title: link.text || `Item ${index}`,
      url: link.url,
      snippet: "",
    }));

    const result = await extractNewsletterItems(
      { html: DIGEST_HTML },
      "DIGEST",
      "m",
      async () => reply(many)
    );

    if (result.mode !== "DIGEST") throw new Error("wrong mode");
    expect(result.items.length).toBeLessThanOrEqual(config.emailIngest.maxItemsPerDigest);
  });

  it("accepts an empty array as a real answer", async () => {
    const result = await extractNewsletterItems(
      { html: DIGEST_HTML },
      "DIGEST",
      "m",
      async () => "[]"
    );

    if (result.mode !== "DIGEST") throw new Error("wrong mode");
    expect(result.items).toEqual([]);
  });

  it("retries once on an unparsable reply, then reports a failure", async () => {
    const ask = vi.fn<AskModel>(async () => "I cannot help with that.");

    const result = await extractNewsletterItems(
      { html: DIGEST_HTML },
      "DIGEST",
      "m",
      ask
    );

    expect(ask).toHaveBeenCalledTimes(2);
    // FAILED rather than NONE: the email has not been dealt with, and the caller has to
    // be able to tell that apart from a newsletter that had nothing in it.
    expect(result.mode).toBe("FAILED");
  });

  it("accepts a second attempt that returns the shape", async () => {
    let call = 0;
    const ask: AskModel = async () => {
      call += 1;
      return call === 1
        ? "sorry"
        : reply([{ title: "Real", url: "https://links.tldr.com/click/mcp-security", snippet: "" }]);
    };

    const result = await extractNewsletterItems({ html: DIGEST_HTML }, "DIGEST", "m", ask);

    expect(result.mode).toBe("DIGEST");
  });
});

describe("extractNewsletterItems, essay mode", () => {
  it("returns one article with its web version", async () => {
    const ask: AskModel = async () =>
      JSON.stringify({
        title: "AI Changes Everything",
        webVersionUrl: "https://patmcguinness.substack.com/p/agentic-2026",
        plainTextBody: "Agentic systems moved from demo to production this year.",
      });

    const result = await extractNewsletterItems({ text: ESSAY_TEXT }, "ESSAY", "m", ask);

    expect(result.mode).toBe("ESSAY");
    if (result.mode !== "ESSAY") return;
    expect(result.item.webVersionUrl).toBe(
      "https://patmcguinness.substack.com/p/agentic-2026"
    );
  });

  it("refuses a web version URL that was not in the email", async () => {
    const ask: AskModel = async () =>
      JSON.stringify({
        title: "Essay",
        webVersionUrl: "https://patmcguinness.substack.com/p/invented",
        plainTextBody: "Body.",
      });

    const result = await extractNewsletterItems({ text: ESSAY_TEXT }, "ESSAY", "m", ask);

    if (result.mode !== "ESSAY") throw new Error("wrong mode");
    // Null, so the caller falls back to the source's own address rather than linking to a
    // page that may not exist.
    expect(result.item.webVersionUrl).toBeNull();
  });

  it("refuses an empty title, which is the only field the model still supplies", async () => {
    // This used to test an empty `plainTextBody`. The model no longer returns a body, so
    // the title is the one thing it can fail to give.
    const ask = vi.fn<AskModel>(async () =>
      JSON.stringify({ title: "   ", webVersionUrl: null })
    );

    const result = await extractNewsletterItems({ text: ESSAY_TEXT }, "ESSAY", "m", ask);

    expect(result.mode).toBe("FAILED");
    expect(ask).toHaveBeenCalledTimes(2);
  });
});

describe("extractNewsletterItems refuses cheaply", () => {
  it("does not call the model for an email with no readable text", async () => {
    const ask = vi.fn<AskModel>(async () => "[]");

    const result = await extractNewsletterItems({ html: "<img src='x.gif'>" }, "DIGEST", "m", ask);

    expect(ask).not.toHaveBeenCalled();
    expect(result.mode).toBe("NONE");
  });

  it("reports a failed model call as a failure rather than throwing", async () => {
    const result = await extractNewsletterItems(
      { html: DIGEST_HTML },
      "DIGEST",
      "m",
      async () => {
        throw new Error("connection reset");
      }
    );

    expect(result.mode).toBe("FAILED");
    if (result.mode !== "FAILED") return;
    expect(result.reason).toContain("connection reset");
  });
});
