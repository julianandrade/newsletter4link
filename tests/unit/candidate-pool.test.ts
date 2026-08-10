import { describe, expect, it } from "vitest";
import {
  CANDIDATE_POOL_LIMIT,
  CANDIDATE_POOL_MAX,
  clampPoolLimit,
  readCandidatePool,
} from "@/lib/editions/proposal";

/**
 * A stand-in for the tenant client, recording the queries it is given so the
 * eligibility rule can be asserted without a database, which is how the rest of
 * `tests/unit` works.
 *
 * The pool reads articles three times and the order is fixed by the code, so the
 * calls are recorded as a list rather than a single slot:
 *
 *   [0] the ranking pass, every matching row, sort columns only
 *   [1] the topic pills, over what is eligible and unfiltered
 *   [2] the page's full rows, by id
 *
 * The first two are issued together inside a `Promise.all`; the third waits on the
 * order the first produces.
 */
function fakeDb(options: {
  threshold?: number | null;
  articles?: unknown[];
  /** What the availability read returns, when it should be wider than the match. */
  availableArticles?: unknown[];
  /** What the second pass returns, when it should differ from the first. */
  pageArticles?: unknown[];
  projects?: unknown[];
}) {
  const articleCalls: any[] = [];
  const calls: { project?: any } = {};

  return {
    articleCalls,
    calls,
    db: {
      orgSettings: {
        findUnique: async () =>
          options.threshold === null
            ? null
            : { relevanceThreshold: options.threshold ?? 6.0 },
      },
      article: {
        findMany: async (args: any) => {
          articleCalls.push(args);
          if (articleCalls.length === 2) {
            return options.availableArticles ?? options.articles ?? [];
          }
          if (articleCalls.length === 3) {
            return options.pageArticles ?? options.articles ?? [];
          }
          return options.articles ?? [];
        },
      },
      project: {
        findMany: async (args: any) => {
          calls.project = args;
          return options.projects ?? [];
        },
      },
    } as any,
  };
}

const article = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  title: "A model ships",
  sourceUrl: "https://example.test/a1",
  author: "Someone",
  publishedAt: new Date("2026-08-01T10:00:00.000Z"),
  capturedAt: new Date("2026-08-01T11:00:00.000Z"),
  relevanceScore: 8.5,
  summary: "Short summary",
  category: ["AI Tools"],
  status: "APPROVED",
  ...over,
});

const project = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Radar",
  description: "Internal work",
  team: "Delivery",
  projectDate: new Date("2026-07-20T00:00:00.000Z"),
  impact: null,
  imageUrl: null,
  featured: true,
  ...over,
});

describe("clampPoolLimit", () => {
  it("defaults when absent or blank", () => {
    expect(clampPoolLimit(null)).toBe(CANDIDATE_POOL_LIMIT);
    expect(clampPoolLimit("")).toBe(CANDIDATE_POOL_LIMIT);
    expect(clampPoolLimit("   ")).toBe(CANDIDATE_POOL_LIMIT);
  });

  it("defaults on anything that is not a number", () => {
    expect(clampPoolLimit("all")).toBe(CANDIDATE_POOL_LIMIT);
    expect(clampPoolLimit("NaN")).toBe(CANDIDATE_POOL_LIMIT);
  });

  it("clamps to the allowed range instead of refusing", () => {
    expect(clampPoolLimit("1")).toBe(1);
    expect(clampPoolLimit("0")).toBe(1);
    expect(clampPoolLimit("-20")).toBe(1);
    expect(clampPoolLimit("500")).toBe(CANDIDATE_POOL_MAX);
  });

  it("floors a fractional limit", () => {
    expect(clampPoolLimit("12.7")).toBe(12);
  });
});

