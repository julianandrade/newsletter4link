import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildEditionEmail,
  publicationName,
  trendsForEmail,
} from "@/lib/email/edition-data";
import {
  BLOCK_ANCHORS,
  escapeHtml,
  renderEditionEmail,
  renderEditionText,
  type EditionEmail,
} from "@/lib/email/edition-template";
import {
  injectCustomBlocks,
  renderTemplate,
} from "@/lib/email/template-renderer";
import { computeTrends, type TrendInputArticle } from "@/lib/trends/compute";
import { editionEmailLabel } from "@/lib/editions/identity";

const APP_URL = "https://newsletter4link.vercel.app";

// renderTemplate signs unsubscribe links, which needs a signing secret.
const originalSecret = process.env.UNSUBSCRIBE_SECRET;
beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret-for-unit-tests";
});
afterAll(() => {
  if (originalSecret === undefined) delete process.env.UNSUBSCRIBE_SECRET;
  else process.env.UNSUBSCRIBE_SECRET = originalSecret;
});

function input(overrides: Partial<Parameters<typeof buildEditionEmail>[0]> = {}) {
  return buildEditionEmail({
    appUrl: APP_URL,
    week: 31,
    year: 2026,
    articles: [
      {
        title: "Anthropic ships Claude Opus 5",
        summary: "A new frontier model. It leads on agentic benchmarks.",
        sourceUrl: "https://www.anthropic.com/news/opus-5",
        category: ["Models & research"],
        relevanceScore: 9.4,
      },
      {
        title: "Agent frameworks converge on MCP",
        summary: "Three vendors adopted the same tool protocol this week.",
        sourceUrl: "https://techcrunch.com/agents-mcp",
        category: ["Agents & tooling"],
        relevanceScore: 7.1,
      },
    ],
    projects: [
      {
        name: "Radar for retail banking",
        description: "A tuned feed for a Lisbon bank.",
        team: "AI practice",
        impact: "Cut manual triage by 60%.",
        projectDate: "2026-07-20T00:00:00.000Z",
      },
    ],
    ...overrides,
  });
}

describe("buildEditionEmail", () => {
  it("leads with the highest scoring article", () => {
    const edition = input();
    expect(edition.topStory?.title).toBe("Anthropic ships Claude Opus 5");
    // The lead is not repeated inside a topic section.
    const titles = edition.sections.flatMap((s) => s.items.map((i) => i.title));
    expect(titles).not.toContain("Anthropic ships Claude Opus 5");
  });

  it("keeps editorial order when nothing is scored", () => {
    const edition = input({
      articles: [
        { title: "First", summary: "a", sourceUrl: "https://a.com/1", category: ["X"] },
        { title: "Second", summary: "b", sourceUrl: "https://b.com/2", category: ["X"] },
      ],
    });
    expect(edition.topStory?.title).toBe("First");
  });

  it("derives publication names rather than showing hosts", () => {
    expect(publicationName("https://www.techcrunch.com/x")).toBe("TechCrunch");
    expect(publicationName("https://simonwillison.net/x")).toBe("Simonwillison");
    expect(publicationName("not a url")).toBeUndefined();
  });

  it("builds absolute asset URLs", () => {
    const edition = input({ subscriberId: "sub_123" });
    expect(edition.logoOnLight).toBe(`${APP_URL}/email/linkroad-h-on-light.png`);
    expect(edition.logoOnDark).toBe(`${APP_URL}/email/linkroad-h-on-dark.png`);
  });

  it("uses the signed unsubscribe URL it is given, and never invents one", () => {
    const signed = `${APP_URL}/unsubscribe?token=c3ViXzEyMw.sig`;
    expect(input({ subscriberId: "sub_123", unsubscribeUrl: signed }).unsubscribeUrl).toBe(
      signed
    );
    // Given no signed URL, it must fall back to the generic page rather than
    // leaking a raw, enumerable subscriber id into the link.
    const unsigned = input({ subscriberId: "sub_123" });
    expect(unsigned.unsubscribeUrl).toBe(`${APP_URL}/unsubscribe`);
    expect(unsigned.unsubscribeUrl).not.toContain("sub_123");
  });

  it("tolerates a trailing slash on the app URL", () => {
    const edition = input({ appUrl: `${APP_URL}/` });
    expect(edition.portalUrl).toBe(`${APP_URL}/dashboard`);
  });

  it("captions a thin week and stays silent on a full one", () => {
    const full = input({
      articles: Array.from({ length: 5 }, (_, index) => ({
        title: `Story ${index}`,
        summary: "s",
        sourceUrl: `https://techcrunch.com/${index}`,
        category: ["X"],
      })),
    });
    expect(full.bulletsNote).toBeUndefined();

    const thin = input({
      articles: [
        { title: "Only story", summary: "s", sourceUrl: "https://a.com/1", category: ["X"] },
      ],
    });
    expect(thin.bulletsNote).toContain("quieter week");
    expect(renderEditionEmail(thin)).toContain("quieter week");
    // Nothing to caption when there is nothing at all.
    expect(input({ articles: [] }).bulletsNote).toBeUndefined();
  });

  it("survives an edition with nothing in it", () => {
    const edition = input({ articles: [], projects: [] });
    expect(edition.topStory).toBeUndefined();
    expect(edition.sections).toHaveLength(0);
    expect(edition.internal).toBeUndefined();
    expect(() => renderEditionEmail(edition)).not.toThrow();
  });
});

