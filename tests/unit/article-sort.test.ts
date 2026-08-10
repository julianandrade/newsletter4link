import { describe, expect, it } from "vitest";
import { describeDate } from "@/lib/articles/date";
import {
  ARTICLE_SORT_ALIASES,
  ARTICLE_SORT_FIELDS,
  articleSortKey,
  sortArticles,
  type SortableArticle,
} from "@/lib/articles/sort";
import { compareValues, parseSort, sortBy } from "@/lib/list-sort";

/**
 * The defect these tests exist for.
 *
 * Both article routes ordered by the `publishedAt` column with NULLS LAST while both
 * screens rendered the cell from `describeDate`, which falls back to `capturedAt`. So an
 * article whose source gave no date sat at the very bottom of "Newest first" showing this
 * morning's capture time. On the live queue that was 165 of 1,329 rows: the Date column
 * read 10 Aug, 3 Aug, 2 Jun, … and then jumped back to 8 Aug.
 *
 * The invariant is one sentence, and `orders every row by the value its own cell shows`
 * below is the whole of it. Everything else here guards a way of breaking it.
 */

function article(over: Partial<SortableArticle> & { id: string }): SortableArticle {
  return {
    title: "A story",
    sourceUrl: "https://techcrunch.com/a",
    publishedAt: null,
    capturedAt: new Date("2026-08-01T00:00:00.000Z"),
    relevanceScore: 5,
    ...over,
  };
}

const DATED = article({
  id: "dated",
  title: "Published on 3 August",
  publishedAt: new Date("2026-08-03T18:00:00.000Z"),
  capturedAt: new Date("2026-08-03T19:00:00.000Z"),
});

const UNDATED_BUT_RECENT = article({
  id: "undated",
  title: "No publication date, captured on 8 August",
  publishedAt: null,
  capturedAt: new Date("2026-08-08T10:30:00.000Z"),
});

const OLDEST = article({
  id: "oldest",
  title: "Published on 1 June",
  publishedAt: new Date("2026-06-01T12:00:00.000Z"),
  capturedAt: new Date("2026-08-09T12:00:00.000Z"),
});

describe("sortArticles by date", () => {
  /**
   * The regression, stated as the thing a reader can check with their eyes: whatever order
   * the list comes back in, reading the Date column top to bottom must not go backwards.
   */
  it("orders every row by the value its own cell shows", () => {
    const sorted = sortArticles([DATED, OLDEST, UNDATED_BUT_RECENT], {
      field: "date",
      direction: "desc",
    });

    const shown = sorted.map((row) =>
      new Date(
        describeDate({
          publishedAt:
            row.publishedAt instanceof Date
              ? row.publishedAt.toISOString()
              : row.publishedAt,
          capturedAt:
            row.capturedAt instanceof Date
              ? row.capturedAt.toISOString()
              : String(row.capturedAt),
        }).value
      ).getTime()
    );

    expect(shown).toEqual([...shown].sort((a, b) => b - a));
  });

  it("puts an undated article where its capture time belongs, not last", () => {
    const sorted = sortArticles([DATED, OLDEST, UNDATED_BUT_RECENT], {
      field: "date",
      direction: "desc",
    });

    // The old NULLS LAST ordering produced dated, oldest, undated.
    expect(sorted.map((row) => row.id)).toEqual(["undated", "dated", "oldest"]);
  });

  it("reverses cleanly, with the undated row still in its true position", () => {
    const sorted = sortArticles([DATED, OLDEST, UNDATED_BUT_RECENT], {
      field: "date",
      direction: "asc",
    });

    expect(sorted.map((row) => row.id)).toEqual(["oldest", "dated", "undated"]);
  });

  it("reads ISO strings the same as Date objects, because a payload carries strings", () => {
    const asStrings = [DATED, OLDEST, UNDATED_BUT_RECENT].map((row) => ({
      ...row,
      publishedAt:
        row.publishedAt instanceof Date ? row.publishedAt.toISOString() : row.publishedAt,
      capturedAt: (row.capturedAt as Date).toISOString(),
    }));

    expect(sortArticles(asStrings, { field: "date", direction: "desc" }).map((r) => r.id)).toEqual(
      ["undated", "dated", "oldest"]
    );
  });
});

