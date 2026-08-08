import { describe, expect, it } from "vitest";
import { essayUrl } from "@/lib/inbound/essay-url";

/**
 * What an essay links to when the email carried no "read online" URL.
 *
 * The fallback was `source.url`, and for an EMAIL source `url` is the *sender address*:
 * `normalizeEmailSource` puts it there so the existing `@@unique([url, organizationId])`
 * keeps working. So the fallback produced articles whose source URL was
 * `avi@dailydoseofds.com`, and eleven of them reached production.
 *
 * The second failure was worse than the first and invisible. The address is the same for
 * every email from that sender, so the *second* essay with no web version deduplicated
 * against the first and produced nothing. Five Daily Dose emails were marked PROCESSED
 * having created no articles, with no error recorded anywhere, which is exactly the
 * "0 articles" the dashboard could not explain.
 */
describe("essayUrl", () => {
  it("prefers the web version the email gave", () => {
    expect(
      essayUrl("https://dailydoseofds.com/p/agent-self-improvement", "avi@dailydoseofds.com")
    ).toBe("https://dailydoseofds.com/p/agent-self-improvement");
  });

  it("refuses an email address as a stand-in for a link", () => {
    expect(essayUrl(null, "avi@dailydoseofds.com")).toBeNull();
  });

  it("refuses anything that is not http", () => {
    for (const value of ["", "  ", "not a url", "mailto:a@b.com", "ftp://x.com/a"]) {
      expect(essayUrl(null, value)).toBeNull();
    }
  });

  it("accepts a real feed URL, which an RSS source does have", () => {
    expect(essayUrl(null, "https://dailydoseofds.com/feed")).toBe(
      "https://dailydoseofds.com/feed"
    );
  });

  it("returns null when there is nothing at all", () => {
    expect(essayUrl(null, null)).toBeNull();
    expect(essayUrl(null, undefined)).toBeNull();
  });
});
