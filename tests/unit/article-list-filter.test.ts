import { describe, expect, it } from "vitest";
import {
  articleListPage,
  articleListWhere,
  bulkActionDescriptors,
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

/**
 * The confirmation asymmetry, pinned.
 *
 * It is on the record for a reason: bulk reject shipped without a confirmation and 23
 * curated stories were lost to one click. Until now the only thing holding it in place was a
 * prose comment inside a 530-line client component, which is exactly the protection that
 * failed for `reset`. Both halves are asserted, because either one silently flipping is a
 * defect: losing the dialog costs stories, and adding one to Approve or Restore puts a modal
 * in front of the actions the screen exists to make easy.
 */
describe("bulkActionDescriptors", () => {
  const confirmsFor = (state: string) =>
    Object.fromEntries(
      bulkActionDescriptors(state, true).map(({ id, confirms }) => [id, confirms])
    );

  it("makes reject and discard ask first, on every filter that offers them", () => {
    for (const state of ["all", "pending", "approved", "rejected", "discarded"]) {
      const confirms = confirmsFor(state);
      if ("reject" in confirms) expect(confirms.reject).toBe(true);
      if ("discard" in confirms) expect(confirms.discard).toBe(true);
    }

    // Both are reachable somewhere, or the loop above would assert nothing at all.
    expect(confirmsFor("pending").reject).toBe(true);
    expect(confirmsFor("approved").discard).toBe(true);
  });

  it("lets approve, reset and restore run on the click", () => {
    for (const state of ["all", "pending", "approved", "rejected", "discarded"]) {
      const confirms = confirmsFor(state);
      if ("approve" in confirms) expect(confirms.approve).toBe(false);
      if ("reset" in confirms) expect(confirms.reset).toBe(false);
      if ("restore" in confirms) expect(confirms.restore).toBe(false);
    }

    expect(confirmsFor("pending").approve).toBe(false);
    expect(confirmsFor("approved").reset).toBe(false);
    expect(confirmsFor("discarded").restore).toBe(false);
  });

  it("gives a VIEWER no actions at all", () => {
    // RQ-005 AC-6.8. An empty list is what makes the bar render nothing, rather than buttons
    // that would answer 403 from a route requiring EDITOR.
    for (const state of ["all", "pending", "approved", "rejected", "discarded"]) {
      expect(bulkActionDescriptors(state, false)).toEqual([]);
    }
  });

  it("offers an EDITOR exactly what the filter allows, in the same order", () => {
    for (const state of ["all", "pending", "approved", "rejected", "discarded", "banana"]) {
      expect(bulkActionDescriptors(state, true).map(({ id }) => id)).toEqual(
        bulkActionsForFilter(state)
      );
    }
  });
});
