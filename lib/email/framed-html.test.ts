import { describe, expect, it } from "vitest";

import { framedEmailHtml } from "./framed-html";
import { renderEditionEmail } from "./edition-template";

describe("framedEmailHtml", () => {
  it("gives a story link somewhere to go other than the frame it is read in", () => {
    const html = framedEmailHtml(
      `<!DOCTYPE html><html><head><title>t</title></head><body><a href="https://techcrunch.com/">Story</a></body></html>`
    );

    expect(html).toContain('<base target="_blank">');
    // Before the title, and before anything else in the head: the first base element carrying a
    // target is the one the document obeys.
    expect(html.indexOf("<base")).toBeLessThan(html.indexOf("<title>"));
  });

  it("leaves an existing base URL alone", () => {
    const html = framedEmailHtml(
      `<html><head><base href="https://example.com/"></head><body></body></html>`
    );

    expect(html).toContain('<base href="https://example.com/">');
    expect(html).toContain('<base target="_blank">');
  });

  it("runs twice without adding a second base", () => {
    const once = framedEmailHtml(`<html><head></head><body></body></html>`);

    expect(framedEmailHtml(once)).toBe(once);
  });

  it("leaves a fragment with no head alone", () => {
    const fragment = `<td><a href="https://techcrunch.com/">Story</a></td>`;

    expect(framedEmailHtml(fragment)).toBe(fragment);
  });

  it("applies to the edition the code renderer produces", () => {
    const logo = "https://newsletter4link.vercel.app/images/logo.png";
    const email = renderEditionEmail({
      subject: "AI Radar Weekly",
      previewText: "This week",
      editionLabel: "Week 33 · 2026",
      dateLabel: "11 August 2026",
      topStory: {
        title: "A story",
        summary: "A summary",
        url: "https://techcrunch.com/one",
      },
      bullets: [],
      sections: [],
      trends: [],
      portalUrl: "https://newsletter4link.vercel.app/editions?t=x",
      archiveUrl: "https://newsletter4link.vercel.app/editions/e?t=x",
      unsubscribeUrl: "https://newsletter4link.vercel.app/unsubscribe?t=x",
      logoOnLight: logo,
      logoOnDark: logo,
      footerLogoOnLight: logo,
      footerLogoOnDark: logo,
      companyLine: "Link Consulting",
    });

    expect(email).toContain("https://techcrunch.com/one");
    expect(framedEmailHtml(email)).toContain('<base target="_blank">');
  });
});
