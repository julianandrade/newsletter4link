import { describe, expect, it } from "vitest";
import {
  articleListPage,
  articleListWhere,
  bulkActionsForFilter,
} from "@/lib/articles/list-filter";

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

  it("searches the title and the summary, case insensitively, ignoring a blank search", () => {
    // The same two fields `GET /api/articles/pending` searches. A word that found a story
    // in the queue and not in the archive was the divergence, and the archive is the list
    // that claims to show everything.
    expect(articleListWhere({ state: null, search: "  agents  " })).toEqual({
      OR: [
        { title: { contains: "agents", mode: "insensitive" } },
        { summary: { contains: "agents", mode: "insensitive" } },
      ],
    });
    expect(articleListWhere({ state: null, search: "   " })).toEqual({});
  });

  it("combines a state and a search", () => {
    // The state stays a top-level condition rather than joining the OR, so a search on the
    // Rejected filter cannot return an approved story whose summary matches.
    expect(articleListWhere({ state: "rejected", search: "agents" })).toEqual({
      status: "REJECTED",
      OR: [
        { title: { contains: "agents", mode: "insensitive" } },
        { summary: { contains: "agents", mode: "insensitive" } },
      ],
    });
  });

  it("keeps the discard filter out of the OR, so it cannot be widened by a search", () => {
    expect(articleListWhere({ state: "discarded", search: "agents" })).toEqual({
      discardedAt: { not: null },
      OR: [
        { title: { contains: "agents", mode: "insensitive" } },
        { summary: { contains: "agents", mode: "insensitive" } },
      ],
    });
  });
});

describe("articleListPage", () => {
  it("defaults to the first page when nothing readable is asked for", () => {
    // A stale or hand-edited URL lands on page one, never on a 400.
    for (const raw of [null, "", "   ", "banana", "0", "-3", "NaN"]) {
      expect(articleListPage(raw)).toBe(1);
    }
  });

  it("reads the page that was asked for", () => {
    expect(articleListPage("2")).toBe(2);
    expect(articleListPage("17")).toBe(17);
  });

  it("takes the whole number out of a padded or fractional value", () => {
    expect(articleListPage(" 3 ")).toBe(3);
    expect(articleListPage("2.9")).toBe(2);
  });
});

describe("bulkActionsForFilter", () => {
  it("offers only Restore on the discarded filter", () => {
    // The other four never name discardedAt, so the tenant wrapper's default excludes every
    // row from the match query and the action reports "Nothing changed" after a confirmation.
    expect(bulkActionsForFilter("discarded")).toEqual(["restore"]);
  });

  it("mirrors nextActionsFor for each decided state", () => {
    expect(bulkActionsForFilter("approved")).toEqual(["reject", "reset", "discard"]);
    expect(bulkActionsForFilter("rejected")).toEqual(["approve", "reset", "discard"]);
    expect(bulkActionsForFilter("pending")).toEqual(["approve", "reject", "discard"]);
  });

  it("never offers Restore where discarded rows cannot appear", () => {
    // `all` is the mixed list, and the tenant wrapper keeps discarded rows out of it.
    expect(bulkActionsForFilter("all")).toEqual([
      "approve",
      "reject",
      "reset",
      "discard",
    ]);
    expect(bulkActionsForFilter("all")).not.toContain("restore");
    expect(bulkActionsForFilter("banana")).not.toContain("restore");
  });
});