describe("readCandidatePool eligibility", () => {
  it("excludes anything already in an edition", async () => {
    const { db, articleCalls, calls } = fakeDb({});
    await readCandidatePool(db);

    expect(articleCalls[0].where.editions).toEqual({ none: {} });
    expect(calls.project.where.editions).toEqual({ none: {} });
  });

  it("takes APPROVED at any score and PENDING_REVIEW only at the threshold", async () => {
    const { db, articleCalls } = fakeDb({ threshold: 7.5 });
    await readCandidatePool(db);

    // Mirrors rankCandidates: a person's decision outranks a score, and an
    // unjudged article is not a passed one.
    expect(articleCalls[0].where.OR).toEqual([
      { status: "APPROVED" },
      { status: "PENDING_REVIEW", relevanceScore: { gte: 7.5 } },
    ]);
  });

  it("falls back to the default threshold when the organization has no settings", async () => {
    const { db, articleCalls } = fakeDb({ threshold: null });
    await readCandidatePool(db);

    expect(articleCalls[0].where.OR[1]).toEqual({
      status: "PENDING_REVIEW",
      relevanceScore: { gte: 6.0 },
    });
  });

  it("keeps the search separate from eligibility rather than merging the ORs", async () => {
    const { db, articleCalls } = fakeDb({});
    await readCandidatePool(db, { search: "  agents  " });

    // A flattened OR would let the search reach articles that are not eligible.
    expect(articleCalls[0].where.AND).toHaveLength(2);
    expect(articleCalls[0].where.AND[0].editions).toEqual({ none: {} });
    expect(articleCalls[0].where.AND[1].OR).toEqual([
      { title: { contains: "agents", mode: "insensitive" } },
      { summary: { contains: "agents", mode: "insensitive" } },
    ]);
  });

  it("ignores a blank search", async () => {
    const { db, articleCalls } = fakeDb({});
    await readCandidatePool(db, { search: "   " });

    expect(articleCalls[0].where.AND).toBeUndefined();
    expect(articleCalls[0].where.editions).toEqual({ none: {} });
  });

  it("puts featured projects first", async () => {
    const { db, calls } = fakeDb({});
    await readCandidatePool(db);

    expect(calls.project.orderBy).toEqual([
      { featured: "desc" },
      { projectDate: "desc" },
    ]);
  });

  it("caps the projects in the database, which have a column to order by", async () => {
    const { db, calls } = fakeDb({});
    await readCandidatePool(db, { limit: 7 });

    expect(calls.project.take).toBe(7);
  });
});

