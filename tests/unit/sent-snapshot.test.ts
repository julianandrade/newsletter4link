import { describe, expect, it } from "vitest";
import {
  SENT_SNAPSHOT_VERSION,
  buildSentSnapshot,
  isSentSnapshot,
  renderSourceFor,
} from "@/lib/editions/sent-snapshot";

/**
 * The snapshot is the only record of what a subscriber received. These tests are its
 * contract: what goes in, what survives a round trip through a Json column, and which
 * source a render picks when both a snapshot and live rows exist.
 */

const snapshotInput = () => ({
  articles: [
    {
      title: "A model ships",
      summary: "Two sentences on why it matters.",
      sourceUrl: "https://example.test/a1",
      category: ["Models"],
      relevanceScore: 8.5,
      content: "<p>Body <img src='https://example.test/i.png'></p>",
    },
  ],
  projects: [
    {
      name: "Radar",
      description: "Internal work",
      team: "Delivery",
      impact: "Faster reviews",
      projectDate: new Date("2026-07-20T00:00:00.000Z"),
    },
  ],
  week: 32,
  year: 2026,
  label: "Week 32",
  subject: "AI Radar Weekly - Week 32, 2026",
  templateId: null,
});

describe("buildSentSnapshot", () => {
  it("stamps the version, so a later shape change can be told apart", () => {
    expect(buildSentSnapshot(snapshotInput()).version).toBe(SENT_SNAPSHOT_VERSION);
  });

  it("keeps every article field the renderer reads", () => {
    const snapshot = buildSentSnapshot(snapshotInput());

    expect(snapshot.articles).toEqual([
      {
        title: "A model ships",
        summary: "Two sentences on why it matters.",
        sourceUrl: "https://example.test/a1",
        category: ["Models"],
        relevanceScore: 8.5,
        content: "<p>Body <img src='https://example.test/i.png'></p>",
      },
    ]);
  });

  it("normalises absent optional fields to null rather than dropping the key", () => {
    // A Json column round trip drops undefined. Dropping the key would make a later
    // reader unable to tell "no summary" from "an older snapshot shape".
    const snapshot = buildSentSnapshot({
      ...snapshotInput(),
      articles: [
        { title: "Bare", sourceUrl: "https://example.test/b" } as never,
      ],
      projects: [{ name: "Bare project", description: "d" } as never],
    });

    expect(snapshot.articles[0]).toEqual({
      title: "Bare",
      summary: null,
      sourceUrl: "https://example.test/b",
      category: [],
      relevanceScore: null,
      content: null,
    });
    expect(snapshot.projects[0]).toEqual({
      name: "Bare project",
      description: "d",
      team: "",
      impact: null,
      projectDate: null,
    });
  });

  it("writes dates as ISO strings, because a Date does not survive a Json column", () => {
    expect(buildSentSnapshot(snapshotInput()).projects[0].projectDate).toBe(
      "2026-07-20T00:00:00.000Z"
    );
  });

  it("survives a JSON round trip unchanged", () => {
    const snapshot = buildSentSnapshot(snapshotInput());

    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});

describe("isSentSnapshot", () => {
  it("accepts what buildSentSnapshot produced, after a round trip", () => {
    const stored = JSON.parse(JSON.stringify(buildSentSnapshot(snapshotInput())));

    expect(isSentSnapshot(stored)).toBe(true);
  });

  it("refuses anything that is not a snapshot", () => {
    // The column is nullable and untyped, and every one of these is a value it can
    // actually hold: null on the forty editions sent before this existed, and the
    // rest are what a hand-written UPDATE could leave behind.
    expect(isSentSnapshot(null)).toBe(false);
    expect(isSentSnapshot(undefined)).toBe(false);
    expect(isSentSnapshot("{}")).toBe(false);
    expect(isSentSnapshot([])).toBe(false);
    expect(isSentSnapshot({})).toBe(false);
    expect(isSentSnapshot({ version: 1, articles: "no", projects: [] })).toBe(false);
    expect(isSentSnapshot({ version: 1, articles: [], projects: [] })).toBe(false);
  });
});

describe("renderSourceFor", () => {
  const live = {
    sentSnapshot: null as unknown,
    title: null as string | null,
    week: 32,
    year: 2026,
    articles: [
      {
        article: {
          title: "Live title",
          summary: "Live summary",
          sourceUrl: "https://example.test/live",
          category: ["Models"],
          relevanceScore: 7,
          content: null,
        },
      },
    ],
    projects: [
      {
        project: {
          name: "Live project",
          description: "d",
          team: "Delivery",
          impact: null,
        },
      },
    ],
  };

  it("uses the live rows when there is no snapshot", () => {
    const source = renderSourceFor(live);

    expect(source.frozen).toBe(false);
    expect(source.articles[0].title).toBe("Live title");
    expect(source.label).toBe("Week 32");
  });

  it("uses the snapshot when there is one, and ignores the live rows entirely", () => {
    const source = renderSourceFor({
      ...live,
      sentSnapshot: JSON.parse(
        JSON.stringify(buildSentSnapshot(snapshotInput()))
      ),
    });

    expect(source.frozen).toBe(true);
    expect(source.articles).toHaveLength(1);
    expect(source.articles[0].title).toBe("A model ships");
    expect(source.label).toBe("Week 32");
  });

  it("still renders a story the snapshot kept after the article row was discarded", () => {
    // The whole point. The join rows are gone and the edition still reads as sent.
    const source = renderSourceFor({
      ...live,
      articles: [],
      projects: [],
      sentSnapshot: JSON.parse(
        JSON.stringify(buildSentSnapshot(snapshotInput()))
      ),
    });

    expect(source.articles[0].title).toBe("A model ships");
    expect(source.projects[0].name).toBe("Radar");
  });

  it("falls back to the live rows when the stored value is not a snapshot", () => {
    // Fail open to something renderable rather than to an empty edition: a corrupted
    // column must not turn an archive link into a blank page.
    const source = renderSourceFor({ ...live, sentSnapshot: { nonsense: true } });

    expect(source.frozen).toBe(false);
    expect(source.articles[0].title).toBe("Live title");
  });

  it("prefers the edition's own title over the derived week label", () => {
    const source = renderSourceFor({ ...live, title: "  The agents issue  " });

    expect(source.label).toBe("The agents issue");
  });
});
