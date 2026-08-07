import { describe, expect, it } from "vitest";
import { nextActionsFor } from "@/components/article/article-state-controls";

/**
 * Which controls an article offers, given the state it is in. Pure, so the rule can be
 * asserted without rendering: the component maps the result to buttons and nothing else.
 */

describe("nextActionsFor", () => {
  it("offers both verdicts on something awaiting one", () => {
    expect(nextActionsFor({ status: "PENDING_REVIEW", discardedAt: null })).toEqual([
      "approve",
      "reject",
      "discard",
    ]);
  });

  it("offers the other verdict and a way back on an approved article", () => {
    // The gap this whole plan exists to close: an approved article had no control at all.
    expect(nextActionsFor({ status: "APPROVED", discardedAt: null })).toEqual([
      "reject",
      "reset",
      "discard",
    ]);
  });

  it("offers the other verdict and a way back on a rejected article", () => {
    expect(nextActionsFor({ status: "REJECTED", discardedAt: null })).toEqual([
      "approve",
      "reset",
      "discard",
    ]);
  });

  it("offers only restore on a discarded article, whatever its verdict", () => {
    // A discarded article is out of every list. Deciding one before bringing it back would
    // be deciding something nobody can see.
    for (const status of ["PENDING_REVIEW", "APPROVED", "REJECTED"]) {
      expect(nextActionsFor({ status, discardedAt: "2026-08-07T10:00:00.000Z" })).toEqual([
        "restore",
      ]);
    }
  });

  it("never offers the state the article is already in", () => {
    expect(nextActionsFor({ status: "APPROVED", discardedAt: null })).not.toContain(
      "approve"
    );
    expect(nextActionsFor({ status: "REJECTED", discardedAt: null })).not.toContain(
      "reject"
    );
    expect(nextActionsFor({ status: "PENDING_REVIEW", discardedAt: null })).not.toContain(
      "reset"
    );
  });
});
