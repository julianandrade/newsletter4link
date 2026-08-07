import { describe, expect, it } from "vitest";
import { articleListWhere } from "@/lib/articles/list-filter";

describe("articleListWhere", () => {
  it("defaults to everything that is not discarded", () => {
    // The tenant client already excludes discarded rows from findMany, so the default asks
    // for no discard filter at all and lets the wrapper apply it.
    expect(articleListWhere({ state: null, search: null })).toEqual({});
  });

  it("maps each state to its filter", () => {
    expect(articleListWhere({ state: "pending", search: null })).toEqual({
      status: "PENDING_REVIEW",
    });
    expect(articleListWhere({ state: "approved", search: null })).toEqual({
      status: "APPROVED",
    });
    expect(articleListWhere({ state: "rejected", search: null })).toEqual({
      status: "REJECTED",
    });
  });

  it("asks for discarded rows by name, which is what overrides the wrapper", () => {
    expect(articleListWhere({ state: "discarded", search: null })).toEqual({
      discardedAt: { not: null },
    });
  });

  it("falls back to the default on an unknown state rather than refusing", () => {
    expect(articleListWhere({ state: "banana", search: null })).toEqual({});
    expect(articleListWhere({ state: "all", search: null })).toEqual({});
  });

  it("searches the title, case insensitively, and ignores a blank search", () => {
    expect(articleListWhere({ state: null, search: "  agents  " })).toEqual({
      title: { contains: "agents", mode: "insensitive" },
    });
    expect(articleListWhere({ state: null, search: "   " })).toEqual({});
  });

  it("combines a state and a search", () => {
    expect(articleListWhere({ state: "rejected", search: "agents" })).toEqual({
      status: "REJECTED",
      title: { contains: "agents", mode: "insensitive" },
    });
  });
});
