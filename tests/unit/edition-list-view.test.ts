import { describe, expect, it } from "vitest";
import { nextWeeklyDate, splitEditions } from "@/app/dashboard/send/page";

/**
 * RQ-008: the screen used to assume exactly one open edition.
 *
 * `editions.find((e) => e.status !== "SENT")` picked the first non-sent edition and
 * called it "the" open one, and the create control only existed when there was none.
 * That pair is what made a special edition unreachable from the interface: with the
 * week's edition open there was no button to press.
 */

const edition = (
  id: string,
  status: "DRAFT" | "FINALIZED" | "SENT",
  publishDate: string,
  sentAt: string | null = null
) => ({ id, status, publishDate, sentAt });

describe("splitEditions", () => {
  it("returns every unsent edition as open, not just the first", () => {
    const result = splitEditions([
      edition("weekly", "DRAFT", "2026-08-10"),
      edition("special", "DRAFT", "2026-08-12"),
      edition("old", "SENT", "2026-08-03", "2026-08-03T04:32:00.000Z"),
    ]);

    expect(result.open.map((e) => e.id)).toEqual(["special", "weekly"]);
    expect(result.sent.map((e) => e.id)).toEqual(["old"]);
  });

  it("counts a finalized edition as open, because it has not gone out", () => {
    const result = splitEditions([edition("f", "FINALIZED", "2026-08-10")]);

    expect(result.open.map((e) => e.id)).toEqual(["f"]);
    expect(result.sent).toEqual([]);
  });

  it("orders open editions by publication date, latest first", () => {
    const result = splitEditions([
      edition("mid", "DRAFT", "2026-08-11"),
      edition("late", "DRAFT", "2026-08-20"),
      edition("early", "DRAFT", "2026-08-04"),
    ]);

    expect(result.open.map((e) => e.id)).toEqual(["late", "mid", "early"]);
  });

  it("orders sent editions by when they were sent, newest first", () => {
    const result = splitEditions([
      edition("older", "SENT", "2026-07-27", "2026-07-27T04:32:00.000Z"),
      edition("newer", "SENT", "2026-08-03", "2026-08-03T04:32:00.000Z"),
    ]);

    expect(result.sent.map((e) => e.id)).toEqual(["newer", "older"]);
  });

  it("returns two empty lists for no editions", () => {
    expect(splitEditions([])).toEqual({ open: [], sent: [] });
  });
});

describe("nextWeeklyDate", () => {
  it("returns the Monday of the current ISO week", () => {
    // Thursday 6 August 2026. Its ISO week starts on Monday the 3rd.
    expect(nextWeeklyDate(new Date("2026-08-06T09:00:00.000Z")).toISOString()).toBe(
      "2026-08-03T00:00:00.000Z"
    );
  });

  it("returns the Monday itself when asked on a Monday", () => {
    expect(nextWeeklyDate(new Date("2026-08-03T23:59:00.000Z")).toISOString()).toBe(
      "2026-08-03T00:00:00.000Z"
    );
  });

  it("follows the ISO week-year across a new year", () => {
    // 1 January 2027 is a Friday, in week 53 of week-year 2026, which starts 28 December.
    expect(nextWeeklyDate(new Date("2027-01-01T12:00:00.000Z")).toISOString()).toBe(
      "2026-12-28T00:00:00.000Z"
    );
  });
});
