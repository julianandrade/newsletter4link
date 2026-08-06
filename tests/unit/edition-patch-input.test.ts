import { describe, expect, it } from "vitest";
import { parseEditionPatch } from "@/app/api/editions/[id]/route";

/**
 * RQ-008: an unsent edition can be renamed and rescheduled.
 *
 * Absent and null are different here and the distinction is the whole point of the
 * parse: an absent `title` leaves the name alone, and an explicit null clears it back to
 * the derived week label. Every screen that sends a partial PATCH omits the fields it is
 * not touching, so a parse that could not tell them apart would erase the name on every
 * reorder.
 */

describe("parseEditionPatch", () => {
  it("returns nothing to change for an empty body", () => {
    expect(parseEditionPatch({})).toEqual({ ok: true, value: {} });
  });

  it("leaves the title alone when the key is absent", () => {
    const result = parseEditionPatch({ publishDate: "2026-08-11" });
    expect(result).toEqual({
      ok: true,
      value: { publishDate: new Date("2026-08-11T00:00:00.000Z") },
    });
  });

  it("clears the title when it is explicitly null", () => {
    expect(parseEditionPatch({ title: null })).toEqual({
      ok: true,
      value: { title: null },
    });
  });

  it("clears the title when it is blank", () => {
    expect(parseEditionPatch({ title: "  " })).toEqual({
      ok: true,
      value: { title: null },
    });
  });

  it("trims a new title", () => {
    expect(parseEditionPatch({ title: " Year in review " })).toEqual({
      ok: true,
      value: { title: "Year in review" },
    });
  });

  it("refuses a title longer than 120 characters", () => {
    expect(parseEditionPatch({ title: "x".repeat(121) })).toEqual({
      ok: false,
      error: "title must be 120 characters or fewer",
    });
  });

  it("refuses a publishDate that is not a date", () => {
    expect(parseEditionPatch({ publishDate: "soon" })).toEqual({
      ok: false,
      error: "publishDate must be an ISO date such as 2026-08-10",
    });
  });

  it("refuses a title that is neither a string nor null", () => {
    expect(parseEditionPatch({ title: 7 })).toEqual({
      ok: false,
      error: "title must be a string or null",
    });
  });

  /**
   * The other keys this route already accepted are none of this parser's business, and
   * it must not report them as changes or the PATCH would rewrite the name on a reorder.
   */
  it("ignores the status, articles and projects keys the route handles elsewhere", () => {
    expect(
      parseEditionPatch({
        status: "FINALIZED",
        articles: [{ articleId: "a" }],
        projects: [],
        templateId: "t1",
      })
    ).toEqual({ ok: true, value: {} });
  });

  it("survives a null or undefined body rather than throwing", () => {
    expect(parseEditionPatch(null)).toEqual({ ok: true, value: {} });
    expect(parseEditionPatch(undefined)).toEqual({ ok: true, value: {} });
  });
});
