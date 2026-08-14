import { describe, expect, it } from "vitest";
import { clampToTotal, pageArgs, parseListPage } from "@/lib/list-page";

/**
 * `paged` keys off whether the caller sent a `page` at all, not what it said.
 *
 * That is the whole safety property of this module. `app/dashboard/send/[id]/page.tsx`
 * fetches `/api/subscribers` with no parameters and sends the edition to everyone it gets
 * back, so absence has to mean the whole list. A default page size would have limited a
 * newsletter to the first fifty people with nothing on the screen looking wrong.
 */
describe("parseListPage", () => {
  it("is unpaged when no page was asked for", () => {
    const result = parseListPage(new URLSearchParams("search=ana"));

    expect(result.paged).toBe(false);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it("is paged when a page was asked for, including the first", () => {
    expect(parseListPage(new URLSearchParams("page=1")).paged).toBe(true);
    expect(parseListPage(new URLSearchParams("page=4")).page).toBe(4);
  });

  it("takes the size when it is one of the three, and 50 otherwise", () => {
    expect(parseListPage(new URLSearchParams("page=1&pageSize=100")).pageSize).toBe(100);
    expect(parseListPage(new URLSearchParams("page=1&pageSize=25")).pageSize).toBe(25);
    expect(parseListPage(new URLSearchParams("page=1&pageSize=9999")).pageSize).toBe(50);
    expect(parseListPage(new URLSearchParams("page=1&pageSize=nope")).pageSize).toBe(50);
  });

  it("falls back to page one for junk, rather than to page NaN", () => {
    expect(parseListPage(new URLSearchParams("page=nope")).page).toBe(1);
    expect(parseListPage(new URLSearchParams("page=0")).page).toBe(1);
    expect(parseListPage(new URLSearchParams("page=-3")).page).toBe(1);
  });
});

describe("pageArgs", () => {
  it("skips the pages before it", () => {
    expect(pageArgs(1, 50)).toEqual({ skip: 0, take: 50 });
    expect(pageArgs(3, 25)).toEqual({ skip: 50, take: 25 });
  });
});

describe("clampToTotal", () => {
  it("pulls a page past the end back to the last one with rows on it", () => {
    expect(clampToTotal(9, 50, 120)).toBe(3);
  });

  it("leaves a page inside the range alone", () => {
    expect(clampToTotal(2, 50, 120)).toBe(2);
  });

  it("stays on page one for an empty list", () => {
    expect(clampToTotal(4, 50, 0)).toBe(1);
  });
});
