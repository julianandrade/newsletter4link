import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, rateLimitKey, resetRateLimits } from "@/lib/rate-limit";

describe("rateLimitKey", () => {
  it("joins parts with colons", () => {
    expect(rateLimitKey(["org1", "user1", "generate"])).toBe(
      "org1:user1:generate"
    );
  });

  it("filters out empty/nullish parts", () => {
    expect(rateLimitKey(["org1", undefined, "", null, "generate"])).toBe(
      "org1:generate"
    );
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows requests under the limit", () => {
    const opts = { limit: 3, windowMs: 1000 };
    const r1 = checkRateLimit("k", opts, 0);
    const r2 = checkRateLimit("k", opts, 10);
    const r3 = checkRateLimit("k", opts, 20);

    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it("blocks requests over the limit", () => {
    const opts = { limit: 2, windowMs: 1000 };
    checkRateLimit("k", opts, 0);
    checkRateLimit("k", opts, 10);
    const blocked = checkRateLimit("k", opts, 20);

    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("does not count blocked requests against the window", () => {
    const opts = { limit: 1, windowMs: 1000 };
    checkRateLimit("k", opts, 0);
    // Several blocked attempts should not extend or fill the window further.
    checkRateLimit("k", opts, 100);
    checkRateLimit("k", opts, 200);
    // After the original hit expires, a new request is allowed again.
    const after = checkRateLimit("k", opts, 1001);
    expect(after.allowed).toBe(true);
  });

  it("resets after the window elapses", () => {
    const opts = { limit: 1, windowMs: 1000 };
    const first = checkRateLimit("k", opts, 0);
    expect(first.allowed).toBe(true);

    const blocked = checkRateLimit("k", opts, 500);
    expect(blocked.allowed).toBe(false);

    // Move past the window: the old timestamp is pruned.
    const reset = checkRateLimit("k", opts, 1001);
    expect(reset.allowed).toBe(true);
    expect(reset.remaining).toBe(0);
  });

  it("keys are isolated from one another", () => {
    const opts = { limit: 1, windowMs: 1000 };
    expect(checkRateLimit("a", opts, 0).allowed).toBe(true);
    expect(checkRateLimit("b", opts, 0).allowed).toBe(true);
    expect(checkRateLimit("a", opts, 1).allowed).toBe(false);
  });

  it("reports a retryAfter that shrinks as the window elapses", () => {
    const opts = { limit: 1, windowMs: 10000 };
    checkRateLimit("k", opts, 0);
    const early = checkRateLimit("k", opts, 1000);
    const late = checkRateLimit("k", opts, 9000);
    expect(early.retryAfterSec).toBeGreaterThan(late.retryAfterSec);
  });
});
