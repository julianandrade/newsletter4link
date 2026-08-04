import { describe, expect, it } from "vitest";
import {
  isoWeekAndYear,
  isoWeekEnd,
  isoWeekStart,
  weekLabel,
} from "@/lib/radar/week";

const utc = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe("isoWeekAndYear", () => {
  it("reads an ordinary mid-year week", () => {
    // 3 August 2026 is a Monday, in ISO week 32.
    expect(isoWeekAndYear(utc("2026-08-03"))).toEqual({ week: 32, year: 2026 });
    expect(isoWeekAndYear(utc("2026-08-09"))).toEqual({ week: 32, year: 2026 });
    // The next day is a new week.
    expect(isoWeekAndYear(utc("2026-08-10"))).toEqual({ week: 33, year: 2026 });
  });

  it("holds the week-year across the new year, which is the bug it replaces", () => {
    // The four days either side of the 2026/2027 boundary are one ISO week, week
    // 53 of week-year 2026. Anything pairing the week number with getFullYear()
    // splits them across two years and files two editions for one week.
    const sameWeek = [
      "2026-12-28", // Monday
      "2026-12-31",
      "2027-01-01",
      "2027-01-03", // Sunday
    ];

    for (const day of sameWeek) {
      expect(isoWeekAndYear(utc(day))).toEqual({ week: 53, year: 2026 });
    }

    // And the week after really is week 1 of the new week-year.
    expect(isoWeekAndYear(utc("2027-01-04"))).toEqual({ week: 1, year: 2027 });
  });

  it("puts early January in the previous week-year when the week started there", () => {
    // 1 January 2026 is a Thursday, so that week belongs to 2026 and there is no
    // spill backwards. 2023 is the opposite case: 1 January was a Sunday.
    expect(isoWeekAndYear(utc("2026-01-01"))).toEqual({ week: 1, year: 2026 });
    expect(isoWeekAndYear(utc("2023-01-01"))).toEqual({ week: 52, year: 2022 });
  });

  it("counts week 53 only in the years that have one", () => {
    // A year has 53 ISO weeks when it starts on a Thursday, or is a leap year
    // starting on a Wednesday. 2026 starts on a Thursday.
    expect(isoWeekAndYear(utc("2026-12-31"))).toEqual({ week: 53, year: 2026 });
    // 2025 has 52: its 31 December falls in week 1 of 2026.
    expect(isoWeekAndYear(utc("2025-12-31"))).toEqual({ week: 1, year: 2026 });
  });

  it("defaults to now", () => {
    const { week, year } = isoWeekAndYear();
    expect(week).toBeGreaterThanOrEqual(1);
    expect(week).toBeLessThanOrEqual(53);
    expect(year).toBeGreaterThanOrEqual(2026);
  });

  it("does not shift for a time of day near either edge of the UTC day", () => {
    // A local-time reading of these two would land on different days, and for a
    // Sunday-into-Monday pair, on different weeks.
    expect(isoWeekAndYear(new Date("2026-08-09T23:59:59.999Z"))).toEqual({
      week: 32,
      year: 2026,
    });
    expect(isoWeekAndYear(new Date("2026-08-10T00:00:00.000Z"))).toEqual({
      week: 33,
      year: 2026,
    });
  });
});

describe("isoWeekStart", () => {
  it("returns Monday at midnight UTC", () => {
    const start = isoWeekStart(32, 2026);
    expect(start.toISOString()).toBe("2026-08-03T00:00:00.000Z");
    expect(start.getUTCDay()).toBe(1);
  });

  it("reaches back into the previous calendar year when the week does", () => {
    // Week 1 of 2026 begins on 29 December 2025.
    expect(isoWeekStart(1, 2026).toISOString()).toBe("2025-12-29T00:00:00.000Z");
    // Week 53 of 2026 begins on 28 December 2026.
    expect(isoWeekStart(53, 2026).toISOString()).toBe("2026-12-28T00:00:00.000Z");
  });

  it("round-trips with isoWeekAndYear for every week of several years", () => {
    for (const year of [2023, 2024, 2025, 2026, 2027]) {
      for (let week = 1; week <= 52; week += 1) {
        const start = isoWeekStart(week, year);
        expect(isoWeekAndYear(start)).toEqual({ week, year });
      }
    }
  });

  it("round-trips week 53 in the years that have one", () => {
    for (const year of [2020, 2026]) {
      expect(isoWeekAndYear(isoWeekStart(53, year))).toEqual({
        week: 53,
        year,
      });
    }
  });
});

describe("isoWeekEnd", () => {
  it("ends on Sunday at the last millisecond", () => {
    const end = isoWeekEnd(32, 2026);
    expect(end.toISOString()).toBe("2026-08-09T23:59:59.999Z");
    expect(end.getUTCDay()).toBe(0);
  });

  it("spans exactly seven days from the start", () => {
    const start = isoWeekStart(32, 2026);
    const end = isoWeekEnd(32, 2026);
    expect(end.getTime() - start.getTime()).toBe(7 * 86_400_000 - 1);
  });

  it("leaves no gap before the next week starts", () => {
    expect(isoWeekEnd(32, 2026).getTime() + 1).toBe(
      isoWeekStart(33, 2026).getTime()
    );
  });
});

describe("weekLabel", () => {
  it("reads as a week and a year", () => {
    expect(weekLabel(32, 2026)).toBe("Week 32 · 2026");
  });
});
