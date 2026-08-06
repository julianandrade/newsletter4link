import { describe, expect, it } from "vitest";
import {
  editionLabel,
  editionWriteFields,
  parseWeeklySlot,
  weeklySlotFor,
} from "@/lib/editions/identity";

/**
 * RQ-008 unit A. Everything here is a pure function over a date and a kind, so the
 * whole unit is tested without a database, the way lib/radar/week.ts is.
 *
 * The test that matters most is the week-year boundary. ISO 8601 puts 1 January 2027
 * in week 53 of week-year 2026, and the slot has to follow the week-year rather than
 * the calendar year or two editions a week apart collide in the unique index.
 */

describe("weeklySlotFor", () => {
  it("pads the week to two digits so slots sort lexically", () => {
    expect(weeklySlotFor(3, 2026)).toBe("2026-W03");
  });

  it("leaves a two-digit week alone", () => {
    expect(weeklySlotFor(32, 2026)).toBe("2026-W32");
  });

  it("accepts week 53, which ISO years genuinely have", () => {
    expect(weeklySlotFor(53, 2026)).toBe("2026-W53");
  });
});

describe("parseWeeklySlot", () => {
  it("round trips a slot it produced", () => {
    expect(parseWeeklySlot(weeklySlotFor(7, 2027))).toEqual({ week: 7, year: 2027 });
  });

  it("refuses a slot with an unpadded week", () => {
    expect(parseWeeklySlot("2026-W3")).toBeNull();
  });

  it("refuses a week outside 1 to 53", () => {
    expect(parseWeeklySlot("2026-W00")).toBeNull();
    expect(parseWeeklySlot("2026-W54")).toBeNull();
  });

  it("refuses anything that is not a slot", () => {
    expect(parseWeeklySlot("")).toBeNull();
    expect(parseWeeklySlot("Week 32")).toBeNull();
    expect(parseWeeklySlot("2026-32")).toBeNull();
  });
});

describe("editionWriteFields", () => {
  it("derives the week and the year from the publication date", () => {
    const fields = editionWriteFields({
      publishDate: new Date("2026-08-06T09:00:00.000Z"),
      kind: "WEEKLY",
    });

    expect(fields.week).toBe(32);
    expect(fields.year).toBe(2026);
  });

  it("gives a weekly edition the slot for its week", () => {
    const fields = editionWriteFields({
      publishDate: new Date("2026-08-06T09:00:00.000Z"),
      kind: "WEEKLY",
    });

    expect(fields.weeklySlot).toBe("2026-W32");
  });

  it("leaves a special edition with no slot, which is what lets a week hold many", () => {
    const fields = editionWriteFields({
      publishDate: new Date("2026-08-06T09:00:00.000Z"),
      kind: "SPECIAL",
    });

    expect(fields.weeklySlot).toBeNull();
    expect(fields.week).toBe(32);
    expect(fields.year).toBe(2026);
  });

  /**
   * The reason the slot is built from isoWeekAndYear and never from getFullYear.
   * 1 January 2027 is a Friday, and ISO 8601 files it in week 53 of 2026.
   */
  it("follows the ISO week-year across a new year rather than the calendar year", () => {
    const fields = editionWriteFields({
      publishDate: new Date("2027-01-01T00:00:00.000Z"),
      kind: "WEEKLY",
    });

    expect(fields).toMatchObject({ week: 53, year: 2026, weeklySlot: "2026-W53" });
  });

  it("returns the date it was given, untouched", () => {
    const publishDate = new Date("2026-08-06T09:00:00.000Z");
    expect(editionWriteFields({ publishDate, kind: "WEEKLY" }).publishDate).toBe(
      publishDate
    );
  });
});

describe("editionLabel", () => {
  it("prefers the title when there is one", () => {
    expect(editionLabel({ title: "AI Act special", week: 32, year: 2026 })).toBe(
      "AI Act special"
    );
  });

  it("falls back to the week label when the title is null", () => {
    expect(editionLabel({ title: null, week: 32, year: 2026 })).toBe("Week 32 · 2026");
  });

  it("treats a whitespace-only title as no title", () => {
    expect(editionLabel({ title: "   ", week: 9, year: 2026 })).toBe("Week 9 · 2026");
  });

  it("trims a title that has room around it", () => {
    expect(editionLabel({ title: "  Year in review  ", week: 1, year: 2027 })).toBe(
      "Year in review"
    );
  });
});
