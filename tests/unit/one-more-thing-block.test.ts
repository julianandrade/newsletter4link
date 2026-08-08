import { describe, expect, it } from "vitest";
import { oneMoreThingBlock } from "@/lib/email/edition-blocks";
import { renderEditionEmail, type EditionEmail } from "@/lib/email/edition-template";
import { editionMergeValues } from "@/lib/email/merge-tags";

/**
 * The closing block.
 *
 * The assertion that matters most is the alt text. `renderCustomBlocks` in
 * template-renderer.ts emits `alt=""` on an image block, so a reader whose client blocks
 * images gets nothing at all. Many corporate clients do block them by default, and a meme
 * whose joke lives only in the picture reaches those readers as an empty box. Here the
 * text is required and it is also the alt, so the joke always arrives.
 */
describe("oneMoreThingBlock", () => {
  it("renders nothing when there is no aside, so the row can be dropped", () => {
    expect(oneMoreThingBlock(undefined)).toBe("");
  });

  it("renders the text", () => {
    const html = oneMoreThingBlock({ kind: "JOKE", text: "Ship it on Friday." });

    expect(html).toContain("Ship it on Friday.");
  });

  it("escapes the text, because a suggestion can come from a model", () => {
    const html = oneMoreThingBlock({
      kind: "JOKE",
      text: "<script>alert(1)</script>",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("gives the image the aside's own text as alt, never an empty one", () => {
    const html = oneMoreThingBlock({
      kind: "JOKE",
      text: "A senior engineer reviews a diff no human wrote.",
      imageUrl: "https://example.supabase.co/meme.gif",
    });

    expect(html).toContain('alt="A senior engineer reviews a diff no human wrote."');
    expect(html).not.toContain('alt=""');
  });

  it("escapes the alt too, so a quote in the joke cannot break out of the attribute", () => {
    const html = oneMoreThingBlock({
      kind: "JOKE",
      text: 'He said "ship it" and left.',
      imageUrl: "https://example.supabase.co/a.png",
    });

    expect(html).not.toContain('alt="He said "ship it" and left."');
    expect(html).toContain("&quot;ship it&quot;");
  });

  it("drops an image URL that is not http or https", () => {
    const html = oneMoreThingBlock({
      kind: "JOKE",
      text: "Fine.",
      imageUrl: "javascript:alert(1)",
    });

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
  });

  it("renders no image element at all when there is no image", () => {
    const html = oneMoreThingBlock({ kind: "JOKE", text: "Text only." });

    expect(html).not.toContain("<img");
  });

  it("renders the attribution when there is one", () => {
    const html = oneMoreThingBlock({
      kind: "NOTE",
      text: "Welcome to the four new joiners.",
      attribution: "Julian",
    });

    expect(html).toContain("Julian");
  });

  it("drops its own heading when the template owns the headings", () => {
    const withHeading = oneMoreThingBlock({ kind: "JOKE", text: "x" });
    const headless = oneMoreThingBlock({ kind: "JOKE", text: "x" }, { heading: false });

    expect(withHeading).toContain("One more thing");
    expect(headless).not.toContain("One more thing");
  });

  it("carries the dark-mode classes rather than inventing a colour", () => {
    // The [data-ogsc] mirror Outlook.com needs is keyed on these class names, so a block
    // that styles itself with its own hex values would be light-only in that client.
    const html = oneMoreThingBlock({ kind: "JOKE", text: "x", attribution: "y" });

    expect(html).toContain('class="tint"');
    expect(html).toContain('class="t-body"');
    expect(html).toContain('class="t-muted"');
  });
});

/**
 * The block reaching the finished email, not just the fragment.
 *
 * The fragment passing says nothing about whether it was wired into the template and into
 * the merge-tag table, which are the two places it has to appear for the built-in renderer
 * and the Unlayer variants to agree.
 */
const bare: EditionEmail = {
  editionLabel: "Week 32",
  dateLabel: "3-9 Aug 2026",
  previewText: "x",
  subject: "AI Radar Weekly - Week 32, 2026",
  bullets: [],
  sections: [],
  trends: [],
  portalUrl: "https://example.com/editions",
  archiveUrl: "https://example.com/editions/ed_1",
  unsubscribeUrl: "https://example.com/unsubscribe",
  logoOnLight: "https://example.com/h-light.png",
  logoOnDark: "https://example.com/h-dark.png",
  footerLogoOnLight: "https://example.com/v-light.png",
  footerLogoOnDark: "https://example.com/v-dark.png",
  companyLine: "Linkroad Group, Lisboa, Portugal",
};

describe("the closing block in a finished edition", () => {
  it("appears in the built-in renderer when the edition picked one", () => {
    const html = renderEditionEmail({
      ...bare,
      oneMoreThing: { kind: "JOKE", text: "The diff reviewed itself and approved." },
    });

    expect(html).toContain("The diff reviewed itself and approved.");
    expect(html).toContain("One more thing");
  });

  it("leaves no trace at all when the edition picked none", () => {
    const html = renderEditionEmail(bare);

    expect(html).not.toContain("One more thing");
  });

  it("reaches the merge-tag value, which is what feeds the Unlayer variants", () => {
    const values = editionMergeValues({
      ...bare,
      oneMoreThing: { kind: "JOKE", text: "Agentic everything, including the outage." },
    });

    expect(values.one_more_thing).toContain("Agentic everything, including the outage.");
  });

  it("gives the merge tag an empty value, not a placeholder, when there is none", () => {
    // Empty rather than a literal {{one_more_thing}}: dropEmptyOptionalRows removes the row
    // around an empty value, and a visible placeholder in a sent email is the failure the
    // merge-tag table exists to prevent.
    expect(editionMergeValues(bare).one_more_thing).toBe("");
  });

  it("wraps the block in its own table for an Unlayer html block", () => {
    // A bare <tr> inside Unlayer's own table cell is invalid markup and clients disagree
    // about how to recover from it.
    const values = editionMergeValues(
      { ...bare, oneMoreThing: { kind: "NOTE", text: "A note." } },
      { wrapInTable: true }
    );

    expect(values.one_more_thing.startsWith("<table")).toBe(true);
  });
});
