/**
 * Adding stories to an edition that already has some.
 *
 * `PATCH /api/editions/:id` does not append. It deletes every join row for the
 * edition and recreates the array it was given, which is the right shape for a
 * builder that owns the whole list on screen and the wrong shape for anything that
 * knows only about the rows it wants to add. Sending three ids to an edition holding
 * eight leaves it holding three.
 *
 * So a caller that adds has to read first and send the merged list. That merge is
 * here rather than inline in the screen, because it is the part that is silently
 * destructive when it is wrong, and it is worth a test that does not need a browser.
 */

export interface EditionArticleRow {
  articleId: string;
  order: number;
}

/**
 * The article array to PATCH, given what the edition holds and what is being added.
 *
 * Existing rows keep their relative order and stay at the front: an add is an append,
 * never a reshuffle of an edition someone has already arranged. Anything already there
 * is not added twice, and duplicates within the incoming list collapse, because two
 * rows with the same `articleId` violate `@@id([editionId, articleId])` and would fail
 * the whole transaction rather than just that row.
 *
 * `order` is 1-based and contiguous over the result, matching what the builder writes.
 */
export function mergeEditionArticles(
  existingIds: readonly string[],
  addedIds: readonly string[]
): EditionArticleRow[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const id of [...existingIds, ...addedIds]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }

  return merged.map((articleId, index) => ({ articleId, order: index + 1 }));
}
