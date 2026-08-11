import { describe, expect, it } from "vitest";
import { createRadarUnlayerTemplate } from "@/scripts/templates/radar-unlayer";
import { createRadarFrameTemplate } from "@/scripts/templates/radar-frame";
import { renderTemplate } from "@/lib/email/template-renderer";
import { personalizeHtml } from "@/lib/email/personalize";
import { hardenExportedHtml } from "@/lib/email/harden-export";
import { RADAR_MERGE_TAGS, isHeadlessTemplate } from "@/lib/email/merge-tags";

/**
 * At module scope, not in a `beforeAll`, and assigned rather than defaulted.
 *
 * `sendThrough` below is called in the body of a `describe`, which vitest runs during
 * collection, before any hook fires. So a `beforeAll` here was decorative: on this machine the
 * signature was made with whatever `UNSUBSCRIBE_SECRET` the developer's `.env` happened to
 * hold, and on a checkout without one, `personalizeHtml` threw at collection and the whole
 * file failed before a single assertion ran. It is what the first CI run on this repository
 * caught. Same shape as tests/unit/merge-tags.test.ts, which sets it at module scope too.
 *
 * Assigned unconditionally so the value is the test's own on every machine. What is signed
 * here is never verified, only checked for having replaced its merge tag, so any constant does.
 */
process.env.UNSUBSCRIBE_SECRET = "test-secret-for-unit-tests";

const { html: v3Html, design } = createRadarUnlayerTemplate({ logoUrl: "", bannerUrl: "" });
const { html: v2Html } = createRadarFrameTemplate({ logoUrl: "", bannerUrl: "" });

const articles = [
  {
    title: "Anthropic ships a new agent runtime",
    summary: "Durable sessions move into the model layer.",
    sourceUrl: "https://www.anthropic.com/news/runtime",
    category: ["Models & research"],
    relevanceScore: 9.4,
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

function sendThrough(html: string, overrides: Partial<typeof context> = {}) {
  const shared = renderTemplate(html, { ...context, ...overrides }, { keepPerRecipient: true });
  return personalizeHtml(shared, { subscriberId: "sub_1", editionId: "ed_1" });
}

describe("the headless marker", () => {
  it("is present in v3 and absent from v2", () => {
    expect(isHeadlessTemplate(v3Html)).toBe(true);
    expect(isHeadlessTemplate(v2Html)).toBe(false);
  });

  it("is carried in the design too, so it survives a save from the editor", () => {
    expect(JSON.stringify(design)).toContain("radar:headless");
  });
});

/**
 * The failure mode this variant exists to risk: v3 owns the headings, so if the blocks still
 * render theirs, every heading appears twice.
 */
describe("v3 renders each heading exactly once", () => {
  const html = sendThrough(v3Html);

  for (const heading of ["This week in 30 seconds", "Top story", "Internal"]) {
    it(`renders "${heading}" once`, () => {
      const count = html.split(heading).length - 1;
      expect(count, `"${heading}" appears ${count} times`).toBe(1);
    });
  }

  it("renders the trend radar heading once when there are trends", () => {
    const withTrends = sendThrough(v3Html, {});
    // No trends are supplied here, so the row is dropped and the heading goes with it.
    expect(withTrends).not.toContain("Trend radar");
  });
});

describe("v2 still renders its own headings, unaffected by v3", () => {
  it("keeps the block headings, because v2 does not declare itself headless", () => {
    const html = sendThrough(v2Html);
    expect(html).toContain("This week in 30 seconds");
    expect(html).toContain("Top story");
  });
});

describe("v3 through a real send", () => {
  const html = sendThrough(v3Html);

  it("leaves no merge tag unresolved", () => {
    for (const tag of RADAR_MERGE_TAGS) {
      expect(html, `${tag.name} survived`).not.toContain(`{{${tag.name}}}`);
    }
  });

  it("drops a heading along with the block it belongs to", () => {
    // Heading and body share a row, so an empty block takes its own label with it rather than
    // leaving an orphan.
    const noProject = sendThrough(v3Html, { projects: [] });
    expect(noProject).not.toContain("Internal");
    expect(noProject).not.toContain("QE offering runs remotely");
  });

  it("leaves no optional row standing empty", () => {
    const rows = html.match(/<tr class="radar-optional">[\s\S]*?<\/tr>/g) ?? [];
    for (const rowHtml of rows) {
      expect(rowHtml.replace(/<[^>]*>/g, " ").trim(), rowHtml.slice(0, 80)).not.toBe("");
    }
  });

  it("gets dark mode, the ogsc mirror and the MSO logo conditional", () => {
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("[data-ogsc]");
    expect(html).toContain('<!--[if !mso]><!--><img class="logo-dark"');
  });

  it("keeps the section eyebrows, which repeat and therefore stay in code", () => {
    expect(html).toContain("Regulation");
  });

  it("points at the signed archive and index rather than the dashboard", () => {
    expect(html).toContain("/editions/ed_1?t=");
    expect(html).toContain("/editions?t=");
    expect(html).not.toContain("/dashboard");
  });

  it("is idempotent under a second hardening pass", () => {
    expect(hardenExportedHtml(html)).toBe(html);
  });

  it("survives an edition with nothing in it", () => {
    const empty = sendThrough(v3Html, { articles: [], projects: [] });

    expect(empty).not.toContain("radar-optional");
    expect(empty).not.toContain("This week in 30 seconds");
    expect(empty).toContain("Unsubscribe");
  });

  it("escapes markup arriving in a title", () => {
    const nasty = sendThrough(v3Html, {
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

    expect(nasty).not.toContain("<script>");
    expect(nasty).toContain("&lt;script&gt;");
  });
});

describe("the v3 design", () => {
  it("lifts exactly the four headings that appear once", () => {
    const serialised = JSON.stringify(design);
    for (const heading of [
      "This week in 30 seconds",
      "Top story",
      "Trend radar",
      "Internal",
    ]) {
      expect(serialised, heading).toContain(heading);
    }
  });

  it("does not try to lift a topic section eyebrow, which repeats", () => {
    // The sections row holds only the merge tag. A row per topic cannot be seeded, because the
    // topics come from article.category at runtime.
    const sections = (design as any).body.rows.find((r: any) => r.id === "sections");
    expect(sections.columns[0].contents).toHaveLength(1);
    expect(sections.columns[0].contents[0].values.html).toBe("{{sections}}");
  });

  it("keeps the accent rule as html, because a divider cannot draw two colours", () => {
    const rule = (design as any).body.rows.find((r: any) => r.id === "accent-rule");
    expect(rule.columns[0].contents[0].type).toBe("html");
    expect(rule.columns[0].contents[0].values.html).toContain("64");
  });
});
