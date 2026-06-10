/**
 * Lightweight in-process rate limiter.
 *
 * Uses a fixed-window counter in memory. This protects against runaway
 * loops and cost blowups (repeated LLM calls, mass email sends) from a
 * single client and is adequate for an internal, low-traffic deployment.
 *
 * Caveat: state is per server instance, so on a multi-instance deployment
 * the effective limit is (limit x instance count). For strict global
 * enforcement, back this with a shared store (e.g. Redis) - the public
 * API here (checkRateLimit / enforceRateLimit) can stay the same.
 */

interface WindowState {
  count: number;
  resetAt: number;
}

const store = new Map<string, WindowState>();

// Opportunistic cleanup so the map doesn't grow unbounded
let lastSweep = 0;
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, state] of store) {
    if (state.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitOptions {
  /** Max requests allowed within the window */
  limit: number;
  /** Window length in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

export class RateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    super("Rate limit exceeded. Please try again later.");
    this.name = "RateLimitError";
  }
}

/**
 * Record a hit against `key` and report whether it is within the limit.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
  now: number = Date.now()
): RateLimitResult {
  sweep(now);

  const existing = store.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: options.limit - 1,
      resetAt,
      retryAfterSec: 0,
    };
  }

  existing.count += 1;
  const allowed = existing.count <= options.limit;

  return {
    allowed,
    remaining: Math.max(0, options.limit - existing.count),
    resetAt: existing.resetAt,
    retryAfterSec: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/**
 * Throw RateLimitError if `key` has exceeded its limit. errorResponse()
 * maps the thrown error to a 429 with a Retry-After header.
 */
export function enforceRateLimit(key: string, options: RateLimitOptions): void {
  const result = checkRateLimit(key, options);
  if (!result.allowed) {
    throw new RateLimitError(result.retryAfterSec);
  }
}

// Sensible defaults for distinct classes of endpoint
export const RATE_LIMITS = {
  // Expensive LLM/embedding calls
  ai: { limit: 30, windowMs: 60_000 },
  // Outbound email sends (full broadcasts)
  emailSend: { limit: 10, windowMs: 60_000 },
  // Test/preview sends
  emailTest: { limit: 20, windowMs: 60_000 },
} as const;

/** Reset all state - test helper only. */
export function __resetRateLimitStore(): void {
  store.clear();
  lastSweep = 0;
}