describe("renderEditionEmail", () => {
  const SIGNED = `${APP_URL}/unsubscribe?token=c3ViXzk.sig`;
  const html = renderEditionEmail(
    input({ subscriberId: "sub_9", unsubscribeUrl: SIGNED })
  );

  it("opens with a doctype and carries a preheader", () => {
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("mso-hide:all");
  });

  it("ships both dark-mode mechanisms", () => {
    expect(html).toContain("@media (prefers-color-scheme: dark)");
    expect(html).toContain("[data-ogsc] .card");
  });

  it("swaps the logo pair and never leaves a logo unlabelled", () => {
    expect(html).toContain('class="logo-light"');
    expect(html).toContain('class="logo-dark"');
    const images = html.match(/<img[^>]*>/g) ?? [];
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(image).toMatch(/\balt="/);
  });

  it("uses only absolute image sources", () => {
    for (const match of html.matchAll(/<img[^>]*src="([^"]+)"/g)) {
      expect(match[1]).toMatch(/^https?:\/\//);
    }
  });

  it("keeps every href absolute or an in-document anchor", () => {
    for (const match of html.matchAll(/href="([^"]*)"/g)) {
      expect(match[1]).toMatch(/^(https?:\/\/|#)/);
    }
  });

  it("carries the signed unsubscribe link and no raw subscriber id", () => {
    expect(html).toContain(SIGNED.replace(/&/g, "&amp;"));
    expect(html).not.toContain("id=sub_9");
  });

  it("omits the trend radar when there is no trend data", () => {
    expect(html).not.toContain("Trend radar");
  });

  it("renders the trend radar when there is", () => {
    const withTrends = renderEditionEmail(
      input({ trends: [{ name: "Agentic evals", delta: 41, note: "12 mentions." }] })
    );
    expect(withTrends).toContain("Trend radar");
    expect(withTrends).toContain("41%");
  });

  it("says new rather than inventing a percentage with no baseline", () => {
    const html = renderEditionEmail(
      input({ trends: [{ name: "Sovereign AI", delta: null, note: "First week." }] })
    );
    expect(html).toContain(">new<");
  });

  it("stays well inside Gmail's 102KB clipping threshold", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      title: `Story number ${index} with a reasonably long editorial headline`,
      summary:
        "A two sentence summary of the kind the curation pipeline produces. It runs to about this length in practice.",
      sourceUrl: `https://techcrunch.com/story-${index}`,
      category: [index % 2 ? "Agents & tooling" : "Models & research"],
      relevanceScore: 9 - index * 0.1,
    }));
    const size = Buffer.byteLength(renderEditionEmail(input({ articles: many })), "utf8");
    expect(size).toBeLessThan(102 * 1024);
  });

  it("has no long dashes anywhere in the output", () => {
    expect(html).not.toMatch(/[—–―−]/);
  });
});

describe("escaping", () => {
  const hostile = '<script>alert("x")</script>';

  it("escapes titles and summaries", () => {
    const html = renderEditionEmail(
      input({
        articles: [
          {
            title: hostile,
            summary: `summary ${hostile}`,
            sourceUrl: "https://techcrunch.com/x",
            category: ["Models"],
          },
        ],
      })
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes project copy", () => {
    const html = renderEditionEmail(
      input({
        projects: [{ name: hostile, description: hostile, team: "T" }],
      })
    );
    expect(html).not.toContain("<script>");
  });

  it("drops a javascript: link rather than rendering it", () => {
    const html = renderEditionEmail(
      input({
        articles: [
          {
            title: "Trap",
            summary: "s",
            // eslint-disable-next-line no-script-url
            sourceUrl: "javascript:alert(1)",
            category: ["X"],
          },
        ],
      })
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Trap");
  });

  it("escapes each of the five characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#039;");
  });
});

