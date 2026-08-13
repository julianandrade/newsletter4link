import { describe, expect, it } from "vitest";
import {
  sourceAttention,
  sourcesHeading,
  splitSources,
  type SourceRow,
} from "@/lib/sources/summary";

/**
 * The h1 used to count feeds only, while the fold below it was email. Folding the two
 * counts together is what `app/dashboard/sources/page.tsx` warned against, for a reason
 * this module has to keep: an email source never reports a fetch error, so "all healthy"
 * over both kinds vouches for something nothing measured. "Nothing flagged" claims only
 * that no rule fired, which is honest about both.
 */

const NOW = new Date("2026-08-13T12:00:00.000Z");

function feed(over: Partial<SourceRow> = {}): SourceRow {
  return {
    id: "f1",
    name: "arXiv cs.AI",
    category: "Research",
    active: true,
    url: "http://export.arxiv.org/rss/cs.AI",
    lastFetchedAt: "2026-08-13T10:00:00.000Z",
    lastError: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function emailSource(over: Partial<SourceRow> = {}): SourceRow {
  return {
    id: "e1",
    name: "TLDR AI",
    category: "AI",
    active: true,
    type: "EMAIL",
    senderAddress: "news@tldr.tech",
    expectedCadenceDays: 1,
    lastReceivedAt: "2026-08-13T08:00:00.000Z",
    createdAt: "2026-06-01T00:00:00.000Z",
    lastFetchedAt: null,
    lastError: null,
    ...over,
  };
}

describe("splitSources", () => {
  it("splits on type EMAIL and treats everything else as a feed", () => {
    const result = splitSources([
      feed({ id: "a" }),
      emailSource({ id: "b" }),
      feed({ id: "c", type: "RSS" }),
    ]);

    expect(result.feeds.map((s) => s.id)).toEqual(["a", "c"]);
    expect(result.emailSources.map((s) => s.id)).toEqual(["b"]);
  });
});

describe("sourcesHeading", () => {
  it("counts both kinds in one total", () => {
    const result = sourcesHeading({
      feeds: [feed({ id: "a" }), feed({ id: "b" })],
      emailSources: [emailSource()],
      attentionCount: 0,
      isLoading: false,
    });

    expect(result.title).toBe("3 sources, nothing flagged");
  });

  it("says nothing flagged, never all healthy", () => {
    const result = sourcesHeading({
      feeds: [feed()],
      emailSources: [],
      attentionCount: 0,
      isLoading: false,
    });

    expect(result.title).not.toMatch(/healthy/i);
    expect(result.title).toContain("nothing flagged");
  });

  it("agrees with itself on singular and plural", () => {
    expect(
      sourcesHeading({
        feeds: [feed()],
        emailSources: [],
        attentionCount: 1,
        isLoading: false,
      }).title
    ).toBe("1 source, 1 needs attention");

    expect(
      sourcesHeading({
        feeds: [feed({ id: "a" }), feed({ id: "b" })],
        emailSources: [],
        attentionCount: 2,
        isLoading: false,
      }).title
    ).toBe("2 sources, 2 need attention");
  });

  it("reads Sources while loading, because a count of zero is a lie mid-flight", () => {
    const result = sourcesHeading({
      feeds: [],
      emailSources: [],
      attentionCount: 0,
      isLoading: true,
    });

    expect(result.title).toBe("Sources");
    expect(result.subtitle).toEqual([]);
  });

  it("puts the figures in parts, so the page can render them as Num", () => {
    const result = sourcesHeading({
      feeds: [feed()],
      emailSources: [emailSource(), emailSource({ id: "e2" })],
      attentionCount: 0,
      isLoading: false,
      lastCollectedLabel: "4h ago",
    });

    expect(result.subtitle).toEqual([
      { num: "1", text: "feed" },
      { num: "2", text: "email" },
      { text: "last collected 4h ago" },
    ]);
  });
});

describe("sourceAttention", () => {
  it("reports failing feeds as an error line pointing at the feeds tab", () => {
    const result = sourceAttention({
      feeds: [
        feed({ id: "a", name: "The Information", lastError: "401, credentials expired" }),
        feed({ id: "b", name: "EU AI Newsroom", lastError: "404, feed moved" }),
        feed({ id: "c" }),
      ],
      emailSources: [],
      now: NOW,
    });

    expect(result.count).toBe(2);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].tone).toBe("err");
    expect(result.lines[0].tab).toBe("feeds");
    expect(result.lines[0].headline).toBe("2 feeds failed on the last run.");
    expect(result.lines[0].detail).toContain("The Information: 401, credentials expired");
    expect(result.lines[0].detail).toContain("EU AI Newsroom: 404, feed moved");
  });

  it("names two failures then counts the rest", () => {
    const result = sourceAttention({
      feeds: [
        feed({ id: "a", name: "One", lastError: "401" }),
        feed({ id: "b", name: "Two", lastError: "402" }),
        feed({ id: "c", name: "Three", lastError: "403" }),
        feed({ id: "d", name: "Four", lastError: "404" }),
      ],
      emailSources: [],
      now: NOW,
    });

    expect(result.lines[0].detail).toContain("and 2 more");
    expect(result.lines[0].detail).not.toContain("Three");
  });

  it("ignores a paused feed's stale error, because nothing is fetching it", () => {
    const result = sourceAttention({
      feeds: [feed({ active: false, lastError: "404, feed moved" })],
      emailSources: [],
      now: NOW,
    });

    expect(result.count).toBe(0);
    expect(result.lines).toEqual([]);
  });

  it("reports a silent email source as a warning line pointing at the email tab", () => {
    const result = sourceAttention({
      feeds: [],
      emailSources: [
        emailSource({
          name: "The Pragmatic Engineer",
          expectedCadenceDays: 7,
          lastReceivedAt: "2026-07-10T08:00:00.000Z",
        }),
      ],
      now: NOW,
    });

    expect(result.count).toBe(1);
    expect(result.lines[0].tone).toBe("warn");
    expect(result.lines[0].tab).toBe("email");
    expect(result.lines[0].headline).toBe("1 email source has gone quiet.");
    expect(result.lines[0].detail).toContain("The Pragmatic Engineer");
  });

  it("never flags a source with no cadence, and never calls it healthy either", () => {
    const result = sourceAttention({
      feeds: [],
      emailSources: [
        emailSource({
          name: "Unscheduled",
          expectedCadenceDays: null,
          lastReceivedAt: "2026-01-01T08:00:00.000Z",
        }),
      ],
      now: NOW,
    });

    expect(result.count).toBe(0);

    const heading = sourcesHeading({
      feeds: [],
      emailSources: [emailSource({ expectedCadenceDays: null })],
      attentionCount: result.count,
      isLoading: false,
    });
    expect(heading.title).toBe("1 source, nothing flagged");
    expect(heading.title).not.toMatch(/healthy/i);
  });

  it("puts feeds before email, because an error outranks a warning", () => {
    const result = sourceAttention({
      feeds: [feed({ lastError: "401" })],
      emailSources: [
        emailSource({ lastReceivedAt: null, createdAt: "2026-01-01T00:00:00.000Z" }),
      ],
      now: NOW,
    });

    expect(result.lines.map((line) => line.tone)).toEqual(["err", "warn"]);
    expect(result.count).toBe(2);
  });
});
