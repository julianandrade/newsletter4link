import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/concurrency";

describe("mapWithConcurrency", () => {
  it("returns results in input order, not completion order", async () => {
    const items = [30, 10, 20, 0];
    const result = await mapWithConcurrency(items, 2, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(result).toEqual([30, 10, 20, 0]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;

    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      4,
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        return null;
      }
    );

    expect(peak).toBe(4);
  });

  it("is faster than sequential for network-shaped work", async () => {
    const started = Date.now();
    await mapWithConcurrency(
      Array.from({ length: 8 }, (_, i) => i),
      4,
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        return null;
      }
    );
    // Eight items of 25ms at four at a time is two waves, about 50ms. Sequential is 200ms.
    expect(Date.now() - started).toBeLessThan(150);
  });

  it("passes the index, so a caller can label its work", async () => {
    const seen: number[] = [];
    await mapWithConcurrency(["a", "b", "c"], 2, async (_item, index) => {
      seen.push(index);
      return null;
    });
    expect(seen.sort()).toEqual([0, 1, 2]);
  });

  it("rejects when a task rejects, like Promise.all", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("item two failed");
        return n;
      })
    ).rejects.toThrow("item two failed");
  });

  it("handles an empty list without calling the worker", async () => {
    let calls = 0;
    const result = await mapWithConcurrency([], 4, async () => {
      calls += 1;
      return null;
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it("treats a limit below one as one, rather than stalling", async () => {
    const result = await mapWithConcurrency([1, 2], 0, async (n) => n);
    expect(result).toEqual([1, 2]);
  });

  it("does not run more workers than there are items", async () => {
    let peak = 0;
    let running = 0;
    await mapWithConcurrency([1, 2], 10, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return null;
    });
    expect(peak).toBe(2);
  });
});
