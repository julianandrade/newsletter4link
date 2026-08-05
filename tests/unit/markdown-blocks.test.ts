import { describe, expect, it } from "vitest";
import { parseBlocks } from "@/lib/markdown/blocks";

/**
 * The markdown subset used to render model-authored prose.
 *
 * The last two tests are the point of the module. It exists so that no path takes model
 * output to markup, and they are what proves it: hostile input comes out as the text of
 * a span, and no new kind of block appears.
 */

const REWRITE_BODY =
  "A supervisao abriu as primeiras revisoes.\n\n## Relevancia para a Link\n\nTres clientes nossos correm modelos de scoring.";

describe("parseBlocks", () => {
  it("splits paragraphs on blank lines and joins wrapped lines", () => {
    const blocks = parseBlocks("First line\ncontinues here.\n\nSecond paragraph.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      kind: "paragraph",
      spans: [{ text: "First line continues here." }],
    });
    expect(blocks[1].kind).toBe("paragraph");
  });

  it("reads ATX headings at every level the generator can produce", () => {
    const blocks = parseBlocks("# One\n\n## Two\n\n### Three");
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "heading",
      "heading",
    ]);
    expect(
      blocks.map((block) => (block.kind === "heading" ? block.text : null))
    ).toEqual(["One", "Two", "Three"]);
  });

  it("reads the relevance section heading the rewrite prompt asks for", () => {
    const blocks = parseBlocks(REWRITE_BODY);
    expect(blocks).toHaveLength(3);
    expect(blocks[1]).toEqual({ kind: "heading", text: "Relevancia para a Link" });
  });

  it("reads bullets written with either marker", () => {
    const blocks = parseBlocks("- first\n* second");
    expect(blocks.map((block) => block.kind)).toEqual(["bullet", "bullet"]);
  });

  it("marks strong and emphasis, and leaves the rest plain", () => {
    const blocks = parseBlocks("plain **bold** and *italic* and _also_ done");
    expect(blocks[0].kind).toBe("paragraph");
    if (blocks[0].kind !== "paragraph") return;

    expect(blocks[0].spans).toEqual([
      { text: "plain " },
      { text: "bold", strong: true },
      { text: " and " },
      { text: "italic", emphasis: true },
      { text: " and " },
      { text: "also", emphasis: true },
      { text: " done" },
    ]);
  });

  it("does not mistake an emphasis marker at the start of a line for a bullet", () => {
    const blocks = parseBlocks("*emphasised* opening");
    expect(blocks[0].kind).toBe("paragraph");
  });

  it("leaves an unclosed marker as literal text rather than guessing", () => {
    const blocks = parseBlocks("two ** asterisks and one * alone");
    expect(blocks[0]).toEqual({
      kind: "paragraph",
      spans: [{ text: "two ** asterisks and one * alone" }],
    });
  });

  it("returns nothing for an empty or blank body", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("   \n\n  \t ")).toEqual([]);
  });

  /**
   * The security property, and the reason no markdown library and no
   * dangerouslySetInnerHTML are involved. Model output is untrusted input
   * (CLAUDE.md LLM05), and this module's answer is that it never produces markup:
   * every character leaves as the text of a span, which React renders as a text node.
   */
  it("carries markup through as literal text, producing no new kind of block", () => {
    const hostile =
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[link](javascript:alert(3))';
    const blocks = parseBlocks(hostile);

    expect(blocks.every((block) => block.kind === "paragraph")).toBe(true);

    const text = blocks
      .map((block) => (block.kind === "paragraph" ? block.spans : []))
      .flat()
      .map((span) => span.text)
      .join(" ");

    expect(text).toContain("<script>alert(1)</script>");
    expect(text).toContain("onerror=");
    expect(text).toContain("[link](javascript:alert(3))");
  });

  it("does not treat an HTML comment or an entity as anything but text", () => {
    const blocks = parseBlocks("<!-- hidden --> &lt;b&gt; &amp;");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("paragraph");
    if (blocks[0].kind === "paragraph") {
      expect(blocks[0].spans[0].text).toContain("&amp;");
    }
  });
});
