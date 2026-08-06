import { describe, expect, it } from "vitest";
import { parseEditionCreate } from "@/app/api/editions/route";

/**
 * RQ-008: creating an edition takes a date and optionally a name, not a week number.
 *
 * The parse is a pure function so the rules are testable without a database or a
 * request, and so the route body stays a thin wrapper around it. The old route required
 * `week` and `year` as numbers, which is exactly what made a special edition impossible
 * to ask for: the two required fields were the identity, and the identity was a week.
 */

describe("parseEditionCreate", () => {
  it("accepts a date alone and defaults to a weekly edition with no name", () => {
    const result = parseEditionCreate({ publishDate: "2026-08-10" });

    expect(result).toEqual({
      ok: true,
      value: {
        title: null,
        publishDate: new Date("2026-08-10T00:00:00.000Z"),
        kind: "WEEKLY",
        autoPopulate: true,
      },
    });
  });

  it("accepts a name and a kind", () => {
    const result = parseEditionCreate({
      publishDate: "2026-08-10",
      title: "AI Act special",
      kind: "SPECIAL",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { title: "AI Act special", kind: "SPECIAL" },
    });
  });

  it("trims a name and treats a blank one as absent", () => {
    expect(
      parseEditionCreate({ publishDate: "2026-08-10", title: "  Launch  " })
    ).toMatchObject({ ok: true, value: { title: "Launch" } });

    expect(
      parseEditionCreate({ publishDate: "2026-08-10", title: "   " })
    ).toMatchObject({ ok: true, value: { title: null } });
  });

  it("lets a caller opt out of auto-population", () => {
    expect(
      parseEditionCreate({ publishDate: "2026-08-10", autoPopulate: false })
    ).toMatchObject({ ok: true, value: { autoPopulate: false } });
  });

  it("refuses a missing date, because the date is the identity now", () => {
    expect(parseEditionCreate({})).toEqual({
      ok: false,
      error: "publishDate is required, as an ISO date such as 2026-08-10",
    });
  });

  it("refuses a date that is not a date", () => {
    expect(parseEditionCreate({ publishDate: "next tuesday" })).toEqual({
      ok: false,
      error: "publishDate is required, as an ISO date such as 2026-08-10",
    });
  });

  it("refuses a kind that is not one of the two", () => {
    expect(parseEditionCreate({ publishDate: "2026-08-10", kind: "MONTHLY" })).toEqual({
      ok: false,
      error: "kind must be WEEKLY or SPECIAL",
    });
  });

  /**
   * A special edition with no name would be indistinguishable from the weekly one in
   * every list, since both would fall back to the same week label.
   */
  it("requires a special edition to be named", () => {
    expect(parseEditionCreate({ publishDate: "2026-08-10", kind: "SPECIAL" })).toEqual({
      ok: false,
      error:
        "a special edition needs a title, so it can be told apart from the weekly one",
    });
  });

  it("refuses a title longer than 120 characters", () => {
    expect(
      parseEditionCreate({ publishDate: "2026-08-10", title: "x".repeat(121) })
    ).toEqual({ ok: false, error: "title must be 120 characters or fewer" });
  });

  it("survives a null or undefined body rather than throwing", () => {
    expect(parseEditionCreate(null)).toMatchObject({ ok: false });
    expect(parseEditionCreate(undefined)).toMatchObject({ ok: false });
  });
});
