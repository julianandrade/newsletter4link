import { describe, expect, it } from "vitest";
import { buildExtractionInput, readableEmail } from "@/lib/inbound/extract";

/**
 * How the prompt's character budget is divided between the email's text and its links.
 *
 * Measured on the two newsletters the extractor could not read on 6 August 2026: the link
 * block was 77% and 99% of the prompt, because tracking URLs run 400 to 1200 characters
 * each and the block was assembled first and given whatever it wanted. The text, which is
 * the only part that says what the articles are, was left the remainder, and for one email
 * the remainder was nothing at all.
 *
 * The text is the content. Links are lookup data. The budget has to say so.
 */

/** A tracking URL of the length these newsletters actually use. */
const tracker = (n: number) =>
  `https://links.example.com/click/${"a".repeat(380)}?id=${n}`;

function emailWith(textChars: number, linkCount: number) {
  const text = "The newsletter says something worth reading. ".repeat(
    Math.ceil(textChars / 45)
  );
  const links = Array.from({ length: linkCount }, (_, i) => tracker(i));

  return { text: text.slice(0, textChars), links };
}

describe("the extraction input budget", () => {
  it("never lets links crowd the text out entirely", () => {
    // therundown.ai: 9865 characters of text against 31540 characters of links, in a
    // 32000-character budget. The old allocation left the text zero.
    const readable = emailWith(9865, 64);
    const input = buildExtractionInput(readable, 32_000);

    expect(input).toContain("The newsletter says something worth reading");

    const textPortion = input.split("LINKS PRESENT")[0];
    expect(textPortion.length).toBeGreaterThan(9000);
  });

  it("keeps the whole text when it fits, and drops links instead", () => {
    const readable = emailWith(9865, 64);
    const input = buildExtractionInput(readable, 32_000);

    // Every character of a 9865-character email fits inside 32000 with room to spare.
    const textPortion = input.split("LINKS PRESENT")[0];
    expect(textPortion.trim().length).toBe(9865);
  });

  it("says how many links it had to leave out", () => {
    const readable = emailWith(9865, 64);
    const input = buildExtractionInput(readable, 32_000);

    // Silence here would look like an email that simply had fewer links, and the model
    // would be asked to match articles against a list missing the one it wants.
    expect(input).toMatch(/\d+ further link/);
  });

  it("stays inside the budget it was given", () => {
    const readable = emailWith(20_000, 99);
    const input = buildExtractionInput(readable, 32_000);

    expect(input.length).toBeLessThanOrEqual(32_000);
  });

  it("truncates the text when the text alone exceeds the budget", () => {
    const readable = emailWith(50_000, 3);
    const input = buildExtractionInput(readable, 32_000);

    expect(input.length).toBeLessThanOrEqual(32_000);
    expect(input).toContain("LINKS PRESENT");
  });

  it("keeps every link when they fit", () => {
    const readable = emailWith(2_000, 5);
    const input = buildExtractionInput(readable, 32_000);

    for (const link of readable.links) {
      expect(input).toContain(link);
    }
    expect(input).not.toMatch(/further link/);
  });

  it("still says so when an email has no links", () => {
    const input = buildExtractionInput({ text: "Some words.", links: [] }, 32_000);
    expect(input).toContain("no links");
  });
});

describe("links that cannot be articles are not paid for", () => {
  const html = `<html><body>
    <p>A real story about model serving, and another about registries.</p>
    <a href="https://example.com/real-article-one">Read the first</a>
    <a href="https://example.com/real-article-two">Read the second</a>
    <a href="https://mail.example.com/unsubscribe?id=abc">Unsubscribe</a>
    <a href="https://mail.example.com/manage-preferences?id=abc">Manage your preferences</a>
    <a href="https://twitter.com/intent/tweet?url=x">Share on Twitter</a>
    <a href="https://www.facebook.com/sharer/sharer.php?u=x">Share on Facebook</a>
  </body></html>`;

  it("drops the unsubscribe and share links the prompt would reject anyway", () => {
    const readable = readableEmail({ html });

    expect(readable.links).toContain("https://example.com/real-article-one");
    expect(readable.links).toContain("https://example.com/real-article-two");

    // The prompt already tells the model to exclude these. Sending them spends budget to
    // be told no, and on these newsletters the budget is the thing that ran out.
    expect(readable.links.join(" ")).not.toContain("unsubscribe");
    expect(readable.links.join(" ")).not.toContain("manage-preferences");
    expect(readable.links.join(" ")).not.toContain("twitter.com/intent");
    expect(readable.links.join(" ")).not.toContain("facebook.com/sharer");
  });

  it("does not drop a real article whose URL merely contains a suspicious word", () => {
    const readable = readableEmail({
      html: `<html><body><p>A long enough piece of text to be readable.</p>
        <a href="https://example.com/how-to-unsubscribe-from-anything-a-guide">Guide</a>
        </body></html>`,
    });

    // The pattern has to match the boilerplate, not any URL with the word in it.
    expect(readable.links).toContain(
      "https://example.com/how-to-unsubscribe-from-anything-a-guide"
    );
  });
});
