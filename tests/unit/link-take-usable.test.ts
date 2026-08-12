import { describe, expect, it, vi } from "vitest";
import { isUsableTake, readLinkTakesFor } from "@/lib/rewrite/usable";
import type { TenantClient } from "@/lib/db/tenant";

const passing = {
  id: "r1",
  title: "Titulo",
  body: "Corpo",
  language: "pt-PT",
  model: "claude-sonnet-5",
  inputMode: "FULL_TEXT" as const,
  status: "GENERATED" as const,
  checksPassed: true,
  checkSummary: null,
  longestSharedRun: 4,
  wordCount: 210,
  generatedAt: new Date(),
  error: null,
  instruction: null,
};

describe("isUsableTake", () => {
  it("accepts a generated take that passed its checks and is current", () => {
    expect(isUsableTake({ rewrite: passing, stale: false })).toBe(true);
  });

  it("refuses when there is no take at all", () => {
    expect(isUsableTake({ rewrite: null, stale: false })).toBe(false);
  });

  it("refuses a FAILED take", () => {
    expect(
      isUsableTake({ rewrite: { ...passing, status: "FAILED", checksPassed: false }, stale: false })
    ).toBe(false);
  });

  // A piece that passed its checks but whose article moved underneath it is an analysis of
  // a version of the story that no longer exists.
  it("refuses a stale take", () => {
    expect(isUsableTake({ rewrite: passing, stale: true })).toBe(false);
  });

  it("refuses a take whose checks did not pass, whatever its status says", () => {
    expect(isUsableTake({ rewrite: { ...passing, checksPassed: false }, stale: false })).toBe(false);
  });

  it("refuses a take with an empty body", () => {
    expect(isUsableTake({ rewrite: { ...passing, body: "  " }, stale: false })).toBe(false);
  });

  it("refuses a take with an empty title", () => {
    expect(isUsableTake({ rewrite: { ...passing, title: "  " }, stale: false })).toBe(false);
  });
});

/**
 * A stub `TenantClient` carrying only the two calls `readLinkTakesFor` makes, each
 * wrapped in a spy so a test can assert both the data it returns and how many times it
 * was actually called: the whole point of batching is that the second number does not
 * grow with the number of ids.
 */
function stubDb(rewrites: unknown[], articles: unknown[]) {
  const rewriteFindMany = vi.fn(async () => rewrites);
  const articleFindMany = vi.fn(async () => articles);
  const db = {
    articleRewrite: { findMany: rewriteFindMany },
    article: { findMany: articleFindMany },
  } as unknown as TenantClient;
  return { db, rewriteFindMany, articleFindMany };
}

const article = (id: string, contentHash: string) => ({ id, contentHash, content: "" });

interface FakeRewriteRow {
  id: string;
  title: string;
  body: string;
  language: string;
  model: string;
  inputMode: "FULL_TEXT" | "EXCERPT";
  status: "GENERATED" | "FAILED" | "STALE";
  checksPassed: boolean;
  checkSummary: string | null;
  longestSharedRun: number | null;
  wordCount: number | null;
  generatedAt: Date;
  error: string | null;
  instruction: string | null;
  articleId: string;
  sourceHash: string | null;
  supersededAt: Date | null;
}

const rewrite = (
  articleId: string,
  overrides: Partial<FakeRewriteRow> = {}
): FakeRewriteRow => ({
  ...passing,
  id: `r-${articleId}`,
  articleId,
  sourceHash: "hash-a",
  supersededAt: null,
  ...overrides,
});

describe("readLinkTakesFor", () => {
  it("returns nothing, and queries nothing, for an empty id list", async () => {
    const { db, rewriteFindMany, articleFindMany } = stubDb([], []);
    const takes = await readLinkTakesFor(db, []);
    expect(takes.size).toBe(0);
    expect(rewriteFindMany).not.toHaveBeenCalled();
    expect(articleFindMany).not.toHaveBeenCalled();
  });

  it("includes a usable take, keyed by article id", async () => {
    const { db } = stubDb(
      [rewrite("a1")],
      [article("a1", "hash-a")]
    );
    const takes = await readLinkTakesFor(db, ["a1"]);
    expect(takes.get("a1")).toEqual({
      title: passing.title,
      body: passing.body,
      language: passing.language,
    });
  });

  it("leaves an article with no rewrite row absent from the map", async () => {
    const { db } = stubDb([], [article("a1", "hash-a")]);
    const takes = await readLinkTakesFor(db, ["a1"]);
    expect(takes.has("a1")).toBe(false);
  });

  it("leaves a FAILED take absent from the map", async () => {
    const { db } = stubDb(
      [rewrite("a1", { status: "FAILED", checksPassed: false })],
      [article("a1", "hash-a")]
    );
    const takes = await readLinkTakesFor(db, ["a1"]);
    expect(takes.has("a1")).toBe(false);
  });

  it("leaves a stale take absent from the map", async () => {
    // The rewrite was made from a version of the article this hash no longer matches.
    const { db } = stubDb(
      [rewrite("a1", { sourceHash: "hash-a" })],
      [article("a1", "hash-b")]
    );
    const takes = await readLinkTakesFor(db, ["a1"]);
    expect(takes.has("a1")).toBe(false);
  });

  it("resolves a mix of usable, missing, failed and stale ids in one pass", async () => {
    const { db } = stubDb(
      [
        rewrite("usable", { sourceHash: "hash-a" }),
        rewrite("failed", { status: "FAILED", checksPassed: false }),
        rewrite("stale", { sourceHash: "hash-a" }),
        // "missing" has no rewrite row at all.
      ],
      [
        article("usable", "hash-a"),
        article("failed", "hash-a"),
        article("stale", "hash-b"),
        article("missing", "hash-a"),
      ]
    );

    const takes = await readLinkTakesFor(db, ["usable", "failed", "stale", "missing"]);

    expect([...takes.keys()]).toEqual(["usable"]);
  });

  it("queries exactly twice, regardless of how many ids are asked for", async () => {
    // This is the assertion that stops the per-id loop from coming back: batching fixes
    // all three call sites at once, and this is what would fail if one of them regressed
    // to a query per id.
    const manyIds = Array.from({ length: 50 }, (_, i) => `a${i}`);
    const { db, rewriteFindMany, articleFindMany } = stubDb(
      [rewrite("a0")],
      manyIds.map((id) => article(id, "hash-a"))
    );

    await readLinkTakesFor(db, manyIds);

    expect(rewriteFindMany).toHaveBeenCalledTimes(1);
    expect(articleFindMany).toHaveBeenCalledTimes(1);
  });
});
