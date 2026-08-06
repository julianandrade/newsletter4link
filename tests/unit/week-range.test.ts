import { describe, expect, it } from "vitest";
import { weekRangeLabel } from "@/lib/radar/week";

/**
 * The masthead used to read "WEEK 31 · 2026 · 2026": the edition label already carried the
 * year and the date label carried it again. The year moves to the date and appears once,
 * which is what this produces.
 */
describe("weekRangeLabel", () => {
  it("collapses the month when the week does not leave it", () => {
    expect(weekRangeLabel(32, 2026)).toBe("3-9 Aug 2026");
  });

  it("names both months when the week crosses one", () => {
    expect(weekRangeLabel(31, 2026)).toBe("27 Jul - 2 Aug 2026");
  });

  it("takes the year the week ends in, not the week-year, on week 1", () => {
    // Week 1 of 2026 starts on 29 December 2025. A reader looking at it wants 2026.
    expect(weekRangeLabel(1, 2026)).toBe("29 Dec - 4 Jan 2026");
  });

  it("takes the year the week ends in on week 53", () => {
    // 2026 has 53 weeks, because 1 January 2026 is a Thursday.
    expect(weekRangeLabel(53, 2026)).toBe("28 Dec - 3 Jan 2027");
  });

  it("is UTC, so it does not shift for a caller east or west of the server", () => {
    // isoWeekStart is UTC. A local-time getter slipping in would move the day of month.
    expect(weekRangeLabel(32, 2026).startsWith("3-")).toBe(true);
  });
});
