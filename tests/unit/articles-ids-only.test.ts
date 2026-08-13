import { describe, expect, it } from "vitest";
import { articleIdsForRequest, wantsIdsOnly } from "@/lib/articles/list-filter";

/**
 * "Select all 4,812 matching" has to resolve to ids before anything acts, and those ids
 * have to come from the same filter and the same ordering the list itself used. Two
 * implementations of "matching" would drift the first time either changed, and the drift
 * would show up as a bulk action hitting rows the screen never listed.
 *
 * So the route computes one ordered set and this decides what to hand back: the page, or
 * all of it.
 */

const ORDERED = Array.from({ length: 120 }, (_, index) => ({ id: `a${index}` }));

describe("wantsIdsOnly", () => {
  it("is true only for an explicit true", () => {
    expect(wantsIdsOnly("true")).toBe(true);
    expect(wantsIdsOnly("false")).toBe(false);
    expect(wantsIdsOnly(null)).toBe(false);
    expect(wantsIdsOnly("")).toBe(false);
    expect(wantsIdsOnly("1")).toBe(false);
  });
});

describe("articleIdsForRequest", () => {
  it("returns one page in the order it was given", () => {
    const ids = articleIdsForRequest(ORDERED, { page: 2, pageSize: 50, idsOnly: false });

    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe("a50");
    expect(ids[49]).toBe("a99");
  });

  it("returns every matching id when asked, ignoring the page", () => {
    const first = articleIdsForRequest(ORDERED, { page: 1, pageSize: 50, idsOnly: true });
    const later = articleIdsForRequest(ORDERED, { page: 3, pageSize: 50, idsOnly: true });

    expect(first).toHaveLength(120);
    expect(first).toEqual(later);
    expect(first[0]).toBe("a0");
    expect(first[119]).toBe("a119");
  });

  it("keeps the ordering the list used, so the two never disagree", () => {
    const page = articleIdsForRequest(ORDERED, { page: 1, pageSize: 50, idsOnly: false });
    const every = articleIdsForRequest(ORDERED, { page: 1, pageSize: 50, idsOnly: true });

    expect(every.slice(0, 50)).toEqual(page);
  });

  it("returns the short tail on the last page", () => {
    const ids = articleIdsForRequest(ORDERED, { page: 3, pageSize: 50, idsOnly: false });
    expect(ids).toHaveLength(20);
  });

  it("returns nothing for a page past the end rather than throwing", () => {
    expect(articleIdsForRequest(ORDERED, { page: 9, pageSize: 50, idsOnly: false })).toEqual(
      []
    );
  });
});