describe("renderEditionText", () => {
  it("includes the stories, the links and the unsubscribe URL", () => {
    const text = renderEditionText(
      input({
        subscriberId: "sub_1",
        unsubscribeUrl: `${APP_URL}/unsubscribe?token=c3ViXzE.sig`,
      })
    );
    expect(text).toContain("Anthropic ships Claude Opus 5");
    expect(text).toContain("https://www.anthropic.com/news/opus-5");
    expect(text).toContain(`${APP_URL}/unsubscribe?token=c3ViXzE.sig`);
    expect(text).not.toContain("<");
  });
});

describe("custom blocks", () => {
  const blocks = [
    {
      id: "b1",
      type: "text" as const,
      content: "<strong>Editor's note</strong>",
      position: "before-articles" as const,
    },
    {
      id: "b2",
      type: "image" as const,
      content: "https://cdn.example.com/banner.png",
      position: "after-projects" as const,
    },
  ];

  it("places blocks at the anchors and strips unused anchors", () => {
    const html = injectCustomBlocks(renderEditionEmail(input()), blocks);
    expect(html).toContain("Editor's note");
    expect(html).toContain("https://cdn.example.com/banner.png");
    for (const anchor of Object.values(BLOCK_ANCHORS)) {
      expect(html).not.toContain(anchor);
    }
  });

  it("leaves no anchors behind when there are no blocks", () => {
    const html = injectCustomBlocks(renderEditionEmail(input()), undefined);
    for (const anchor of Object.values(BLOCK_ANCHORS)) {
      expect(html).not.toContain(anchor);
    }
  });

  it("refuses an image block with a non-http scheme", () => {
    const html = injectCustomBlocks(renderEditionEmail(input()), [
      { id: "x", type: "image", content: "javascript:alert(1)", position: "after-articles" },
    ]);
    expect(html).not.toContain("javascript:");
  });
});

