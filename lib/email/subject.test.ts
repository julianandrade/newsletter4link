import { describe, it, expect } from "vitest";
import { buildNewsletterSubject, buildTestSubject } from "./subject";

describe("buildNewsletterSubject", () => {
  it("leads with the top article title", () => {
    const subject = buildNewsletterSubject({
      week: 24,
      year: 2026,
      articles: [{ title: "OpenAI ships GPT-6" }, { title: "Other" }],
    });
    expect(subject).toBe("AI Radar: OpenAI ships GPT-6 & more");
  });

  it("omits '& more' for a single article", () => {
    const subject = buildNewsletterSubject({
      week: 24,
      year: 2026,
      articles: [{ title: "Solo story" }],
    });
    expect(subject).toBe("AI Radar: Solo story");
  });

  it("falls back to the generic subject without articles", () => {
    expect(
      buildNewsletterSubject({ week: 24, year: 2026, articles: [] })
    ).toBe("Link AI Newsletter — Week 24, 2026");
    expect(
      buildNewsletterSubject({ week: 3, year: 2027, articles: [{ title: "  " }] })
    ).toBe("Link AI Newsletter — Week 3, 2027");
  });

  it("truncates long titles with an ellipsis and stays under 78 chars", () => {
    const subject = buildNewsletterSubject({
      week: 1,
      year: 2026,
      articles: [{ title: "A".repeat(200) }, { title: "B" }],
    });
    expect(subject.length).toBeLessThanOrEqual(78);
    expect(subject).toContain("…");
    expect(subject.endsWith("& more")).toBe(true);
  });
});

describe("buildTestSubject", () => {
  it("prefixes with [TEST]", () => {
    expect(
      buildTestSubject({ week: 24, year: 2026, articles: [{ title: "X" }] })
    ).toBe("[TEST] AI Radar: X");
  });
});
