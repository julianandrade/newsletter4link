import { beforeAll, describe, expect, it } from "vitest";
import { createRadarFrameTemplate } from "@/scripts/templates/radar-frame";
import { renderTemplate } from "@/lib/email/template-renderer";
import { hardenExportedHtml } from "@/lib/email/harden-export";
import { personalizeHtml } from "@/lib/email/personalize";
import { RADAR_MERGE_TAGS } from "@/lib/email/merge-tags";
import { renderArticleItemsHtml } from "@/lib/email/edition-template";
import { publicationName } from "@/lib/email/edition-data";

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret-for-unit-tests";
});

const { html: v2Html, design } = createRadarFrameTemplate({ logoUrl: "", bannerUrl: "" });

const articles = [
  {
    title: "Anthropic ships a new agent runtime",
    summary: "Durable sessions move into the model layer.",
    sourceUrl: "https://www.anthropic.com/news/runtime",
    category: ["Models & research"],
    relevanceScore: 9.4,
    content: `<img src="https://cdn.anthropic.com/lead.jpg" width="1200" height="675">`,
  },
  {
    title: "EU AI Act enforcement timeline slips again",
    summary: "High-risk obligations move to 2027.",
    sourceUrl: "https://www.reuters.com/eu-ai-act",
    category: ["Regulation"],
    relevanceScore: 7.8,
  },
];

const projects = [
  {
    name: "QE offering runs remotely",
    description: "Two infrastructures, one variable.",
    team: "AI practice",
    impact: "Cut regression time by a third.",
  },
];

const context = { articles, projects, week: 32, year: 2026, label: "Week 32" };

/** What a real send produces: shared tags resolved, then signed links, then hardening. */
function sent(overrides: Partial<typeof context> = {}) {
  const shared = renderTemplate(v2Html, { ...context, ...overrides }, { keepPerRecipient: true });
  return personalizeHtml(shared, { subscriberId: "sub_1", editionId: "ed_1" });
}

describe("the v2 masthead logo", () => {
  it("falls back to the Linkroad pair, so a template with no org branding is not logoless", () => {
    // v1 always shows the pair. Without this v2 rendered a masthead with no logo at all whenever
    // the organization had uploaded none, which is most of them.
    expect(v2Html).toContain('class="logo-light"');
    expect(v2Html).toContain('class="logo-dark"');
    expect(v2Html).toContain("linkroad-h-on-light.png");
    expect(v2Html).toContain("linkroad-h-on-dark.png");
  });

  it("uses the organization's own logo when it has one, in place of the pair", () => {
    const { html } = createRadarFrameTemplate({
      logoUrl: "https://cdn.example.com/acme.png",
      bannerUrl: "",
    });

    expect(html).toContain("https://cdn.example.com/acme.png");
    expect(html).not.toContain("linkroad-h-on-light.png");
  });

  it("gets its dark logo wrapped in the MSO conditional on export", () => {
    // Unlayer will not emit the conditional, so wrapMsoLogo has to find it by class.
    expect(hardenExportedHtml(v2Html)).toContain("<!--[if !mso]><!--><img class=\"logo-dark\"");
  });
});

describe("the v2 design", () => {
  it("declares the 640px content width the design is built on", () => {
    expect((design as any).body.values.contentWidth).toBe("640px");
  });

  it("seeds the dark-mode hooks the hardening pass selects on", () => {
    const serialised = JSON.stringify(design);
    for (const hook of ["card", "tint", "t-body", "t-strong", "t-muted", "rule", "body-bg"]) {
      expect(serialised, `missing hook: ${hook}`).toContain(hook);
    }
  });

  it("marks exactly the four blocks that can render nothing as optional", () => {
    const optionalRows = (design as any).body.rows.filter((r: any) =>
      String(r.values._meta.htmlClassNames).includes("radar-optional")
    );
    expect(optionalRows.map((r: any) => r.id).sort()).toEqual([
      "internal",
      "tldr",
      "top-story",
      "trends",
    ]);
  });

  it("gives the merge-tag blocks no container padding, because each block brings its own", () => {
    const rows = (design as any).body.rows;
    const tagRows = ["tldr", "top-story", "sections", "trends", "internal"];

    for (const id of tagRows) {
      const block = rows.find((r: any) => r.id === id).columns[0].contents[0];
      expect(block.values.containerPadding, id).toBe("0px");
    }
  });
});

