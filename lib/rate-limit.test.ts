import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  enforceRateLimit,
  RateLimitError,
  __resetRateLimitStore,
} from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimitStore());

  it("allows requests up to the limit", () => {
    const opts = { limit: 3, windowMs: 1000 };
    expect(checkRateLimit("k", opts, 0).allowed).toBe(true);
    expect(checkRateLimit("k", opts, 0).allowed).toBe(true);
    expect(checkRateLimit("k", opts, 0).allowed).toBe(true);
  });

  it("blocks the request that exceeds the limit", () => {
    const opts = { limit: 2, windowMs: 1000 };
    checkRateLimit("k", opts, 0);
    checkRateLimit("k", opts, 0);
    const third = checkRateLimit("k", opts, 0);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.retryAfterSec).toBeGreaterThan(0);
  });

  it("decrements remaining as requests come in", () => {
    const opts = { limit: 5, windowMs: 1000 };
    expect(checkRateLimit("k", opts, 0).remaining).toBe(4);
    expect(checkRateLimit("k", opts, 0).remaining).toBe(3);
  });

  it("resets after the window elapses", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(checkRateLimit("k", opts, 0).allowed).toBe(true);
    expect(checkRateLimit("k", opts, 500).allowed).toBe(false);
    // After the window (t=1000), the counter resets
    expect(checkRateLimit("k", opts, 1000).allowed).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(checkRateLimit("a", opts, 0).allowed).toBe(true);
    expect(checkRateLimit("b", opts, 0).allowed).toBe(true);
    expect(checkRateLimit("a", opts, 0).allowed).toBe(false);
  });
});

describe("enforceRateLimit", () => {
  beforeEach(() => __resetRateLimitStore());

  it("does not throw within the limit", () => {
    expect(() =>
      enforceRateLimit("k", { limit: 2, windowMs: 1000 })
    ).not.toThrow();
  });

  it("throws RateLimitError with retryAfterSec when exceeded", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    enforceRateLimit("k", opts);
    try {
      enforceRateLimit("k", opts);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).retryAfterSec).toBeGreaterThan(0);
      expect((e as RateLimitError).retryAfterSec).toBeLessThanOrEqual(60);
    }
  });
});
