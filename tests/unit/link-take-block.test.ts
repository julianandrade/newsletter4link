import { describe, expect, it } from "vitest";
import { linkTakeBodyHtml, topicItem, topStoryBlock } from "@/lib/email/edition-blocks";
import type { EmailArticle, EditionEmail } from "@/lib/email/edition-template";

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

const TAKE = {
  title: "Os agentes chegaram ao terminal",
  body: "A OpenAI lancou um modo agentico.\n\n## Relevancia para a Link\n\nDuas equipas usam isto.",
  language: "pt-PT",
};

const PLAIN: EmailArticle = {
  title: "OpenAI ships agent mode",
  summary: "A one sentence summary.",
  url: "https://techcrunch.com/agent",
  source: "TechCrunch",
};

const FLAGGED: EmailArticle = { ...PLAIN, linkTake: TAKE };

describe("topicItem with a Link Take", () => {
  it("is unchanged when there is no take", () => {
    const html = topicItem(PLAIN, true, true);
    expect(html).toContain("A one sentence summary.");
    expect(html).toContain("OpenAI ships agent mode");
    // Accented, matching what aiLabelFor really returns. Against the unaccented
    // spelling this assertion could never fail, which is worse than not having it.
    expect(html).not.toContain("Análise gerada por AI");
  });

  it("uses the take's own headline instead of the publisher's", () => {
    const html = topicItem(FLAGGED, true, true);
    expect(html).toContain("Os agentes chegaram ao terminal");
    expect(html).not.toContain("OpenAI ships agent mode");
  });

  it("uses the take's body instead of the summary", () => {
    const html = topicItem(FLAGGED, true, true);
    expect(html).toContain("Duas equipas usam isto.");
    expect(html).not.toContain("A one sentence summary.");
  });

  // RQ-006 rule 5.
  it("always renders the attribution and the original link", () => {
    const html = topicItem(FLAGGED, true, true);
    expect(html).toContain("TechCrunch");
    expect(html).toContain("https://techcrunch.com/agent");
  });

  // RQ-006 rule 7, in the language of the prose and not of the app.
  it("labels the piece as AI generated, in the prose's language", () => {
    expect(topicItem(FLAGGED, true, true)).toContain(
      "Análise gerada por AI a partir da fonte original"
    );
    const english = topicItem({ ...PLAIN, linkTake: { ...TAKE, language: "en" } }, true, true);
    expect(english).toContain("AI analysis generated from the original source");
  });
});

describe("topStoryBlock with a Link Take", () => {
  const base = { topStory: PLAIN, topStoryImage: "https://cdn.example.com/hero.png" };

  it("keeps the image when there is no take", () => {
    const html = topStoryBlock(base as unknown as EditionEmail);
    expect(html).toContain("<img");
  });

  // 200 words in a 380px column beside a thumbnail is unreadable on a phone.
  it("drops to single column and omits the image when flagged", () => {
    const html = topStoryBlock({ ...base, topStory: FLAGGED } as unknown as EditionEmail);
    expect(html).not.toContain("<img");
    expect(html).toContain("Duas equipas usam isto.");
    expect(html).toContain("width:100%");
  });

  it("keeps the coverage badge and the read link when flagged", () => {
    const html = topStoryBlock({
      ...base,
      topStory: { ...FLAGGED, coverage: 6 },
    } as unknown as EditionEmail);
    expect(html).toContain("Covered by 6 sources");
    expect(html).toContain("Read the analysis");
  });
});
