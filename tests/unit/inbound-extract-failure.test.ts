import { describe, expect, it, vi } from "vitest";
import {
  buildEssayPrompt,
  extractNewsletterItems,
  type AskModel,
} from "@/lib/inbound/extract";
import { config } from "@/lib/config";

/**
 * The four largest newsletters were lost silently on 6 August 2026, and this file is the
 * two root causes stated as tests.
 *
 * **One:** `NONE` meant three different things. "The email had nothing to extract" is a
 * finished job; "the call failed" and "the reply never had the right shape" are not. The
 * caller could not tell them apart, so it marked every one of them PROCESSED with a null
 * error, and nothing was retried and nothing recorded why.
 *
 * **Two:** the essay prompt asked the model to return the newsletter's whole body, and
 * the token budget was smaller than the bodies. Measured on the real emails: 4354 and
 * 4654 output tokens of body against a 4000-token budget that thinking also drew on. No
 * number of retries could satisfy that, so the fix is to stop asking. The body is already
 * in the email; asking a model to copy text we hold spends tokens to receive what we
 * sent, and invites the paraphrase the prompt can only ask it not to commit.
 */

const ESSAY_TEXT = `Why Most Founders Are Solving the Wrong Pain Entirely

Read online: https://thefoundercorner.substack.com/p/wrong-pain

Founders confuse a pain they have with a pain the market pays for. The distance
between those two is where most of the first year goes.

Unsubscribe: https://thefoundercorner.substack.com/unsubscribe`;

const DIGEST_HTML = `<html><body>
  <h1>Today in AI</h1>
  <p>The MCP registry had its first supply-chain scare.</p>
  <a href="https://links.tldr.com/click/mcp-security">Read more</a>
  <p>Long enough to pass the readable-text floor, several times over, so the extractor
  actually reaches the model instead of refusing early.</p>
</body></html>`;

describe("a failed extraction is not the same as an empty one", () => {
  it("says FAILED when the model call throws", async () => {
    const result = await extractNewsletterItems(
      { html: DIGEST_HTML },
      "DIGEST",
      "m",
      async () => {
        throw new Error("the model returned no text (thinking, stop reason max_tokens)");
      }
    );

    expect(result.mode).toBe("FAILED");
    if (result.mode !== "FAILED") return;
    expect(result.reason).toContain("max_tokens");
  });

  it("says FAILED when two attempts never produce the shape", async () => {
    const ask = vi.fn<AskModel>(async () => "I cannot help with that.");

    const result = await extractNewsletterItems(
      { html: DIGEST_HTML },
      "DIGEST",
      "m",
      ask
    );

    expect(ask).toHaveBeenCalledTimes(2);
    expect(result.mode).toBe("FAILED");
  });

  it("still says NONE when the email genuinely has nothing to extract", async () => {
    const ask = vi.fn<AskModel>(async () => "[]");

    const result = await extractNewsletterItems(
      { html: "<img src='x.gif'>" },
      "DIGEST",
      "m",
      ask
    );

    // The distinction the whole fix rests on: this one is finished, not broken.
    expect(result.mode).toBe("NONE");
    expect(ask).not.toHaveBeenCalled();
  });

  it("says NONE for a digest the model read and found nothing in", async () => {
    const result = await extractNewsletterItems(
      { html: DIGEST_HTML },
      "DIGEST",
      "m",
      async () => "[]"
    );

    // An empty array is a valid answer, per the prompt. Nothing failed.
    expect(result.mode).toBe("DIGEST");
    if (result.mode !== "DIGEST") return;
    expect(result.items).toEqual([]);
  });
});

describe("an essay's body comes from the email, not from the model", () => {
  it("does not ask the model for the body at all", () => {
    const prompt = buildEssayPrompt("EMAIL TEXT");

    expect(prompt).not.toContain("plainTextBody");
    // What it does ask for: the two things only a reader can identify.
    expect(prompt).toContain("title");
    expect(prompt).toContain("webVersionUrl");
  });

  it("takes the body from the email text even when the model offers one", async () => {
    const ask: AskModel = async () =>
      JSON.stringify({
        title: "Why Most Founders Are Solving the Wrong Pain Entirely",
        webVersionUrl: "https://thefoundercorner.substack.com/p/wrong-pain",
        // A model that ignores the contract and paraphrases anyway must not be believed.
        plainTextBody: "A short paraphrase the model invented.",
      });

    const result = await extractNewsletterItems({ text: ESSAY_TEXT }, "ESSAY", "m", ask);

    expect(result.mode).toBe("ESSAY");
    if (result.mode !== "ESSAY") return;

    expect(result.item.plainTextBody).toContain("Founders confuse a pain they have");
    expect(result.item.plainTextBody).not.toContain("paraphrase the model invented");
  });

  it("succeeds on a body far longer than any token budget would allow it to echo", async () => {
    // The case that failed in production: a body needing more output tokens than the call
    // was ever given. With the echo gone, length is not the model's problem any more.
    const long = `A Very Long Essay\n\nRead online: https://example.com/p/long\n\n${"This paragraph repeats to make the body far longer than four thousand tokens. ".repeat(400)}`;

    const ask = vi.fn<AskModel>(async () =>
      JSON.stringify({
        title: "A Very Long Essay",
        webVersionUrl: "https://example.com/p/long",
      })
    );

    const result = await extractNewsletterItems({ text: long }, "ESSAY", "m", ask);

    expect(result.mode).toBe("ESSAY");
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("bounds the stored body", async () => {
    const long = `Title\n\n${"x".repeat(config.emailIngest.maxEssayBodyChars * 2)}`;

    const result = await extractNewsletterItems(
      { text: long },
      "ESSAY",
      "m",
      async () => JSON.stringify({ title: "Title", webVersionUrl: null })
    );

    if (result.mode !== "ESSAY") throw new Error(`expected ESSAY, got ${result.mode}`);
    expect(result.item.plainTextBody.length).toBeLessThanOrEqual(
      config.emailIngest.maxEssayBodyChars
    );
  });

  it("still refuses a web version URL the email did not contain", async () => {
    const result = await extractNewsletterItems(
      { text: ESSAY_TEXT },
      "ESSAY",
      "m",
      async () =>
        JSON.stringify({
          title: "Essay",
          webVersionUrl: "https://thefoundercorner.substack.com/p/invented",
        })
    );

    if (result.mode !== "ESSAY") throw new Error("wrong mode");
    expect(result.item.webVersionUrl).toBeNull();
  });

  it("says FAILED when the model cannot even name a title", async () => {
    const ask = vi.fn<AskModel>(async () => JSON.stringify({ webVersionUrl: null }));

    const result = await extractNewsletterItems({ text: ESSAY_TEXT }, "ESSAY", "m", ask);

    expect(result.mode).toBe("FAILED");
    expect(ask).toHaveBeenCalledTimes(2);
  });
});

describe("the token budget", () => {
  it("is large enough for a full digest plus the model's thinking", () => {
    // 20 items at roughly 60 tokens each is 1200, and thinking on a 32000-character input
    // is what consumed the old 4000.
    expect(config.emailIngest.maxExtractionTokens).toBeGreaterThanOrEqual(
      config.emailIngest.maxItemsPerDigest * 60 * 2
    );
  });
});