describe("renderTemplate", () => {
  const context = {
    articles: [
      {
        title: "A <b>story</b>",
        summary: "Summary text",
        sourceUrl: "https://techcrunch.com/a",
        category: ["X"],
      },
    ],
    projects: [{ name: "P", description: "D", team: "T", impact: null }],
    week: 31,
    year: 2026,
    subscriberId: "sub_2",
  };

  it("substitutes every supported placeholder", () => {
    const html = renderTemplate(
      "{{week}}|{{year}}|{{articleCount}}|{{projectCount}}|{{unsubscribe_url}}",
      context
    );
    const [week, year, articleCount, projectCount, url] = html.split("|");
    expect([week, year, articleCount, projectCount]).toEqual(["31", "2026", "1", "1"]);
    // Signed token, not the raw subscriber id.
    expect(url).toMatch(/\/unsubscribe\?token=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(url).not.toContain("sub_2");
  });

  it("escapes article markup", () => {
    const html = renderTemplate("{{articles}}", context);
    expect(html).not.toContain("<b>story</b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("does not re-substitute a placeholder that appears in content", () => {
    const html = renderTemplate("{{articles}}", {
      ...context,
      articles: [
        {
          title: "{{projects}}",
          summary: "s",
          sourceUrl: "https://techcrunch.com/a",
          category: [],
        },
      ],
    });
    expect(html).toContain("{{projects}}");
  });

  it("leaves an unknown placeholder alone", () => {
    expect(renderTemplate("{{nope}}", context)).toBe("{{nope}}");
  });
});

describe("trendsForEmail", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-08-03T00:00:00.000Z");

  function article(daysAgo: number, topic: string, host: string): TrendInputArticle {
    return {
      id: `${topic}-${daysAgo}-${host}`,
      title: `${topic} story`,
      sourceUrl: `https://${host}/x${daysAgo}`,
      publishedAt: new Date(now - daysAgo * DAY),
      relevanceScore: 8,
      category: [topic],
    };
  }

  it("keeps only topics that actually accelerated", () => {
    const articles = [
      // Accelerating: 4 mentions in the recent fortnight against 1 before it.
      article(1, "Agentic evals", "techcrunch.com"),
      article(3, "Agentic evals", "theverge.com"),
      article(6, "Agentic evals", "techcrunch.com"),
      article(11, "Agentic evals", "arxiv.org"),
      article(20, "Agentic evals", "techcrunch.com"),
      // Flat, and with no prior baseline: no honest percentage, so excluded.
      article(2, "Quiet topic", "wired.com"),
    ];

    const { trends } = computeTrends(articles, { days: 90, limit: 12, now });
    const forEmail = trendsForEmail(trends);

    expect(forEmail).toHaveLength(1);
    expect(forEmail[0].name).toBe("Agentic evals");
    expect(forEmail[0].delta).toBe(300);
    expect(forEmail[0].note).toContain("mentions");
  });

  it("returns nothing when there is no movement to report", () => {
    const { trends } = computeTrends([article(1, "Solo", "wired.com")], {
      days: 90,
      limit: 12,
      now,
    });
    expect(trendsForEmail(trends)).toEqual([]);
  });
});

describe("edition email shape is stable", () => {
  it("exposes every field the template needs", () => {
    const edition: EditionEmail = input();
    const required: Array<keyof EditionEmail> = [
      "editionLabel",
      "dateLabel",
      "previewText",
      "subject",
      "portalUrl",
      "unsubscribeUrl",
      "logoOnLight",
      "logoOnDark",
      "footerLogoOnLight",
      "footerLogoOnDark",
      "companyLine",
    ];
    for (const key of required) {
      expect(String(edition[key] ?? "").length).toBeGreaterThan(0);
    }
  });
});

/**
 * RQ-008: the subject and the edition label follow the edition's name.
 *
 * Both were built from the week number, so a special edition would have gone out
 * subject-lined as a weekly issue of a week it did not belong to.
 */
describe("a named edition", () => {
  const named = (label: string) =>
    buildEditionEmail({
      appUrl: APP_URL,
      week: 32,
      year: 2026,
      label,
      articles: [
        {
          title: "A story",
          summary: "A summary.",
          sourceUrl: "https://example.com/a",
          category: ["Regulation"],
          relevanceScore: 8,
        },
      ],
      projects: [],
    });

  it("puts its name in the eyebrow and the subject", () => {
    const email = named("AI Act special");

    expect(email.editionLabel).toBe("AI Act special");
    expect(email.subject).toBe("AI Radar - AI Act special");
  });

  it("keeps the wording subscribers recognise when nothing was named", () => {
    const email = named("Week 32 · 2026");

    expect(email.editionLabel).toBe("Week 32 · 2026");
    expect(email.subject).toBe("AI Radar Weekly - Week 32, 2026");
  });

  it("falls back to the week when no label is supplied at all", () => {
    const email = buildEditionEmail({
      appUrl: APP_URL,
      week: 32,
      year: 2026,
      articles: [
        { title: "A story", sourceUrl: "https://example.com/a", relevanceScore: 8 },
      ],
      projects: [],
    });

    expect(email.editionLabel).toBe("Week 32");
    expect(email.subject).toBe("AI Radar Weekly - Week 32, 2026");
  });
});

/**
 * The masthead prints `editionLabel · dateLabel`. dateLabel was `String(year)` and no caller
 * ever passed one, while the label arrived as "Week 31 · 2026" from editionLabel, so the
 * masthead read "WEEK 31 · 2026 · 2026".
 */
describe("the masthead", () => {
  it("does not print the year twice for an unnamed edition", () => {
    const email = input({
      week: 32,
      year: 2026,
      label: editionEmailLabel({ title: null, week: 32 }),
    });

    expect(email.editionLabel).toBe("Week 32");
    expect(email.dateLabel).toBe("3-9 Aug 2026");

    const masthead = `${email.editionLabel} · ${email.dateLabel}`;
    expect(masthead).toBe("Week 32 · 3-9 Aug 2026");
    expect(masthead.match(/2026/g)?.length).toBe(1);
  });

  it("keeps the subject line an unnamed edition already had", () => {
    const email = input({
      week: 32,
      year: 2026,
      label: editionEmailLabel({ title: null, week: 32 }),
    });

    expect(email.subject).toBe("AI Radar Weekly - Week 32, 2026");
  });

  it("still recognises the old label shape as unnamed", () => {
    // A caller not yet migrated passes editionLabel's shape. Without accepting both, its
    // subject would silently become "AI Radar - Week 32 · 2026".
    const email = input({ week: 32, year: 2026, label: "Week 32 · 2026" });

    expect(email.subject).toBe("AI Radar Weekly - Week 32, 2026");
  });

  it("gives a named edition its name and the range", () => {
    const email = input({ week: 32, year: 2026, label: "AI Act special" });

    expect(email.editionLabel).toBe("AI Act special");
    expect(email.dateLabel).toBe("3-9 Aug 2026");
    expect(email.subject).toBe("AI Radar - AI Act special");
  });

  it("puts the range in the text part too, where the year was also doubled", () => {
    const text = renderEditionText(
      input({ week: 32, year: 2026, label: editionEmailLabel({ title: null, week: 32 }) })
    );

    expect(text).toContain("Week 32 · 3-9 Aug 2026");
  });

  it("lets a caller override the date label", () => {
    const email = input({ week: 32, year: 2026, dateLabel: "the week of the summit" });
    expect(email.dateLabel).toBe("the week of the summit");
  });
});
