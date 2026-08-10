/**
 * How an article list is ordered, in one place, because the order and the cell disagreed.
 *
 * The defect this file fixes: both article routes ordered by the `publishedAt` column with
 * `NULLS LAST`, and both screens rendered the cell from `describeDate`, which falls back to
 * `capturedAt` when there is no publication date. So the 379 articles whose source gave no
 * date were pushed to the very bottom of "Newest first" while displaying a capture time
 * from this week. Read down the Date column of the queue and it went 10 Aug, 3 Aug, 2 Jun,
 * … and then jumped back to 8 Aug for the last 165 rows.
 *
 * `bestKnownDate` in `./date.ts` was written for exactly this and its own comment says so:
 * "The best date available, for ordering and bucketing". Neither route used it. The rule is
 * now one line and one function: **order by the value the cell shows.**
 *
 * `source` is here for the same reason. The queue's Source column shows
 * `sourceIdentity(sourceUrl).name`, which is a derived publication name, not the URL. A
 * database sort on `sourceUrl` would order by protocol and host and put "The Verge" under
 * T in one row and under theverge.com in the next.
 */

import { sourceIdentity } from "@/lib/radar/source";
import { bestKnownDate } from "./date";
import type { SortDirection, SortRequest } from "@/lib/list-sort";
import { compareValues } from "@/lib/list-sort";

export const ARTICLE_SORT_FIELDS = [
  "date",
  "relevanceScore",
  "title",
  "source",
  "capturedAt",
] as const;

export type ArticleSortField = (typeof ARTICLE_SORT_FIELDS)[number];

/**
 * The queue has sent `sortBy=publishedAt` since it shipped, and the field is called `date`
 * now because it orders by the publication date or the capture time, whichever the row
 * actually has. Naming it `publishedAt` is what made the bug easy to miss.
 */
export const ARTICLE_SORT_ALIASES: Record<string, ArticleSortField> = {
  publishedAt: "date",
};

/** What the first click on each column means. */
export const ARTICLE_SORT_DEFAULT_DIRECTION: Record<ArticleSortField, SortDirection> = {
  date: "desc",
  relevanceScore: "desc",
  capturedAt: "desc",
  title: "asc",
  source: "asc",
};

export const ARTICLE_SORT_LABELS: Record<ArticleSortField, string> = {
  date: "date",
  relevanceScore: "score",
  title: "story",
  source: "source",
  capturedAt: "when it was captured",
};

/** The columns an ordering needs. A superset of what any one field reads. */
export interface SortableArticle {
  id: string;
  title: string;
  sourceUrl: string;
  publishedAt: Date | string | null;
  capturedAt: Date | string;
  relevanceScore: number | null;
}

function asDate(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

/**
 * The value a row is ordered by, which is the value its cell shows.
 *
 * `date` is the whole point: `bestKnownDate` is `publishedAt ?? capturedAt`, the same
 * expression `describeDate` renders from.
 */
export function articleSortKey(
  article: SortableArticle,
  field: ArticleSortField
): string | number | Date | null {
  switch (field) {
    case "date":
      return bestKnownDate({
        publishedAt: asDate(article.publishedAt),
        capturedAt: asDate(article.capturedAt) ?? new Date(0),
      });
    case "capturedAt":
      return asDate(article.capturedAt);
    case "relevanceScore":
      return article.relevanceScore;
    case "title":
      return article.title;
    case "source":
      return sourceIdentity(article.sourceUrl).name;
  }
}

/**
 * Order a set of articles, totally and stably.
 *
 * The tie-break is deliberate and not decoration. Scores are one decimal, so a batch of
 * forty stories holds maybe five distinct values; without a second key, "Score, high to
 * low" is forty rows in whatever order the database felt like, and it changes between two
 * requests that asked the same question. Newest-first inside a score is the order an editor
 * working the queue actually wants, and `id` last makes it deterministic.
 */
export function sortArticles<T extends SortableArticle>(
  rows: readonly T[],
  sort: SortRequest<ArticleSortField>
): T[] {
  return [...rows].sort((a, b) => {
    const primary = compareValues(
      articleSortKey(a, sort.field),
      articleSortKey(b, sort.field),
      sort.direction
    );
    if (primary !== 0) return primary;

    if (sort.field !== "date") {
      const byDate = compareValues(
        articleSortKey(a, "date"),
        articleSortKey(b, "date"),
        "desc"
      );
      if (byDate !== 0) return byDate;
    }

    return a.id.localeCompare(b.id);
  });
}
