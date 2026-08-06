/**
 * Which date to use, now that an article can honestly not have a publication date.
 *
 * Finding C1: `publishedAt` used to be non-null because `curateArticle` filled it with
 * `new Date()`, so every article arriving through a newsletter carried its own ingestion
 * time as its publication date. It is nullable now, and 38 rows were cleared, which means
 * every caller that sorts, buckets or displays a date has to say what an unknown one
 * means. That decision belongs in one place rather than in each of them.
 *
 * A digest is why the unknown case is permanent, not a gap to close later: a newsletter
 * gives a title, a URL and a sentence, and no date. There is nothing to look up.
 */

export interface ArticleDates {
  publishedAt: Date | null;
  capturedAt: Date;
}

/**
 * The best date available, for ordering and bucketing.
 *
 * `capturedAt` is the fallback because it is never absent and it is the closest true thing
 * we have: for an article with no publication date, when we saw it is the only fact about
 * its position in time. Ordering by a fallback is honest in a way that *displaying* one
 * is not, which is why this is separate from `describeDate` below.
 */
export function bestKnownDate(article: ArticleDates): Date {
  return article.publishedAt ?? article.capturedAt;
}

/** The same thing for a payload whose dates are already ISO strings. */
export function bestKnownDateIso(article: {
  publishedAt: string | null;
  capturedAt: string;
}): string {
  return article.publishedAt ?? article.capturedAt;
}

export interface DateDescription {
  /** The instant to render. */
  value: string;
  /** True when `value` is the capture time rather than a publication date. */
  isCapture: boolean;
  /** What the label beside it should say. */
  label: string;
}

/**
 * What a screen should show, and what it is allowed to call it.
 *
 * The distinction is the whole point of the change. A capture time rendered under the word
 * "published" is the defect, so a caller gets both the value and the honest label, and
 * cannot accidentally present one as the other.
 */
export function describeDate(article: {
  publishedAt: string | null;
  capturedAt: string;
}): DateDescription {
  if (article.publishedAt) {
    return { value: article.publishedAt, isCapture: false, label: "published" };
  }

  return { value: article.capturedAt, isCapture: true, label: "captured" };
}
