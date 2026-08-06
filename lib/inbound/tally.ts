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

export function tallyItems(outcomes: readonly ItemOutcome[]): ItemTally {
  return {
    created: outcomes.reduce((total, outcome) => total + outcome.created, 0),
    duplicates: outcomes.filter((outcome) => outcome.duplicate).length,
    notes: outcomes
      .map((outcome) => outcome.note)
      .filter((note): note is string => note !== null),
  };
}
