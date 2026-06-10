/**
 * Zero-dependency in-memory sliding-window rate limiter.
 *
 * IMPORTANT: This limiter is PER-INSTANCE / IN-MEMORY. State lives in a
 * module-level Map and is NOT shared across processes. On serverless
 * platforms (e.g. Vercel) this means limits are enforced per-lambda
 * instance, not globally. That is acceptable for a single-org internal
 * tool whose primary goal is to curb accidental cost abuse by an
 * authenticated user (e.g. a runaway client loop), not to provide a
 * hard distributed quota.
 *
 * It is intentionally designed behind a small, stable interface so it can
 * later be swapped for a shared store (Upstash/Redis/etc.) without touching
 * callers: keep `checkRateLimit` / `rateLimitKey` signatures the same and
 * replace the internal Map with a network-backed implementation.
 */

export interface RateLimitOptions {
  /** Maximum number of allowed requests within the window. */
  limit: number;
  /** Sliding window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether this request is permitted. */
  allowed: boolean;
  /** Requests remaining in the current window (0 when blocked). */
  remaining: number;
  /** Epoch ms when the oldest in-window hit expires / the window resets. */
  resetAt: number;
  /** Seconds the caller should wait before retrying (0 when allowed). */
  retryAfterSec: number;
}

/**
 * Map of rate-limit key -> array of request timestamps (epoch ms) that fall
 * within the current window. Older timestamps are pruned on each check.
 */
const buckets = new Map<string, number[]>();

/**
 * Build a stable rate-limit key from arbitrary parts (e.g. org id, user id,
 * route label). Undefined/empty parts are filtered out so a missing
 * identifier never silently collapses distinct callers into one bucket in an
 * unexpected way.
 */
export function rateLimitKey(parts: Array<string | undefined | null>): string {
  return parts
    .map((p) => (p == null ? "" : String(p)))
    .filter((p) => p.length > 0)
    .join(":");
}

/**
 * Check (and record) a request against a sliding window rate limit.
 *
 * Calling this counts as one request when `allowed` is true. When the limit
 * is already reached the request is NOT recorded and `allowed` is false.
 *
 * @param now Optional injected clock (epoch ms) for deterministic testing.
 */
export function checkRateLimit(
  key: string,
  opts: RateLimitOptions,
  now: number = Date.now()
): RateLimitResult {
  const { limit, windowMs } = opts;
  const windowStart = now - windowMs;

  const existing = buckets.get(key) ?? [];
  // Prune timestamps that have fallen out of the sliding window.
  const recent = existing.filter((ts) => ts > windowStart);

  if (recent.length >= limit) {
    // Blocked: reset happens when the oldest in-window hit expires.
    const oldest = recent[0];
    const resetAt = oldest + windowMs;
    const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
    // Persist the pruned list so memory does not grow unbounded.
    buckets.set(key, recent);
    return { allowed: false, remaining: 0, resetAt, retryAfterSec };
  }

  recent.push(now);
  buckets.set(key, recent);

  const resetAt = recent[0] + windowMs;
  return {
    allowed: true,
    remaining: Math.max(0, limit - recent.length),
    resetAt,
    retryAfterSec: 0,
  };
}

/**
 * Test/maintenance helper: clear all in-memory rate-limit state.
 */
export function resetRateLimits(): void {
  buckets.clear();
}
