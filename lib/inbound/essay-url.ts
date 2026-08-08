/**
 * What an ESSAY article links to.
 *
 * Its own module rather than a function inside `process.ts`, for the reason `tally.ts` and
 * `link-outcome.ts` exist: `process.ts` imports `@/lib/db`, which opens a connection pool
 * at import time, so a unit test reaching through it pays for a database connection to
 * test a pure function.
 *
 * The rule is one line and the reason it needs stating is that the obvious fallback is
 * wrong. An EMAIL source keeps its sender address in `url`, deliberately, so
 * `webVersionUrl ?? source.url` produced articles pointing at `avi@dailydoseofds.com`.
 * Eleven reached production, and because the address never varies, every later essay from
 * that sender deduplicated against the first and silently produced nothing.
 */
export function essayUrl(
  webVersionUrl: string | null | undefined,
  sourceUrl: string | null | undefined
): string | null {
  const web = webVersionUrl?.trim();
  if (web && /^https?:\/\//i.test(web)) return web;

  const fallback = sourceUrl?.trim();
  // An RSS source's `url` is a feed and is usable. An EMAIL source's is an address and is
  // not. Testing the shape rather than the source's type keeps this true whatever else
  // ends up in the column.
  if (fallback && /^https?:\/\//i.test(fallback)) return fallback;

  // Null rather than a constructed URL: a link that does not resolve is worse than no link,
  // and the caller records "nothing to link to" as a note instead of creating the article.
  return null;
}
