import { describe, it, expect } from "vitest";
import { computeBackoffMs } from "./queue";

describe("computeBackoffMs", () => {
  it("grows exponentially from a 30s base", () => {
    expect(computeBackoffMs(1)).toBe(30_000); // 30s * 2^0
    expect(computeBackoffMs(2)).toBe(60_000); // 30s * 2^1
    expect(computeBackoffMs(3)).toBe(120_000); // 30s * 2^2
  });

  it("caps at 15 minutes", () => {
    expect(computeBackoffMs(10)).toBe(15 * 60 * 1000);
    expect(computeBackoffMs(100)).toBe(15 * 60 * 1000);
  });

  it("is monotonically non-decreasing", () => {
    let prev = 0;
    for (let n = 1; n <= 12; n++) {
      const cur = computeBackoffMs(n);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});
