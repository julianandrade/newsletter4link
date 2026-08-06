import { describe, expect, it } from "vitest";
import {
  renderEditionEmail,
  renderEditionText,
  type EditionEmail,
} from "@/lib/email/edition-template";

/**
 * A byte-level pin on the rendered edition.
 *
 * The fragment renderers move out of edition-template.ts into edition-blocks.ts so the code
 * renderer and the merge tags that feed the Unlayer variants emit the same markup. That move
 * is meant to be pure, and this is what proves it: a snapshot diff means the move changed
 * something, and the fix belongs in the move rather than in the snapshot.
 *
 * The fixture exercises every branch the template has: a top story with an image, coverage
 * and a source, two sections of differing length, a trend that rose and one with no baseline,
 * an internal block, and the thin-week caption.
 */
const fixture: EditionEmail = {
  editionLabel: "Week 32",
  dateLabel: "3-9 Aug 2026",
  previewText: "A quiet week with one loud release.",
  subject: "AI Radar Weekly - Week 32, 2026",
  bullets: [
    { text: "Anthropic ships an agent runtime", url: "https://anthropic.com/a" },
    { text: "EU AI Act timeline slips", url: "https://reuters.com/b" },
  ],
  bulletsNote: "A quieter week: we held back thin items rather than pad the brief.",
  topStory: {
    title: "Anthropic ships an agent runtime",
    summary: "Durable sessions move into the model layer.",
    url: "https://anthropic.com/a",
    source: "Anthropic",
    coverage: 7,
  },
  topStoryImage: "https://example.com/lead.png",
  sections: [
    {
      name: "Models",
      anchor: "topic-models",
      items: [
        {
          title: "One",
          summary: "First.",
          url: "https://arxiv.org/1",
          source: "arXiv",
          coverage: 3,
        },
        { title: "Two", summary: "Second.", url: "https://arxiv.org/2" },
      ],
    },
    {
      name: "Regulation",
      anchor: "topic-regulation",
      items: [
        {
          title: "Three",
          summary: "Third.",
          url: "https://reuters.com/3",
          source: "Reuters",
        },
      ],
    },
  ],
  trends: [
    { name: "Agent orchestration", delta: 62, note: "24 mentions across 9 sources." },
    { name: "Inference cost", delta: null, note: "New this fortnight." },
  ],
  internal: {
    title: "QE offering: the suite runs remotely",
    body: "Two infrastructures, one variable.",
    url: "https://example.com/projects",
  },
  portalUrl: "https://example.com/editions",
  unsubscribeUrl: "https://example.com/unsubscribe",
  logoOnLight: "https://example.com/h-light.png",
  logoOnDark: "https://example.com/h-dark.png",
  footerLogoOnLight: "https://example.com/v-light.png",
  footerLogoOnDark: "https://example.com/v-dark.png",
  sourceCount: 7,
  companyLine: "Linkroad Group, Av. Duque de Avila 23, 1000-138 Lisboa, Portugal",
};

describe("the edition email is byte stable across the block extraction", () => {
  it("renders the same HTML", () => {
    expect(renderEditionEmail(fixture)).toMatchSnapshot();
  });

  it("renders the same text part", () => {
    expect(renderEditionText(fixture)).toMatchSnapshot();
  });
});

/**
 * A second fixture, empty of everything optional, because the extraction has to preserve the
 * absences too: a section with no items, no trends and no internal block must still leave no
 * trace, which is the property the dividers-belong-to-the-item design depends on.
 */
const bare: EditionEmail = {
  editionLabel: "Week 33",
  dateLabel: "10-16 Aug 2026",
  previewText: "Nothing moved.",
  subject: "AI Radar Weekly - Week 33, 2026",
  bullets: [],
  sections: [{ name: "Empty", anchor: "topic-empty", items: [] }],
  trends: [],
  portalUrl: "https://example.com/editions",
  unsubscribeUrl: "https://example.com/unsubscribe",
  logoOnLight: "https://example.com/h-light.png",
  logoOnDark: "https://example.com/h-dark.png",
  footerLogoOnLight: "https://example.com/v-light.png",
  footerLogoOnDark: "https://example.com/v-dark.png",
  companyLine: "Linkroad Group, Av. Duque de Avila 23, 1000-138 Lisboa, Portugal",
};

describe("an edition with nothing optional in it", () => {
  it("renders the same HTML", () => {
    expect(renderEditionEmail(bare)).toMatchSnapshot();
  });

  it("leaves no trace of the empty section, the radar or the internal block", () => {
    const html = renderEditionEmail(bare);
    expect(html).not.toContain("topic-empty");
    expect(html).not.toContain("Trend radar");
    expect(html).not.toContain("Internal");
  });
});
