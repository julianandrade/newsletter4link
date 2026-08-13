import { describe, expect, it } from "vitest";
import {
  SENT_SNAPSHOT_VERSION,
  buildSentSnapshot,
  frozenAsideFor,
  frozenCustomBlocksFor,
  frozenHtmlFor,
  frozenTemplateIdFor,
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
        linkTake: null,
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
      linkTake: null,
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

describe("what a hand-edited send records", () => {
  const roundTrip = (over: Record<string, unknown>) =>
    JSON.parse(JSON.stringify(buildSentSnapshot({ ...snapshotInput(), ...over })));

  it("keeps the finished bytes when the send was hand-edited", () => {
    const html = "<html><body>hand arranged {{unsubscribe_url}}</body></html>";

    expect(frozenHtmlFor(roundTrip({ frozenHtml: html }))).toBe(html);
  });

  it("leaves the three subscriber-bound tags standing in what it stored", () => {
    // Storing them resolved would hand every later reader the first recipient's signed
    // links, which is the defect the send loop already exists to avoid.
    const stored = frozenHtmlFor(
      roundTrip({
        frozenHtml: "<p>{{unsubscribe_url}} {{archive_url}} {{portal_url}}</p>",
      })
    );

    expect(stored).toContain("{{unsubscribe_url}}");
    expect(stored).toContain("{{archive_url}}");
    expect(stored).toContain("{{portal_url}}");
  });

  it("answers null for a send that was not hand-edited", () => {
    expect(frozenHtmlFor(roundTrip({}))).toBeNull();
    expect(frozenHtmlFor(roundTrip({ frozenHtml: "" }))).toBeNull();
    expect(frozenHtmlFor(roundTrip({ frozenHtml: "   " }))).toBeNull();
  });

  it("answers null for anything that is not a snapshot", () => {
    expect(frozenHtmlFor(null)).toBeNull();
    expect(frozenHtmlFor({ frozenHtml: "<p>not a snapshot</p>" })).toBeNull();
    expect(frozenTemplateIdFor(null)).toBeNull();
    expect(frozenCustomBlocksFor(null)).toBeNull();
  });

  it("records the template the edition was actually sent in", () => {
    expect(frozenTemplateIdFor(roundTrip({ templateId: "tmpl-7" }))).toBe("tmpl-7");
    expect(frozenTemplateIdFor(roundTrip({ templateId: null }))).toBeNull();
  });

  it("records the blocks the editor injected, and null when there were none", () => {
    expect(
      frozenCustomBlocksFor(roundTrip({ customBlocks: [{ id: "b1", html: "<p>x</p>" }] }))
    ).toEqual([{ id: "b1", html: "<p>x</p>" }]);
    expect(frozenCustomBlocksFor(roundTrip({ customBlocks: [] }))).toBeNull();
    expect(frozenCustomBlocksFor(roundTrip({}))).toBeNull();
  });

  it("writes null rather than dropping the keys, so an older snapshot is tellable apart", () => {
    const snapshot = roundTrip({});

    expect("frozenHtml" in snapshot).toBe(true);
    expect("customBlocks" in snapshot).toBe(true);
    expect(snapshot.frozenHtml).toBeNull();
    expect(snapshot.customBlocks).toBeNull();
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

  it("carries a live project's date through, when the caller selected one", () => {
    // The snapshot always keeps projectDate, so the live path has to as well. Without it
    // the SharePoint republish saw a date on a sent edition and none on a draft, purely
    // because of which branch it went down.
    const source = renderSourceFor({
      ...live,
      projects: [
        {
          project: {
            name: "Live project",
            description: "d",
            team: "Delivery",
            impact: null,
            projectDate: new Date("2026-07-20T00:00:00.000Z"),
          },
        },
      ],
    });

    expect(source.projects[0].projectDate).toEqual(
      new Date("2026-07-20T00:00:00.000Z")
    );
  });

  it("omits the date entirely when the caller did not select one", () => {
    // Absent rather than null: SourceProject's field is optional, and an explicit null
    // would make every caller that formats a date handle a value it never sees today.
    expect("projectDate" in renderSourceFor(live).projects[0]).toBe(false);
  });
});

/**
 * The closing block.
 *
 * Frozen rather than followed through Edition.asideId, because the row can be edited or
 * retired after the send and the archive has to show what was actually delivered.
 */
describe("what a send records about its closing block", () => {
  it("keeps the aside it sent", () => {
    const snapshot = buildSentSnapshot({
      ...snapshotInput(),
      aside: { kind: "JOKE", text: "The diff reviewed itself." },
    });

    expect(frozenAsideFor(snapshot)).toEqual({
      kind: "JOKE",
      text: "The diff reviewed itself.",
    });
  });

  it("records null when the edition picked none", () => {
    expect(frozenAsideFor(buildSentSnapshot(snapshotInput()))).toBeNull();
  });

  it("reads a snapshot written before the aside existed as having none", () => {
    // The version is deliberately not bumped for this field: absence and null mean the
    // same thing to every reader, so an older record needs no handling.
    const older = { ...buildSentSnapshot(snapshotInput()) } as Record<string, unknown>;
    delete older.aside;

    expect(frozenAsideFor(older)).toBeNull();
  });

  it("survives a round trip through the Json column", () => {
    const snapshot = buildSentSnapshot({
      ...snapshotInput(),
      aside: { kind: "NOTE", text: "A note.", imageUrl: "https://example.test/m.png" },
    });

    const roundTripped = JSON.parse(JSON.stringify(snapshot));

    expect(frozenAsideFor(roundTripped)).toEqual({
      kind: "NOTE",
      text: "A note.",
      imageUrl: "https://example.test/m.png",
    });
  });

  it("returns null for anything that is not one of our snapshots", () => {
    expect(frozenAsideFor(null)).toBeNull();
    expect(frozenAsideFor({ nope: true })).toBeNull();
  });
});

/**
 * The stored aside is validated, not cast.
 *
 * It comes out of an untyped Json column and goes straight into an email whose text is
 * also the image's alt text, so a record missing `text` would render an empty block with
 * an empty alt: the one outcome the closing block exists to avoid.
 */
describe("a malformed stored aside", () => {
  const withAside = (aside: unknown) => {
    const snapshot = buildSentSnapshot(snapshotInput()) as unknown as Record<string, unknown>;
    snapshot.aside = aside;
    return snapshot;
  };

  it("is refused when the text is missing, empty or not a string", () => {
    expect(frozenAsideFor(withAside({ kind: "JOKE" }))).toBeNull();
    expect(frozenAsideFor(withAside({ kind: "JOKE", text: "" }))).toBeNull();
    expect(frozenAsideFor(withAside({ kind: "JOKE", text: "   " }))).toBeNull();
    expect(frozenAsideFor(withAside({ kind: "JOKE", text: 42 }))).toBeNull();
  });

  it("is refused when it is not an object at all", () => {
    expect(frozenAsideFor(withAside("a joke"))).toBeNull();
    expect(frozenAsideFor(withAside([]))).toBeNull();
    expect(frozenAsideFor(withAside(null))).toBeNull();
  });

  it("falls back to JOKE for an unknown kind rather than refusing the whole block", () => {
    // The kind only selects styling today. Losing a delivered joke over it would be a
    // worse answer than showing it as a joke.
    expect(frozenAsideFor(withAside({ kind: "MEME", text: "Still funny." }))).toEqual({
      kind: "JOKE",
      text: "Still funny.",
    });
  });

  it("drops an image or attribution that is not a usable string", () => {
    expect(
      frozenAsideFor(withAside({ kind: "JOKE", text: "x", imageUrl: 7, attribution: "" }))
    ).toEqual({ kind: "JOKE", text: "x" });
  });
});
