import { describe, expect, it } from "vitest";
import {
  buildDigestPrompt,
  buildExtractionInput,
  keepPresentUrls,
  readableEmail,
} from "@/lib/inbound/extract";

/**
 * The pairing bug of 8 August 2026.
 *
 * `readableEmail` used to return the text and a list of bare URLs, and nothing else. The
 * anchor that tied a title to its href was destroyed in that step, so the model was handed
 * titles on one side and a list of URLs on the other and asked to put them back together.
 *
 * For a newsletter that wraps every link in a tracking redirect, the URLs carry no
 * information at all: `link.mail.beehiiv.com/ss/c/u001.IOfk...` and
 * `link.mail.beehiiv.com/ss/c/u001.os0w...` are indistinguishable. There is no signal to
 * pair on, so the model guessed, and on one real email four of the five checkable items
 * were paired with somebody else's URL. "The Tutor Was Right, Students Quit" was stored
 * with the href belonging to "Hurricane Warnings a Day Sooner", which is why clicking it
 * opened a DeepMind piece about cyclone forecasting.
 *
 * The fix is to stop destroying the pairing: every link is offered with its own anchor
 * text, and an item whose title matches no anchor is dropped rather than guessed at.
 */

const BEEHIIV = `
<html><body>
  <h2><a href="https://link.mail.beehiiv.com/ss/c/u001.AAAA">The Tutor Was Right, Students Quit</a></h2>
  <p>Six years of data from a Stanford course.</p>
  <h2><a href="https://link.mail.beehiiv.com/ss/c/u001.BBBB">Hurricane Warnings a Day Sooner</a></h2>
  <p>A forecasting model beats the physics baseline.</p>
</body></html>`;

describe("readableEmail keeps the anchor a link came from", () => {
  it("pairs each URL with its own anchor text", () => {
    const readable = readableEmail({ html: BEEHIIV });

    expect(readable.links).toEqual([
      {
        url: "https://link.mail.beehiiv.com/ss/c/u001.AAAA",
        text: "The Tutor Was Right, Students Quit",
      },
      {
        url: "https://link.mail.beehiiv.com/ss/c/u001.BBBB",
        text: "Hurricane Warnings a Day Sooner",
      },
    ]);
  });

  it("gives a bare URL from a plain text email an empty anchor rather than inventing one", () => {
    const readable = readableEmail({ text: "read it at https://example.com/piece today" });

    expect(readable.links).toEqual([{ url: "https://example.com/piece", text: "" }]);
  });

  it("keeps the first anchor text when one URL appears twice", () => {
    // A newsletter links the same piece from its title and from a bare "read more". The
    // title is the one that identifies it, and it comes first.
    const readable = readableEmail({
      html: `<a href="https://x.com/a">The real title</a><a href="https://x.com/a">read more</a>`,
    });

    expect(readable.links).toEqual([{ url: "https://x.com/a", text: "The real title" }]);
  });

  it("takes the alt-free anchor text of an image link as empty, not as markup", () => {
    const readable = readableEmail({
      html: `<a href="https://x.com/a"><img src="https://x.com/i.png"></a>`,
    });

    expect(readable.links[0]?.text).toBe("");
  });
});

describe("buildExtractionInput shows the model the pairing", () => {
  it("prints the anchor text beside its URL", () => {
    const input = buildExtractionInput({
      text: "body",
      links: [{ url: "https://a.com/1", text: "The Tutor Was Right" }],
    });

    expect(input).toContain('1. "The Tutor Was Right" -> https://a.com/1');
  });

  it("says a link had no anchor text rather than leaving the line ambiguous", () => {
    const input = buildExtractionInput({
      text: "body",
      links: [{ url: "https://a.com/1", text: "" }],
    });

    expect(input).toContain('1. "(no link text)" -> https://a.com/1');
  });

  it("caps a runaway anchor so one link cannot eat the budget", () => {
    const input = buildExtractionInput({
      text: "body",
      links: [{ url: "https://a.com/1", text: "x".repeat(5_000) }],
    });

    expect(input.length).toBeLessThan(1_000);
  });

  it("still respects the character cap with anchors present", () => {
    const input = buildExtractionInput(
      {
        text: "y".repeat(50_000),
        links: [{ url: "https://a.com/1", text: "a title" }],
      },
      1_000
    );

    expect(input.length).toBeLessThanOrEqual(1_000);
  });
});

describe("the digest prompt forbids guessing the pairing", () => {
  it("tells the model to take the URL from the matching line", () => {
    const prompt = buildDigestPrompt("body", 20);

    expect(prompt).toMatch(/anchor text/i);
    // The rule that stops the guess: no match means no item.
    expect(prompt).toMatch(/leave (it|the item) out/i);
  });
});

describe("keepPresentUrls checks the pairing, not just the presence", () => {
  const links = [
    { url: "https://a.com/1", text: "The Tutor Was Right, Students Quit" },
    { url: "https://b.com/2", text: "Hurricane Warnings a Day Sooner" },
  ];

  it("keeps an item whose title matches the anchor its URL came from", () => {
    const { items } = keepPresentUrls(
      [{ title: "The Tutor Was Right, Students Quit", url: "https://a.com/1", snippet: "" }],
      links
    );

    expect(items).toHaveLength(1);
  });

  it("drops an item paired with another item's URL", () => {
    // The exact failure seen in production: the title of one item, the href of another.
    const { items, dropped } = keepPresentUrls(
      [{ title: "The Tutor Was Right, Students Quit", url: "https://b.com/2", snippet: "" }],
      links
    );

    expect(items).toEqual([]);
    expect(dropped).toEqual(["https://b.com/2"]);
  });

  it("accepts a title the newsletter shortened, rather than demanding it verbatim", () => {
    // A digest often titles an item differently from its own link text. Requiring an exact
    // string would drop most of a real newsletter, so containment either way is enough.
    const { items } = keepPresentUrls(
      [{ title: "The Tutor Was Right", url: "https://a.com/1", snippet: "" }],
      links
    );

    expect(items).toHaveLength(1);
  });

  it("keeps an item whose link had no anchor text to check against", () => {
    // Nothing to contradict. A bare URL in a plain text email has no anchor, and dropping
    // every one of those would lose the plain text newsletters entirely.
    const { items } = keepPresentUrls(
      [{ title: "Anything", url: "https://c.com/3", snippet: "" }],
      [{ url: "https://c.com/3", text: "" }]
    );

    expect(items).toHaveLength(1);
  });
});
