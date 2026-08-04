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
 */
function fakeDb(options: {
  threshold?: number | null;
  articles?: unknown[];
  projects?: unknown[];
}) {
  const calls: { article?: any; project?: any } = {};

  return {
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
          calls.article = args;
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
    const { db, calls } = fakeDb({});
    await readCandidatePool(db);

    expect(calls.article.where.editions).toEqual({ none: {} });
    expect(calls.project.where.editions).toEqual({ none: {} });
  });

  it("takes APPROVED at any score and PENDING_REVIEW only at the threshold", async () => {
    const { db, calls } = fakeDb({ threshold: 7.5 });
    await readCandidatePool(db);

    // Mirrors rankCandidates: a person's decision outranks a score, and an
    // unjudged article is not a passed one.
    expect(calls.article.where.OR).toEqual([
      { status: "APPROVED" },
      { status: "PENDING_REVIEW", relevanceScore: { gte: 7.5 } },
    ]);
  });

  it("falls back to the default threshold when the organization has no settings", async () => {
    const { db, calls } = fakeDb({ threshold: null });
    await readCandidatePool(db);

    expect(calls.article.where.OR[1]).toEqual({
      status: "PENDING_REVIEW",
      relevanceScore: { gte: 6.0 },
    });
  });

  it("keeps the search separate from eligibility rather than merging the ORs", async () => {
    const { db, calls } = fakeDb({});
    await readCandidatePool(db, { search: "  agents  " });

    // A flattened OR would let the search reach articles that are not eligible.
    expect(calls.article.where.AND).toHaveLength(2);
    expect(calls.article.where.AND[0].editions).toEqual({ none: {} });
    expect(calls.article.where.AND[1].OR).toEqual([
      { title: { contains: "agents", mode: "insensitive" } },
      { summary: { contains: "agents", mode: "insensitive" } },
    ]);
  });

  it("ignores a blank search", async () => {
    const { db, calls } = fakeDb({});
    await readCandidatePool(db, { search: "   " });

    expect(calls.article.where.AND).toBeUndefined();
    expect(calls.article.where.editions).toEqual({ none: {} });
  });

  it("ranks by score then recency, with unscored last", async () => {
    const { db, calls } = fakeDb({});
    await readCandidatePool(db);

    expect(calls.article.orderBy).toEqual([
      { relevanceScore: { sort: "desc", nulls: "last" } },
      { publishedAt: "desc" },
    ]);
  });

  it("puts featured projects first", async () => {
    const { db, calls } = fakeDb({});
    await readCandidatePool(db);

    expect(calls.project.orderBy).toEqual([
      { featured: "desc" },
      { projectDate: "desc" },
    ]);
  });

  it("passes the limit through to both queries", async () => {
    const { db, calls } = fakeDb({});
    await readCandidatePool(db, { limit: 7 });

    expect(calls.article.take).toBe(7);
    expect(calls.project.take).toBe(7);
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

  it("returns empty arrays rather than undefined when nothing qualifies", async () => {
    const { db } = fakeDb({});
    const pool = await readCandidatePool(db);

    expect(pool).toEqual({ articles: [], projects: [] });
  });
});
