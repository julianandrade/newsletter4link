// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

let filterAndSortResults: typeof import("@/lib/search/result-analyzer").filterAndSortResults;
let deduplicateResults: typeof import("@/lib/search/result-analyzer").deduplicateResults;
let mapTimeScopeToTimeRange: typeof import("@/lib/search/query-processor").mapTimeScopeToTimeRange;
let quickExpandQuery: typeof import("@/lib/search/query-processor").quickExpandQuery;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY ||= "test";
  process.env.OPENAI_API_KEY ||= "test";
  process.env.RESEND_API_KEY ||= "test";
  process.env.DATABASE_URL ||= "postgresql://user:pass@localhost:5432/db";

  ({ filterAndSortResults, deduplicateResults } = await import(
    "@/lib/search/result-analyzer"
  ));
  ({ mapTimeScopeToTimeRange, quickExpandQuery } = await import(
    "@/lib/search/query-processor"
  ));
});

describe("search result utilities", () => {
  it("filters and sorts results by aiScore", () => {
    const results = [
      { url: "a", aiScore: 9 },
      { url: "b", aiScore: 4 },
      { url: "c", aiScore: 7 },
    ];
    const sorted = filterAndSortResults(results as any, 5);
    expect(sorted.map((r) => r.url)).toEqual(["a", "c"]);
  });

  it("deduplicates results by normalized URL", () => {
    const results = [
      { url: "https://example.com" },
      { url: "https://example.com/" },
      { url: "https://Example.com" },
      { url: "https://example.com/news" },
    ];
    const deduped = deduplicateResults(results);
    expect(deduped.map((r) => r.url)).toEqual([
      "https://example.com",
      "https://example.com/news",
    ]);
  });
});

describe("search query helpers", () => {
  it("maps time scopes to time ranges", () => {
    expect(mapTimeScopeToTimeRange("recent")).toBe("day");
    expect(mapTimeScopeToTimeRange("this_week")).toBe("week");
    expect(mapTimeScopeToTimeRange("this_month")).toBe("month");
    expect(mapTimeScopeToTimeRange("any")).toBe("year");
  });

  it("expands query with latest/news variants", () => {
    const variants = quickExpandQuery("AI agents");
    expect(variants.some((q) => q.includes("latest"))).toBe(true);
    expect(variants.some((q) => q.includes("news"))).toBe(true);
  });
});
