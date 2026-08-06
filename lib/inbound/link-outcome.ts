/**
 * What to do with the result of unwrapping a digest item's link.
 *
 * Its own module rather than an export from `process.ts`, for the reason `tally.ts`
 * exists: `process.ts` imports `@/lib/db`, which opens a connection pool at import time,
 * so a unit test that reaches through it pays for a database connection to test a pure
 * function.
 */

export type UnwrapOutcome = "resolved" | "refused" | "unresolved";

/**
 * Three outcomes, because there are three different decisions to take.
 *
 * `resolved` is the article's own address, either because the chain was followed or
 * because the URL was never a wrapper. `refused` is a target the safety check rejected,
 * which must not be stored and must not be fetched by anything later. `unresolved` is
 * every other failure: the chain exists but could not be followed, so what we hold is the
 * newsletter's own tracking URL rather than the publisher's.
 *
 * `unresolved` used to be treated as `resolved`, silently, which is finding D4 of
 * 6 August 2026. An exhausted hop budget, a redirect loop and a five second timeout all
 * created an article whose source URL was the wrapper, with nothing recorded on the row,
 * so an edition could go out linking to link.mail.beehiiv.com and naming "Beehiiv" as the
 * publisher.
 */
export function classifyUnwrap(result: {
  unwrapped: boolean;
  note: string | null;
}): UnwrapOutcome {
  // Checked first: a followed chain is resolved whatever its note happens to say.
  if (result.unwrapped) return "resolved";

  const note = result.note ?? "";

  if (note.includes("not a public address") || note.includes("not allowed")) {
    return "refused";
  }

  return "unresolved";
}
