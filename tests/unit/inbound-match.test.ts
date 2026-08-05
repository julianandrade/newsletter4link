import { describe, expect, it } from "vitest";
import { matchSources, type MatchableSource } from "@/lib/inbound/match";
import { capHtml, fetchEmailContent, sanitizeEmailHtml } from "@/lib/inbound/receive";

const source = (over: Partial<MatchableSource> = {}): MatchableSource => ({
  id: "s1",
  organizationId: "org-1",
  senderAddress: "dan@tldrnewsletter.com",
  inboundTag: "tldr",
  parseMode: "DIGEST",
  active: true,
  ...over,
});

describe("matchSources", () => {
  it("matches on the sender address", () => {
    const result = matchSources(
      { from: "dan@tldrnewsletter.com", subaddressTag: null },
      [source()]
    );

    expect(result.matchedOn).toBe("sender");
    expect(result.sources).toHaveLength(1);
  });

  it("matches the address inside a display name", () => {
    // A newsletter changes its display name whenever its marketing team feels like it.
    const result = matchSources(
      { from: "TLDR AI <dan@tldrnewsletter.com>", subaddressTag: null },
      [source()]
    );

    expect(result.matchedOn).toBe("sender");
  });

  it("ignores casing on the address", () => {
    const result = matchSources(
      { from: "Dan@TLDRNewsletter.COM", subaddressTag: null },
      [source()]
    );

    expect(result.matchedOn).toBe("sender");
  });

  it("falls back to the tag when the sender changed", () => {
    // Which is what happens when a newsletter moves platform.
    const result = matchSources(
      { from: "noreply@newplatform.com", subaddressTag: "tldr" },
      [source()]
    );

    expect(result.matchedOn).toBe("tag");
    expect(result.sources).toHaveLength(1);
  });

  it("prefers the sender over the tag, and does not mix them", () => {
    // A stale tag on an unrelated source must not pull in an email that already has a
    // rightful owner.
    const byTag = source({ id: "stale", senderAddress: "old@x.com", inboundTag: "tldr" });
    const bySender = source({ id: "right", inboundTag: null });

    const result = matchSources(
      { from: "dan@tldrnewsletter.com", subaddressTag: "tldr" },
      [byTag, bySender]
    );

    expect(result.matchedOn).toBe("sender");
    expect(result.sources.map((s) => s.id)).toEqual(["right"]);
  });

  it("returns every organization that claims the email", () => {
    // The plan assumes one match. Two organizations can subscribe to the same newsletter
    // through the same shared address, and each is entitled to the articles: they curate
    // independently and pay for their own calls. Picking one would starve the other.
    const result = matchSources({ from: "dan@tldrnewsletter.com", subaddressTag: null }, [
      source({ id: "a", organizationId: "org-1" }),
      source({ id: "b", organizationId: "org-2" }),
    ]);

    expect(result.sources.map((s) => s.organizationId)).toEqual(["org-1", "org-2"]);
  });

  it("ignores an inactive source", () => {
    const result = matchSources({ from: "dan@tldrnewsletter.com", subaddressTag: "tldr" }, [
      source({ active: false }),
    ]);

    expect(result.sources).toEqual([]);
    expect(result.matchedOn).toBeNull();
  });

  it("ignores a source with no parse mode, which is not configured to read email", () => {
    const result = matchSources({ from: "dan@tldrnewsletter.com", subaddressTag: null }, [
      source({ parseMode: null }),
    ]);

    expect(result.sources).toEqual([]);
  });

  it("does not match an unknown sender with no tag", () => {
    const result = matchSources({ from: "stranger@somewhere.com", subaddressTag: null }, [
      source(),
    ]);

    expect(result).toEqual({ sources: [], matchedOn: null });
  });

  it("does not match a tag no source claims", () => {
    const result = matchSources(
      { from: "stranger@somewhere.com", subaddressTag: "unknown" },
      [source()]
    );

    expect(result.sources).toEqual([]);
  });
});

describe("sanitizeEmailHtml", () => {
  it("removes scripts and styles", () => {
    const html = sanitizeEmailHtml(
      `<div><script>alert(1)</script><style>p{}</style><p>Text</p></div>`
    );

    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("<style");
    expect(html).toContain("Text");
  });

  it("removes event handlers, because this markup came from a stranger", () => {
    const html = sanitizeEmailHtml(`<a href="https://x.com" onclick="steal()">link</a>`);

    expect(html).not.toContain("onclick");
    expect(html).toContain("https://x.com");
  });

  it("removes a javascript: href but keeps the element", () => {
    const html = sanitizeEmailHtml(`<a href="javascript:alert(1)">link</a>`);

    expect(html).not.toContain("javascript:");
    expect(html).toContain("link");
  });

  it("removes tracking pixels", () => {
    // A stored pixel fires again every time the email is looked at, reporting a read to the
    // sender that nobody performed.
    const html = sanitizeEmailHtml(
      `<img src="https://track.x.com/o.gif" width="1" height="1"><img src="https://x.com/real.jpg" width="600">`
    );

    expect(html).not.toContain("o.gif");
    expect(html).toContain("real.jpg");
  });

  it("removes iframes and forms", () => {
    const html = sanitizeEmailHtml(
      `<iframe src="https://x.com"></iframe><form action="https://evil.com"><input></form><p>ok</p>`
    );

    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<form");
    expect(html).toContain("ok");
  });
});

describe("capHtml", () => {
  it("leaves a small document alone", () => {
    expect(capHtml("<p>small</p>", 1000)).toBe("<p>small</p>");
  });

  it("caps on bytes, not characters", () => {
    // A multi-byte character must not let a document exceed the cap.
    const wide = "á".repeat(1000); // two bytes each
    const capped = capHtml(wide, 100);

    expect(Buffer.byteLength(capped, "utf8")).toBeLessThanOrEqual(100);
  });
});

describe("fetchEmailContent", () => {
  it("returns the sanitized body", async () => {
    const outcome = await fetchEmailContent("e1", async () => ({
      status: 200,
      body: { html: `<p>Hi</p><script>x()</script>`, text: "Hi" },
    }));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.content.html).not.toContain("x()");
    expect(outcome.content.text).toBe("Hi");
  });

  it("treats a 404 as final, because Resend will not have it later", async () => {
    const outcome = await fetchEmailContent("e1", async () => ({ status: 404, body: null }));

    expect(outcome).toEqual({
      ok: false,
      reason: "Resend does not have this email",
      retryable: false,
    });
  });

  it("treats an outage as retryable, because Resend keeps its own copy", async () => {
    const outcome = await fetchEmailContent("e1", async () => ({ status: 503, body: null }));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.retryable).toBe(true);
  });

  it("treats a thrown request as retryable", async () => {
    const outcome = await fetchEmailContent("e1", async () => {
      throw new Error("socket hang up");
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.retryable).toBe(true);
    expect(outcome.reason).toContain("socket hang up");
  });

  it("does not retry an email that genuinely has no body", async () => {
    const outcome = await fetchEmailContent("e1", async () => ({
      status: 200,
      body: { html: null, text: null },
    }));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // Asking again produces the same nothing.
    expect(outcome.retryable).toBe(false);
  });

  it("accepts text with no html", async () => {
    const outcome = await fetchEmailContent("e1", async () => ({
      status: 200,
      body: { text: "plain only" },
    }));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.content.html).toBeNull();
    expect(outcome.content.text).toBe("plain only");
  });
});
