import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_WIDTH,
  PAGE_WIDTHS,
  pageWidth,
  type PageWidth,
} from "@/lib/page-width";

/**
 * Four widths, named for what the page is doing.
 *
 * There were nine, across 35 call sites, plus four screens riding a default nobody chose.
 * A few were principled and the cluster in the middle was drift: each screen picked a
 * number and the next one copied whichever neighbour it was pasted from.
 *
 * The real enforcement is the type, not this test: `width` takes one of four names now, so
 * a tenth value stops compiling rather than shipping.
 */
describe("pageWidth", () => {
  it("maps every name to its width", () => {
    expect(pageWidth("reading")).toBe("780px");
    expect(pageWidth("form")).toBe("980px");
    expect(pageWidth("list")).toBe("1180px");
    expect(pageWidth("workspace")).toBe("1320px");
  });

  it("offers exactly four, so a fifth is a decision rather than a typo", () => {
    expect(Object.keys(PAGE_WIDTHS)).toHaveLength(4);
  });

  it("defaults to the form width", () => {
    expect(DEFAULT_PAGE_WIDTH).toBe("form");
    expect(pageWidth()).toBe(pageWidth(DEFAULT_PAGE_WIDTH));
  });

  it("keeps the scale ordered, narrowest to widest", () => {
    const order: PageWidth[] = ["reading", "form", "list", "workspace"];
    const values = order.map((name) => Number.parseInt(pageWidth(name), 10));

    expect(values).toEqual([...values].sort((a, b) => a - b));
  });
});
