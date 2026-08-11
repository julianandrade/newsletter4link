/**
 * Remove the two things Postgres refuses to store, and nothing else.
 *
 * The search failed in production with "unsupported Unicode escape sequence", and the
 * search itself had succeeded: only the write of its result failed. Tavily is asked for
 * `include_raw_content`, so whole scraped pages arrive as strings, and scraped text
 * carries NUL bytes. A NUL inside a jsonb value is rejected by Postgres, the job's result
 * is a jsonb column, so `completeJob` threw and the SSE stream forwarded the database's
 * own message to the screen. "Try again" could never help: the same page produced the
 * same byte.
 *
 * What a jsonb column accepts was measured against the database rather than assumed, and
 * the answer is narrower than it looks and wider than a blunt fix would allow:
 *
 * | Content                | jsonb                                          |
 * |------------------------|------------------------------------------------|
 * | NUL, U+0000            | refused, "unsupported Unicode escape sequence"  |
 * | lone surrogate         | refused, "lone leading surrogate in hex escape" |
 * | valid surrogate pair   | accepted, and every emoji is one of these       |
 * | other C0 controls      | accepted                                        |
 * | tab, newline           | accepted                                        |
 *
 * So this removes NUL and unpaired surrogates. Stripping the surrogate range wholesale
 * would delete emoji from scraped headlines; stripping all control characters would eat
 * the newlines that make scraped text readable. Both would be silent.
 *
 * A NUL is also rejected by a plain `text` column, so this is not only a jsonb concern.
 */

const NUL = /\u0000/g;

/**
 * An unpaired surrogate: a high one not followed by a low, or a low one not preceded by
 * a high. A valid pair is left alone, which is what keeps emoji intact.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** One string, safe to store. */
export function pgSafe(value: string): string {
  return value.replace(NUL, "").replace(LONE_SURROGATE, "");
}

/**
 * Every string inside a value, however deeply nested, including object keys.
 *
 * Defence in depth for the JSON columns. The ingress paths clean their own text, and this
 * is what protects a path somebody adds later without remembering to.
 *
 * A `Date` is returned as-is rather than walked: rebuilding it as a plain object is how a
 * `publishedAt` would arrive at the database as `{}`. Cycles are tracked, because a stack
 * overflow inside the guard would be a worse failure than the one it prevents.
 */
export function pgSafeDeep<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (typeof value === "string") return pgSafe(value) as unknown as T;

  if (value === null || typeof value !== "object") return value;

  if (value instanceof Date) return value;

  const existing = seen.get(value as object);
  if (existing !== undefined) return existing as T;

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value as object, out);
    for (const item of value) out.push(pgSafeDeep(item, seen));
    return out as unknown as T;
  }

  const out: Record<string, unknown> = {};
  seen.set(value as object, out);

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[pgSafe(key)] = pgSafeDeep(item, seen);
  }

  return out as unknown as T;
}