describe("readCandidatePool filters", () => {
  it("narrows by topic without touching eligibility", async () => {
    const { db, articleCalls } = fakeDb({});
    await readCandidatePool(db, { categories: ["Agents", "Infra"] });

    expect(articleCalls[0].where.AND).toHaveLength(2);
    expect(articleCalls[0].where.AND[1]).toEqual({
      category: { hasSome: ["Agents", "Infra"] },
    });
  });

  it("ignores an empty topic list", async () => {
    const { db, articleCalls } = fakeDb({});
    await readCandidatePool(db, { categories: [] });

    expect(articleCalls[0].where.AND).toBeUndefined();
  });

  /**
   * The trap this guards: merged onto `eligible` rather than AND-ed with it, a score
   * range would replace the status OR, and the pool would start offering rejected and
   * below-threshold articles that merely happened to score in range.
   */
  it("ANDs a score range with eligibility rather than widening it", async () => {
    const { db, articleCalls } = fakeDb({ threshold: 6 });
    await readCandidatePool(db, { scoreMin: 8, scoreMax: 10 });

    const [eligible, score] = articleCalls[0].where.AND;
    expect(eligible.OR).toEqual([
      { status: "APPROVED" },
      { status: "PENDING_REVIEW", relevanceScore: { gte: 6 } },
    ]);
    expect(score).toEqual({ relevanceScore: { gte: 8, lte: 10 } });
  });

  it("treats the full range as no score filter at all", async () => {
    const { db, articleCalls } = fakeDb({});
    await readCandidatePool(db, { scoreMin: 0, scoreMax: 10 });

    expect(articleCalls[0].where.AND).toBeUndefined();
  });

  /**
   * A date range runs over `bestKnownDate`, so an article whose source gave no date is
   * in range when it was captured in range. Filtering on `publishedAt` alone never
   * matches a null, which is how a range silently hid every undated story elsewhere.
   */
  it("ranges over the capture time for an article with no publication date", async () => {
    const { db, articleCalls } = fakeDb({});
    await readCandidatePool(db, { dateFrom: "2026-08-01", dateTo: "2026-08-10" });

    const range = articleCalls[0].where.AND[1];
    expect(range.OR).toHaveLength(2);
    expect(range.OR[1].publishedAt).toBeNull();
    expect(range.OR[1].capturedAt.gte).toEqual(new Date("2026-08-01"));
    // "to 10 August" means the whole of it. Asserted in local time, which is what
    // `setHours` writes: as an instant this is 22:59:59.999Z here and 23:59:59.999Z
    // on a UTC runner, and pinning the instant would make the suite fail by timezone.
    const end = range.OR[1].capturedAt.lte as Date;
    expect(end.getDate()).toBe(10);
    expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([
      23, 59, 59,
    ]);
  });

  it("stacks every narrowing rather than letting the last one win", async () => {
    const { db, articleCalls } = fakeDb({});
    await readCandidatePool(db, {
      search: "agents",
      categories: ["Infra"],
      scoreMin: 7,
      dateFrom: "2026-08-01",
    });

    // eligibility + search + topics + score + date
    expect(articleCalls[0].where.AND).toHaveLength(5);
  });

  it("builds the topic pills from what is available, not from the filtered set", async () => {
    const { db, articleCalls } = fakeDb({
      articles: [article({ category: ["AI Tools", "Agents"] })],
    });
    const pool = await readCandidatePool(db, { categories: ["Agents"] });

    // The pills query carries availability and none of the narrowing, so a topic
    // does not vanish from the list the moment it is used to filter.
    expect(articleCalls[1].where.AND).toBeUndefined();
    expect(articleCalls[1].where.editions).toEqual({ none: {} });
    expect(pool.categories).toEqual(["AI Tools", "Agents"].sort());
  });

  /**
   * Held ids are availability, not narrowing. A story the caller already holds cannot
   * be added again, so it should leave the pills and the waiting total as well as the
   * rows; a story merely filtered out should leave only the rows.
   */
  it("counts held ids out of what is available, filters out of what matches", async () => {
    const { db, articleCalls } = fakeDb({});
    await readCandidatePool(db, { excludeIds: ["held1"], categories: ["Agents"] });

    // Availability: eligibility plus the exclusion, and no topic filter.
    const pills = articleCalls[1].where;
    expect(pills.AND).toHaveLength(2);
    expect(pills.AND[0].editions).toEqual({ none: {} });
    expect(pills.AND[1]).toEqual({ id: { notIn: ["held1"] } });

    // The rows: availability nested, then the narrowing on top of it.
    const rows = articleCalls[0].where;
    expect(rows.AND[0]).toEqual(pills);
    expect(rows.AND[1]).toEqual({ category: { hasSome: ["Agents"] } });
  });
});

describe("readCandidatePool ordering", () => {
  /**
   * The order is decided over every matching row and only then cut to the page.
   * Sorting after the cut is the defect: `date` is `publishedAt ?? capturedAt` and
   * `source` is derived from the URL, so neither can be an `orderBy` at all.
   */
  it("sorts the whole matching set before taking the page", async () => {
    const { db, articleCalls } = fakeDb({
      articles: [
        article({ id: "low", relevanceScore: 5 }),
        article({ id: "high", relevanceScore: 9 }),
        article({ id: "mid", relevanceScore: 7 }),
      ],
    });

    const pool = await readCandidatePool(db, { limit: 2 });

    // No database ordering on the ranking pass: it is done in process.
    expect(articleCalls[0].orderBy).toBeUndefined();
    expect(articleCalls[0].take).toBeUndefined();
    // Cut after sorting gives 9 and 7. Cut before it would have given 5 and 9.
    expect(pool.articles.map((a) => a.id)).toEqual(["high", "mid"]);
  });

  it("reapplies the page order, because findMany does not honour an `in`", async () => {
    const rows = [
      article({ id: "high", relevanceScore: 9 }),
      article({ id: "mid", relevanceScore: 7 }),
    ];

    const { db } = fakeDb({
      articles: rows,
      // The database answers in its own order.
      pageArticles: [rows[1], rows[0]],
    });

    const pool = await readCandidatePool(db);

    expect(pool.articles.map((a) => a.id)).toEqual(["high", "mid"]);
  });

  it("orders by the date the cell shows, so an undated story is not last by default", async () => {
    const { db } = fakeDb({
      articles: [
        article({
          id: "dated-older",
          publishedAt: new Date("2026-08-01T00:00:00.000Z"),
          capturedAt: new Date("2026-08-01T00:00:00.000Z"),
        }),
        article({
          id: "undated-recent",
          publishedAt: null,
          capturedAt: new Date("2026-08-09T00:00:00.000Z"),
        }),
      ],
    });

    const pool = await readCandidatePool(db, {
      sort: { field: "date", direction: "desc" },
    });

    expect(pool.articles.map((a) => a.id)).toEqual([
      "undated-recent",
      "dated-older",
    ]);
  });
});

