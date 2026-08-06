/**
 * RQ-007: per-item outcomes into the numbers a run reports.
 *
 * Extracted when the item loop became a worker pool. Items now finish out of order, and a
 * run's totals must not depend on that: the same email has to report the same numbers
 * every time it is processed, or the report is not evidence of anything.
 *
 * The loop used to accumulate into closure variables as it went, which is correct while
 * the order is fixed and quietly wrong once it is not. Returning an outcome per item and
 * reducing afterwards makes the order irrelevant by construction rather than by care.
 */
export interface ItemOutcome {
  created: number;
  duplicate: boolean;
  note: string | null;
}

export interface ItemTally {
  created: number;
  duplicates: number;
  notes: string[];
}

/**
 * Drop items that repeat a URL already in the list, keeping the first.
 *
 * Sequentially this cost nothing: the second copy reached `curateArticle`, was recognised
 * as a duplicate of the row the first copy had just written, and was counted as one. With a
 * worker pool both copies can pass the duplicate check before either writes, and two
 * articles for one URL reach the review queue. `Article.sourceUrl` carries no unique index,
 * so nothing downstream would catch it.
 *
 * A newsletter linking the same piece twice, once in a headline and once in a "read more",
 * is ordinary rather than exotic, and the extractor is not asked to deduplicate.
 */
export function dedupeByUrl<T extends { url: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = item.url.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function tallyItems(outcomes: readonly ItemOutcome[]): ItemTally {
  return {
    created: outcomes.reduce((total, outcome) => total + outcome.created, 0),
    duplicates: outcomes.filter((outcome) => outcome.duplicate).length,
    notes: outcomes
      .map((outcome) => outcome.note)
      .filter((note): note is string => note !== null),
  };
}
