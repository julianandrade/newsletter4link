import { describe, expect, it } from "vitest";
import {
  MERGE_TAG_PATTERN,
  RADAR_MERGE_TAGS,
  editionMergeValues,
  isPerRecipientTag,
  renderMergeTags,
  unlayerMergeTagOptions,
} from "@/lib/email/merge-tags";
import type { EditionEmail } from "@/lib/email/edition-template";
import {
  generateMergeTagSamples,
  replaceContentMergeTags,
} from "@/lib/email/content-renderer";
import { renderTemplate } from "@/lib/email/template-renderer";

process.env.UNSUBSCRIBE_SECRET ??= "test-secret-for-unit-tests";

describe("the merge-tag table", () => {
  it("names every tag exactly once", () => {
    const names = RADAR_MERGE_TAGS.map((tag) => tag.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("marks the three signed URLs as per recipient and nothing else", () => {
    const perRecipient = RADAR_MERGE_TAGS.filter((tag) => tag.perRecipient).map((t) => t.name);
    expect(perRecipient.sort()).toEqual(["archive_url", "portal_url", "unsubscribe_url"]);
  });

  it("covers the vocabulary both renderers accepted before the table existed", () => {
    // content-renderer accepted five of these and template-renderer accepted seven, which is
    // how {{articleCount}} came to work in a real send and render literally in the preview.
    const names = RADAR_MERGE_TAGS.map((tag) => tag.name);
    for (const legacy of [
      "articles",
      "projects",
      "week",
      "year",
      "articleCount",
      "projectCount",
      "unsubscribe_url",
    ]) {
      expect(names).toContain(legacy);
    }
  });

  it("gives every tag a human label for the Unlayer palette", () => {
    for (const tag of RADAR_MERGE_TAGS) {
      expect(tag.label.length).toBeGreaterThan(0);
    }
  });
});

describe("renderMergeTags", () => {
  it("substitutes a known tag", () => {
    expect(renderMergeTags("<p>{{week}}</p>", { week: "32" })).toBe("<p>32</p>");
  });

  it("leaves an unknown tag literal", () => {
    expect(renderMergeTags("{{nope}}", { week: "32" })).toBe("{{nope}}");
  });

  it("leaves a known tag literal when no value is supplied", () => {
    // A visible {{tag}} is a bug someone can see. A silent empty string is not.
    expect(renderMergeTags("{{week}}", {})).toBe("{{week}}");
  });

  it("does not substitute a second time inside rendered content", () => {
    const html = renderMergeTags("{{articles}}", {
      articles: "a story mentioning {{projects}} verbatim",
      projects: "SHOULD NOT APPEAR",
    });
    expect(html).toBe("a story mentioning {{projects}} verbatim");
  });

  it("keeps the per-recipient tags standing when asked", () => {
    const html = renderMergeTags(
      "{{week}} {{unsubscribe_url}} {{archive_url}} {{portal_url}}",
      {
        week: "32",
        unsubscribe_url: "https://example.com/u",
        archive_url: "https://example.com/a",
        portal_url: "https://example.com/p",
      },
      { keepPerRecipient: true }
    );
    expect(html).toBe("32 {{unsubscribe_url}} {{archive_url}} {{portal_url}}");
  });

  it("substitutes the per-recipient tags by default", () => {
    expect(
      renderMergeTags("{{unsubscribe_url}}", { unsubscribe_url: "https://example.com/u" })
    ).toBe("https://example.com/u");
  });

  it("does not carry lastIndex between calls", () => {
    // A module-level global RegExp would make the second call start mid-string and miss.
    expect(MERGE_TAG_PATTERN.global).toBe(true);
    expect(renderMergeTags("{{week}}", { week: "1" })).toBe("1");
    expect(renderMergeTags("{{week}}", { week: "2" })).toBe("2");
  });

  it("substitutes every occurrence of the same tag", () => {
    expect(renderMergeTags("{{week}} and {{week}}", { week: "32" })).toBe("32 and 32");
  });
});

describe("isPerRecipientTag", () => {
  it("knows which tags are bound to a subscriber", () => {
    expect(isPerRecipientTag("unsubscribe_url")).toBe(true);
    expect(isPerRecipientTag("archive_url")).toBe(true);
    expect(isPerRecipientTag("portal_url")).toBe(true);
    expect(isPerRecipientTag("week")).toBe(false);
    expect(isPerRecipientTag("nope")).toBe(false);
  });
});

describe("unlayerMergeTagOptions", () => {
  it("produces one entry per tag, in the shape Unlayer wants", () => {
    const options = unlayerMergeTagOptions({ week: "32" });
    expect(Object.keys(options).length).toBe(RADAR_MERGE_TAGS.length);
    expect(options.week).toEqual({ name: "Week Number", value: "{{week}}", sample: "32" });
  });

  it("falls back to the literal tag when no sample is given", () => {
    expect(unlayerMergeTagOptions({}).week.sample).toBe("{{week}}");
  });
});

/**
 * The block tags have to render what the code renderer renders, or a template built in Unlayer
 * looks like a different product. Both renderers derive them here, from one place.
 */
const edition: EditionEmail = {
  editionLabel: "AI Act special",
  dateLabel: "3-9 Aug 2026",
  previewText: "x",
  subject: "AI Radar - AI Act special",
  bullets: [{ text: "A headline", url: "https://example.com/a" }],
  bulletsNote: "A quieter week.",
  topStory: {
    title: "A lead story",
    summary: "What happened.",
    url: "https://example.com/a",
    source: "Reuters",
    coverage: 4,
  },
  sections: [
    {
      name: "Models",
      anchor: "topic-models",
      items: [{ title: "One", summary: "First.", url: "https://example.com/1" }],
    },
  ],
  trends: [{ name: "Agents", delta: 40, note: "Rising." }],
  internal: { title: "Internal thing", body: "Body.", url: "https://example.com/p" },
  portalUrl: "https://example.com/editions",
  archiveUrl: "https://example.com/editions/ed_1",
  unsubscribeUrl: "https://example.com/unsubscribe",
  logoOnLight: "https://example.com/a.png",
  logoOnDark: "https://example.com/b.png",
  footerLogoOnLight: "https://example.com/c.png",
  footerLogoOnDark: "https://example.com/d.png",
  companyLine: "Linkroad Group, Lisboa",
};

/**
 * The whole reason the table exists. These assertions fail if anyone adds a tag to one
 * renderer and forgets the other, which is the state the code was already in.
 */
describe("the two renderers cannot diverge", () => {
  const html = RADAR_MERGE_TAGS.map((tag) => `[${tag.name}:{{${tag.name}}}]`).join("\n");

  const articles = [
    {
      id: "a1",
      title: "A story",
      summary: "A summary.",
      sourceUrl: "https://example.com/a",
      category: ["Models"],
    },
  ];

  const projects = [
    {
      id: "p1",
      name: "A project",
      description: "A description.",
      team: "AI practice",
      impact: "Did a thing.",
    },
  ];

  it("the browser renderer resolves every tag in the table", () => {
    const out = replaceContentMergeTags(html, { articles, projects, week: 32, year: 2026 });

    for (const tag of RADAR_MERGE_TAGS) {
      expect(out, `${tag.name} was left unresolved by content-renderer`).not.toContain(
        `{{${tag.name}}}`
      );
    }
  });

  it("the server renderer resolves every tag in the table", () => {
    const out = renderTemplate(html, { articles, projects, week: 32, year: 2026 });

    for (const tag of RADAR_MERGE_TAGS) {
      expect(out, `${tag.name} was left unresolved by template-renderer`).not.toContain(
        `{{${tag.name}}}`
      );
    }
  });

  it("both leave the per-recipient tags standing, and only those, when asked", () => {
    const options = { keepPerRecipient: true };
    const browser = replaceContentMergeTags(
      html,
      { articles, projects, week: 32, year: 2026 },
      options
    );
    const server = renderTemplate(html, { articles, projects, week: 32, year: 2026 }, options);

    for (const tag of RADAR_MERGE_TAGS) {
      const placeholder = `{{${tag.name}}}`;
      if (tag.perRecipient) {
        expect(browser, `${tag.name} should survive in the browser`).toContain(placeholder);
        expect(server, `${tag.name} should survive on the server`).toContain(placeholder);
      } else {
        expect(browser, `${tag.name} should resolve in the browser`).not.toContain(placeholder);
        expect(server, `${tag.name} should resolve on the server`).not.toContain(placeholder);
      }
    }
  });

  it("the editor palette has a sample for every tag in the table", () => {
    // A tag in the palette with no sample previews as its own literal {{name}} on the canvas.
    const samples = generateMergeTagSamples(articles, projects, 32, 2026);

    for (const tag of RADAR_MERGE_TAGS) {
      expect(samples[tag.name], `${tag.name} has no editor sample`).toBeDefined();
      expect(String(samples[tag.name]).length).toBeGreaterThan(0);
    }
  });
});

describe("editionMergeValues", () => {
  it("names the edition and its date range", () => {
    const values = editionMergeValues(edition);
    expect(values.edition_label).toBe("AI Act special");
    expect(values.date_range).toBe("3-9 Aug 2026");
  });

  it("escapes the edition name, which reaches the tag from an editable field", () => {
    const values = editionMergeValues({ ...edition, editionLabel: 'Q3 "special" <b>' });
    expect(values.edition_label).toBe("Q3 &quot;special&quot; &lt;b&gt;");
  });

  it("renders the blocks as markup", () => {
    const values = editionMergeValues(edition);
    expect(values.tldr).toContain("This week in 30 seconds");
    expect(values.top_story).toContain("A lead story");
    expect(values.sections).toContain("Models");
    expect(values.trend_radar).toContain("Trend radar");
    expect(values.internal).toContain("Internal thing");
  });

  it("renders an absent block as the empty string, so its optional row can be dropped", () => {
    const values = editionMergeValues({
      ...edition,
      bullets: [],
      topStory: undefined,
      trends: [],
      internal: undefined,
      sections: [],
    });

    expect(values.tldr).toBe("");
    expect(values.top_story).toBe("");
    expect(values.trend_radar).toBe("");
    expect(values.internal).toBe("");
    expect(values.sections).toBe("");
  });
});
