/**
 * Whether an edition may be sent, as far as its Link Takes are concerned. RQ-006 surface 3.
 *
 * Pure, and separate from both the screen and the route, because both must reach the same
 * verdict from the same rule. A gate that lives only in the UI is not a gate: the send route
 * is reachable directly.
 *
 * The decision it encodes: a flag is a promise. Falling back to the summary would let an editor
 * believe they shipped a Link Take when they shipped a sentence, and leave nothing in the sent
 * edition recording the difference.
 */

export interface LinkTakeReadiness {
  /** How many stories in this edition are flagged. */
  flagged: number;
  /** The flagged ones with no usable take, in edition order. */
  missing: Array<{ articleId: string; title: string }>;
  ready: boolean;
}

export function linkTakeReadiness(
  rows: ReadonlyArray<{
    articleId: string;
    title: string;
    useLinkTake: boolean;
    hasUsableTake: boolean;
  }>
): LinkTakeReadiness {
  const flaggedRows = rows.filter((row) => row.useLinkTake);
  const missing = flaggedRows
    .filter((row) => !row.hasUsableTake)
    .map((row) => ({ articleId: row.articleId, title: row.title }));

  return { flagged: flaggedRows.length, missing, ready: missing.length === 0 };
}

/** The sentence shown on the screen and returned by the route, so they cannot disagree. */
export function linkTakeBlockReason(readiness: LinkTakeReadiness): string | null {
  if (readiness.ready) return null;

  const names = readiness.missing.map((row) => `"${row.title}"`).join(", ");
  const count = readiness.missing.length;

  return (
    `${count} ${count === 1 ? "story is" : "stories are"} set to send a Link Take ` +
    `but ${count === 1 ? "has" : "have"} none that can be sent: ${names}. ` +
    `Generate one from the article screen, or clear the flag.`
  );
}
