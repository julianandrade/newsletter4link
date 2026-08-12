import { describe, expect, it } from "vitest";
import { linkTakeBodyHtml } from "@/lib/email/edition-blocks";

describe("linkTakeBodyHtml", () => {
  it("renders a paragraph", () => {
    const html = linkTakeBodyHtml("A OpenAI lancou um modo agentico.");
    expect(html).toContain("A OpenAI lancou um modo agentico.");
    expect(html).toContain("<div");
  });

  it("renders a heading as its own line", () => {
    const html = linkTakeBodyHtml("## Relevancia para a Link\n\nDuas equipas usam isto.");
    expect(html).toContain("Relevancia para a Link");
    expect(html).toContain("Duas equipas usam isto.");
  });

  it("renders bullets with a marker", () => {
    const html = linkTakeBodyHtml("- primeiro\n- segundo");
    expect(html).toContain("primeiro");
    expect(html).toContain("segundo");
    expect(html.match(/&bull;/g)).toHaveLength(2);
  });

  it("renders strong and emphasis", () => {
    const html = linkTakeBodyHtml("isto e **forte** e *leve*");
    expect(html).toContain("<strong>forte</strong>");
    expect(html).toContain("<em>leve</em>");
  });

  it("escapes markup in the prose", () => {
    const html = linkTakeBodyHtml('um <script>alert("x")</script> no texto');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });

  // RQ-006 rule 6, as a property rather than a prompt. parseBlocks does not
  // understand links or images, so neither can reach an inbox. If this test
  // ever fails because parseBlocks learned about links, rule 6 needs a real
  // filter here before the parser change lands.
  it("leaves a markdown image or link as literal text", () => {
    const html = linkTakeBodyHtml("![foto](https://example.com/a.png) e [ligacao](https://b.com)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
    expect(html).toContain("![foto]");
    expect(html).toContain("[ligacao]");
  });

  it("returns an empty string for an empty body", () => {
    expect(linkTakeBodyHtml("")).toBe("");
    expect(linkTakeBodyHtml("   ")).toBe("");
  });
});
