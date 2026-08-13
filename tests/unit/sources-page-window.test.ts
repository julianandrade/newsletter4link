import { describe, expect, it } from "vitest";
import { pageWindow } from "@/lib/sources/summary";

/**
 * Paging is what keeps the tab short, and the clamp is what keeps it usable: a filter that
 * narrows 434 feeds to 12 while the pager sits on page 6 would otherwise show an empty
 * list under a pager reading "Page 6 of 1", which is how the curation history used to
 * blank itself.
 */
describe("pageWindow", () => {
  const rows = Array.from({ length: 120 }, (_, index) => index);

  it("returns the requested slice", () => {
    const result = pageWindow(rows, 2, 50);
    expect(result.rows[0]).toBe(50);
    expect(result.rows).toHaveLength(50);
    expect(result.totalPages).toBe(3);
  });

  it("clamps a page beyond the end back to the last one", () => {
    expect(pageWindow(rows, 9, 50).page).toBe(3);
  });

  it("clamps a page below one", () => {
    expect(pageWindow(rows, 0, 50).page).toBe(1);
  });

  it("reports one page for an empty list rather than zero", () => {
    const result = pageWindow([], 1, 50);
    expect(result.totalPages).toBe(1);
    expect(result.rows).toEqual([]);
  });

  it("returns the short tail on the last page", () => {
    const result = pageWindow(rows, 3, 50);
    expect(result.rows).toHaveLength(20);
    expect(result.rows[19]).toBe(119);
  });
});