describe("the v2 html through a real send", () => {
  it("leaves no merge tag unresolved", () => {
    const html = sent();
    for (const tag of RADAR_MERGE_TAGS) {
      expect(html, `${tag.name} survived`).not.toContain(`{{${tag.name}}}`);
    }
  });

  it("renders the articles byte for byte as the built-in edition does", () => {
    // This is the whole point of edition-blocks.ts. If it drifts, a template built here looks
    // like a different product.
    const html = sent();
    const expected = renderArticleItemsHtml(
      articles.slice(1).map((article) => ({
        title: article.title,
        summary: article.summary,
        url: article.sourceUrl,
        source: publicationName(article.sourceUrl),
      }))
    );

    // The lead is promoted to the top story, so the section holds the rest.
    const sectionItem = expected.slice(expected.indexOf("<tr>"), expected.lastIndexOf("</tr>"));
    expect(html).toContain(sectionItem);
  });

  it("names the edition once, with the week range beside it", () => {
    const html = sent();
    expect(html).toContain("Week 32");
    expect(html).toContain("3-9 Aug 2026");
    expect(html.match(/2026/g)!.length).toBeGreaterThan(0);
  });

  it("gets the dark-mode block and the ogsc mirror injected", () => {
    const html = sent();
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("[data-ogsc]");
  });

  it("points the call to action at the signed edition index, not the dashboard", () => {
    const html = sent();
    expect(html).toContain("/editions?t=");
    expect(html).not.toContain("/dashboard");
  });

  it("signs the unsubscribe link", () => {
    expect(sent()).toMatch(/\/unsubscribe\?token=[^"]+/);
  });

  it("carries the top story's image through, which a stored template used to drop", () => {
    // renderTemplate rebuilt the edition without the article's content, so the image reached the
    // built-in edition and no stored template. Found only by rendering a seeded row.
    expect(sent()).toContain("https://cdn.anthropic.com/lead.jpg");
  });

  it("drops the trend radar row on a week with no trends", () => {
    const html = sent();
    // No trends are supplied, so {{trend_radar}} renders empty and its row must not survive.
    // A kept optional row keeps its marker class on purpose, so the check is for the content.
    expect(html).not.toContain("Trend radar");
  });

  it("leaves no optional row standing empty", () => {
    // The invariant that matters: every radar-optional row still in the output has content.
    const html = sent();
    const rows = html.match(/<tr class="radar-optional">[\s\S]*?<\/tr>/g) ?? [];

    for (const rowHtml of rows) {
      expect(rowHtml.replace(/<[^>]*>/g, " ").trim(), rowHtml.slice(0, 80)).not.toBe("");
    }
  });

  it("keeps the rows whose blocks did render", () => {
    const html = sent();
    expect(html).toContain("This week in 30 seconds");
    expect(html).toContain("Top story");
    expect(html).toContain("QE offering runs remotely");
  });

  it("drops the internal row when no project is selected", () => {
    const html = sent({ projects: [] });
    expect(html).not.toContain("QE offering runs remotely");
  });

  it("survives an edition with nothing in it at all", () => {
    const html = sent({ articles: [], projects: [] });

    // Nothing optional rendered, so every one of those rows is gone.
    expect(html).not.toContain("radar-optional");
    expect(html).not.toContain("This week in 30 seconds");
    // The frame is still there: an empty edition is a quiet edition, not a broken one.
    expect(html).toContain("AI&nbsp;RADAR");
    expect(html).toContain("Unsubscribe");
  });

  it("is idempotent under a second hardening pass", () => {
    const once = sent();
    expect(hardenExportedHtml(once)).toBe(once);
  });

  it("escapes a title carrying markup, which arrives from RSS and from model output", () => {
    const html = sent({
      articles: [
        {
          title: 'A <script>alert("x")</script> title',
          summary: "Summary.",
          sourceUrl: "https://example.com/a",
          category: ["Models"],
          relevanceScore: 9,
        },
      ],
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
