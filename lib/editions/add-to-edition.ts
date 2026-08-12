/**
 * Adding stories to an edition that already has some.
 *
 * `PATCH /api/editions/:id` does not append. It deletes every join row for the
 * edition and recreates the array it was given, which is the right shape for a
 * builder that owns the whole list on screen and the wrong shape for anything that
 * knows only about the rows it wants to add. Sending three ids to an edition holding
 * eight leaves it holding three, and sending three ids with no flags clears the
 * Link Take flag off every one of those eight, silently.
 *
 * So a caller that adds has to read first and send the merged list back, flag and
 * all. That merge is here rather than inline in the screen, because it is the part
 * that is silently destructive when it is wrong, and it is worth a test that does
 * not need a browser.
 */

export interface EditionArticleRow {
  articleId: string;
  order: number;
  /** Whether this edition sends the Link Take for this story. RQ-006 surface 3. */
  useLinkTake: boolean;
}

/**
 * The article array to PATCH, given what the edition holds and what is being added.
 *
 * Existing rows keep their relative order, their flag, and stay at the front: an add
 * is an append, never a reshuffle of an edition someone has already arranged and
 * never a reset of a choice someone has already made. Anything already there is not
 * added twice, and duplicates within the incoming list collapse, because two rows
 * with the same `articleId` violate `@@id([editionId, articleId])` and would fail
 * the whole transaction rather than just that row. A newly added row starts
 * unflagged: only an existing row can carry `useLinkTake: true` into the merge.
 *
 * `order` is 1-based and contiguous over the result, matching what the builder writes.
 */
export function mergeEditionArticles(
  existing: readonly EditionArticleRow[],
  addedIds: readonly string[]
): EditionArticleRow[] {
  const merged: EditionArticleRow[] = [];
  const seen = new Set<string>();

  for (const row of existing) {
    if (!row.articleId || seen.has(row.articleId)) continue;
    seen.add(row.articleId);
    merged.push({ ...row });
  }

  for (const articleId of addedIds) {
    if (!articleId || seen.has(articleId)) continue;
    seen.add(articleId);
    merged.push({ articleId, order: 0, useLinkTake: false });
  }

  return merged.map((row, index) => ({ ...row, order: index + 1 }));
}