describe("sortArticles by the other fields", () => {
  it("sorts by source name, not by URL", () => {
    // theverge.com would sort before techcrunch.com as a string; the names do not.
    const verge = article({ id: "verge", sourceUrl: "https://www.theverge.com/x" });
    const tc = article({ id: "tc", sourceUrl: "https://techcrunch.com/y" });

    expect(articleSortKey(verge, "source")).toBe("The Verge");
    expect(articleSortKey(tc, "source")).toBe("TechCrunch");
    expect(
      sortArticles([verge, tc], { field: "source", direction: "asc" }).map((r) => r.id)
    ).toEqual(["tc", "verge"]);
  });

  it("puts an unscored article last in both directions", () => {
    const scored = article({ id: "scored", relevanceScore: 7 });
    const unscored = article({ id: "unscored", relevanceScore: null });

    for (const direction of ["asc", "desc"] as const) {
      expect(
        sortArticles([unscored, scored], { field: "relevanceScore", direction }).map(
          (r) => r.id
        )
      ).toEqual(["scored", "unscored"]);
    }
  });

  /**
   * Scores are one decimal, so a batch of forty stories holds maybe five distinct values.
   * Without a tie-break, "Score, high to low" is forty rows in an order that changes
   * between two identical requests.
   */
  it("breaks a tied score with the newest first, then the id", () => {
    const older = article({
      id: "a-older",
      relevanceScore: 7,
      publishedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const newer = article({
      id: "z-newer",
      relevanceScore: 7,
      publishedAt: new Date("2026-08-05T00:00:00.000Z"),
    });

    expect(
      sortArticles([older, newer], { field: "relevanceScore", direction: "desc" }).map(
        (r) => r.id
      )
    ).toEqual(["z-newer", "a-older"]);
  });

  it("is a total order, so the same input always gives the same output", () => {
    const identical = [
      article({ id: "c", relevanceScore: 7, publishedAt: null, capturedAt: new Date(0) }),
      article({ id: "a", relevanceScore: 7, publishedAt: null, capturedAt: new Date(0) }),
      article({ id: "b", relevanceScore: 7, publishedAt: null, capturedAt: new Date(0) }),
    ];

    const once = sortArticles(identical, { field: "relevanceScore", direction: "desc" });
    const twice = sortArticles(
      [...identical].reverse(),
      { field: "relevanceScore", direction: "desc" }
    );

    expect(once.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(twice.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the array it was given", () => {
    const rows = [OLDEST, UNDATED_BUT_RECENT, DATED];
    sortArticles(rows, { field: "date", direction: "desc" });
    expect(rows.map((r) => r.id)).toEqual(["oldest", "undated", "dated"]);
  });
});

describe("parseSort", () => {
  const fallback = { field: "relevanceScore" as const, direction: "desc" as const };

  it("keeps a field the route declared", () => {
    expect(
      parseSort(
        new URLSearchParams("sortBy=title&sortOrder=asc"),
        ARTICLE_SORT_FIELDS,
        fallback
      )
    ).toEqual({ field: "title", direction: "asc" });
  });

  /**
   * Three routes handed `sortBy` straight to Prisma as an object key, which turns a query
   * string into a column name.
   */
  it("falls back rather than passing an undeclared field through", () => {
    expect(
      parseSort(
        new URLSearchParams("sortBy=organizationId&sortOrder=asc"),
        ARTICLE_SORT_FIELDS,
        fallback
      )
    ).toEqual({ field: "relevanceScore", direction: "asc" });
  });

  it("still understands the name the queue has always sent", () => {
    expect(
      parseSort(
        new URLSearchParams("sortBy=publishedAt&sortOrder=desc"),
        ARTICLE_SORT_FIELDS,
        fallback,
        ARTICLE_SORT_ALIASES
      )
    ).toEqual({ field: "date", direction: "desc" });
  });

  it("uses the route's own default when nothing was asked for", () => {
    expect(parseSort(new URLSearchParams(""), ARTICLE_SORT_FIELDS, fallback)).toEqual(
      fallback
    );
  });
});

describe("compareValues", () => {
  it("puts missing values last whichever way the column points", () => {
    expect(compareValues(null, 3, "asc")).toBeGreaterThan(0);
    expect(compareValues(null, 3, "desc")).toBeGreaterThan(0);
    expect(compareValues(3, null, "asc")).toBeLessThan(0);
    expect(compareValues(3, null, "desc")).toBeLessThan(0);
  });

  it("compares text without splitting a column into two alphabets", () => {
    expect(
      sortBy(["banana", "Apple", "cherry"], (v) => v, "asc")
    ).toEqual(["Apple", "banana", "cherry"]);
  });
});
