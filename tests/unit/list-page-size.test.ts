import { describe, expect, it } from "vitest";
import {
  clampPageSize,
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  pageSizeKey,
} from "@/lib/list-page-size";

/**
 * The stored size is editable in devtools and arrives as a string from a select, so it is
 * clamped rather than trusted. A 5,000-row page is a hung tab, and a page size of zero is a
 * division by zero dressed up as a preference.
 */
describe("clampPageSize", () => {
  it("accepts the three sizes", () => {
    for (const size of PAGE_SIZES) {
      expect(clampPageSize(size)).toBe(size);
    }
  });

  it("accepts a numeric string, since a select hands back text", () => {
    expect(clampPageSize("100")).toBe(100);
    expect(clampPageSize("25")).toBe(25);
  });

  it("falls back to the default for anything else", () => {
    for (const junk of [null, undefined, 0, -50, 5000, 51, NaN, "", "fifty", {}, []]) {
      expect(clampPageSize(junk)).toBe(DEFAULT_PAGE_SIZE);
    }
  });

  it("defaults to 50, which is one of the offered sizes", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(50);
    expect(PAGE_SIZES).toContain(DEFAULT_PAGE_SIZE);
  });
});

describe("pageSizeKey", () => {
  it("namespaces the key by list", () => {
    expect(pageSizeKey("feeds")).toBe("n4l.pageSize.feeds");
    expect(pageSizeKey("articles")).toBe("n4l.pageSize.articles");
  });
});