describe("readCandidatePool shaping", () => {
  it("returns dates as ISO strings and order as zero", async () => {
    const { db } = fakeDb({
      articles: [article()],
      projects: [project()],
    });

    const pool = await readCandidatePool(db);

    expect(pool.articles[0]).toEqual({
      id: "a1",
      title: "A model ships",
      sourceUrl: "https://example.test/a1",
      author: "Someone",
      publishedAt: "2026-08-01T10:00:00.000Z",
      capturedAt: "2026-08-01T11:00:00.000Z",
      relevanceScore: 8.5,
      summary: "Short summary",
      category: ["AI Tools"],
      status: "APPROVED",
      // Not in an edition yet, so position is the caller's to assign.
      order: 0,
    });

    expect(pool.projects[0]).toMatchObject({
      id: "p1",
      projectDate: "2026-07-20T00:00:00.000Z",
      order: 0,
    });
  });

  it("carries a null score and a null summary through untouched", async () => {
    const { db } = fakeDb({
      articles: [article({ relevanceScore: null, summary: null, author: null })],
    });

    const pool = await readCandidatePool(db);

    expect(pool.articles[0].relevanceScore).toBeNull();
    expect(pool.articles[0].summary).toBeNull();
    expect(pool.articles[0].author).toBeNull();
  });

  /**
   * The count that makes the cap visible. Without it the picker cannot tell the
   * difference between "these are all of them" and "these are the first fifty".
   */
  it("reports the population alongside the page", async () => {
    const { db } = fakeDb({
      articles: [
        article({ id: "a", relevanceScore: 9 }),
        article({ id: "b", relevanceScore: 8 }),
        article({ id: "c", relevanceScore: 7 }),
      ],
    });

    const pool = await readCandidatePool(db, { limit: 2 });

    expect(pool.articles).toHaveLength(2);
    expect(pool.articleTotal).toBe(3);
  });

  /**
   * The three numbers the picker needs to be honest: what is on screen, what matches
   * the filter, and what is waiting in total. Without the last one a default filter
   * reads as "that is everything there is", which is the failure the whole change
   * exists to avoid.
   */
  it("reports what is waiting in total, separately from what matches", async () => {
    const { db } = fakeDb({
      // Two match the date range, ten are waiting behind it.
      articles: [article({ id: "a" }), article({ id: "b" })],
      availableArticles: Array.from({ length: 10 }, (_unused, index) =>
        article({ id: `w${index}` })
      ),
    });

    const pool = await readCandidatePool(db, { dateFrom: "2026-08-01" });

    expect(pool.articles).toHaveLength(2);
    expect(pool.articleTotal).toBe(2);
    // The number that stops a default filter reading as "that is everything".
    expect(pool.eligibleTotal).toBe(10);
  });

  it("skips the second pass entirely when nothing matches", async () => {
    const { db, articleCalls } = fakeDb({});
    const pool = await readCandidatePool(db);

    // Ranking and the topic pills only: there are no ids to fetch rows for.
    expect(articleCalls).toHaveLength(2);
    expect(pool).toEqual({
      articles: [],
      projects: [],
      articleTotal: 0,
      eligibleTotal: 0,
      categories: [],
    });
  });
});
