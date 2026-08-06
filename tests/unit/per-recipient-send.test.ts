import { beforeAll, describe, expect, it } from "vitest";
import { personalizeHtml } from "@/lib/email/personalize";

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret-not-a-real-one";
});

/**
 * The test that would have caught the bug.
 *
 * sendNewsletterWithTemplate sent one identical HTML string to every subscriber, and the
 * template was rendered once from a context with no subscriberId, so buildUnsubscribeUrl(undefined)
 * yielded the generic page. On three of the four send paths every recipient received the generic
 * unsubscribe link instead of their own signed one. The HMAC machinery was correct and bypassed.
 */
const template = `
  <a href="{{unsubscribe_url}}">Unsubscribe</a>
  <a href="{{archive_url}}">View in browser</a>
  <a href="{{portal_url}}">Read the full feed</a>
  <p>Week {{week}}</p>
`;

describe("personalizeHtml", () => {
  it("gives two subscribers different links and identical everything else", () => {
    const a = personalizeHtml(template, { subscriberId: "sub_a", editionId: "ed_1" });
    const b = personalizeHtml(template, { subscriberId: "sub_b", editionId: "ed_1" });

    expect(a).not.toBe(b);
    expect(a).toContain("t=");

    // Blank both token parameters, `t` on the archive links and `token` on unsubscribe: what
    // remains must be identical, or something other than the per-recipient links is varying
    // between recipients.
    const blank = (html: string) =>
      html.replace(/([?&])(t|token)=[^"&]+/g, "$1$2=BLANKED");
    expect(blank(a)).toBe(blank(b));
  });

  it("resolves all three per-recipient tags", () => {
    const html = personalizeHtml(template, { subscriberId: "sub_a", editionId: "ed_1" });

    expect(html).not.toContain("{{unsubscribe_url}}");
    expect(html).not.toContain("{{archive_url}}");
    expect(html).not.toContain("{{portal_url}}");
  });

  it("points the archive link at this edition", () => {
    const html = personalizeHtml(template, { subscriberId: "sub_a", editionId: "ed_1" });
    expect(html).toContain("/editions/ed_1?t=");
  });

  it("points the portal link at the index, not at the dashboard", () => {
    // The old CTA went to /dashboard, which middleware guards with a session, a domain
    // allowlist and MFA. For a subscriber who does not administer the app it was a dead end.
    const html = personalizeHtml(template, { subscriberId: "sub_a", editionId: "ed_1" });

    expect(html).toContain("/editions?t=");
    expect(html).not.toContain("/dashboard");
  });

  it("signs the unsubscribe link for this subscriber rather than linking the generic page", () => {
    const html = personalizeHtml(template, { subscriberId: "sub_a", editionId: "ed_1" });
    expect(html).toMatch(/\/unsubscribe\?token=[^"]+/);
  });

  it("leaves a shared tag alone, because it was already resolved upstream", () => {
    const html = personalizeHtml(template, { subscriberId: "sub_a", editionId: "ed_1" });
    expect(html).toContain("Week {{week}}");
  });

  it("falls back to unsigned links for a recipient who is not a subscriber", () => {
    // An ad-hoc send has an address and no subscriber row. Unsigned URLs are correct: the
    // archive page answers 404 for them, and an ad-hoc recipient has no archive.
    const html = personalizeHtml(template, { subscriberId: "", editionId: "ed_1" });

    expect(html).not.toContain("t=");
    expect(html).toContain("/editions/ed_1");
    expect(html).toContain("/unsubscribe");
  });

  it("hardens the html, so an optional row left empty does not survive", () => {
    const html = personalizeHtml(
      `<html><head></head><body><tr class="radar-optional"><td>TREND RADAR</td></tr></body></html>`,
      { subscriberId: "sub_a", editionId: "ed_1" }
    );

    expect(html).not.toContain("radar-optional");
    expect(html).toContain("prefers-color-scheme: dark");
  });

  it("hardens after substituting, so a resolved link cannot be judged empty", () => {
    const html = personalizeHtml(
      `<tr class="radar-optional"><td>VIEW<a href="{{archive_url}}">x</a></td></tr>`,
      { subscriberId: "sub_a", editionId: "ed_1" }
    );

    // The row survives because the resolved URL is content. Hardening first would have seen
    // only "VIEW" plus a placeholder and could have dropped a row holding a real link.
    expect(html).toContain("/editions/ed_1");
  });
});
