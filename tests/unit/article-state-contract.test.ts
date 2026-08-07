import { describe, expect, it } from "vitest";
import { BULK_ACTIONS, writeForAction, type BulkAction } from "@/lib/articles/bulk-action";
import { bulkActionsForFilter } from "@/lib/articles/list-filter";
import { nextActionsFor } from "@/components/article/article-state-controls";

/**
 * The contract between what the product offers and what the route can do.
 *
 * Three pure functions decide, between them, whether a button does anything at all:
 * `nextActionsFor` picks the controls on one article, `bulkActionsForFilter` picks the
 * controls on a whole filter, and `writeForAction` decides which rows either of them can
 * actually match. Nothing connected them, and they drifted: both offer lists put Reject on
 * an approved article and Approve on a rejected one, while both verdict guards named
 * `status: "PENDING_REVIEW"` and nothing else. Every one of those clicks matched zero rows,
 * so `applyBulk` reported `affected: 0` and the user was told somebody else had changed a
 * story nobody had touched. On the Approved filter, a bulk Reject showed its confirmation
 * dialog and then reported "Nothing changed", which is the exact bug shape
 * `bulkActionsForFilter` was added to eliminate.
 *
 * This file is what would have caught it, and what will catch the next one: every offered
 * action is walked back through its own guard against the states it can be offered on. Pure,
 * because all three functions are: no database, no rendering.
 */

interface ArticleState {
  status: string;
  discardedAt: string | null;
}

const DISCARDED_AT = "2026-08-07T10:00:00.000Z";
const VERDICTS = ["PENDING_REVIEW", "APPROVED", "REJECTED"] as const;

/** The six states an article can be in: three verdicts, discarded and not. */
const EVERY_STATE: ArticleState[] = VERDICTS.flatMap((status) => [
  { status, discardedAt: null },
  { status, discardedAt: DISCARDED_AT },
]);

const describeState = (state: ArticleState) =>
  `${state.status}${state.discardedAt ? " (discarded)" : ""}`;

const now = new Date(DISCARDED_AT);

/**
 * Whether one article satisfies a guard, in the same terms Prisma reads it.
 *
 * Only the four shapes `writeForAction` actually produces are understood: a literal, an
 * `in` list, `null`, and `{ not: null }`. Anything else throws rather than quietly passing,
 * so a guard written in a shape this test cannot check fails loudly here instead of
 * pretending to be covered.
 */
function guardAccepts(where: Record<string, unknown>, article: ArticleState): boolean {
  return Object.entries(where).every(([field, condition]) => {
    const value =
      field === "status"
        ? (article.status as string | null)
        : field === "discardedAt"
          ? article.discardedAt
          : (() => {
              throw new Error(`Unknown guard field: ${field}`);
            })();

    if (condition === null) return value === null;
    if (typeof condition === "string") return value === condition;

    if (typeof condition === "object") {
      const clause = condition as Record<string, unknown>;
      if (Array.isArray(clause.in)) return clause.in.includes(value);
      if ("not" in clause && clause.not === null) return value !== null;
    }

    throw new Error(`Unknown guard shape on ${field}: ${JSON.stringify(condition)}`);
  });
}

const accepts = (action: BulkAction, article: ArticleState) =>
  guardAccepts(writeForAction(action, now).where, article);

describe("guardAccepts, the harness itself", () => {
  it("reads each guard shape the way Prisma would", () => {
    // A harness that silently answered true would make every assertion below vacuous.
    expect(guardAccepts({ status: "APPROVED" }, { status: "APPROVED", discardedAt: null })).toBe(true);
    expect(guardAccepts({ status: "APPROVED" }, { status: "REJECTED", discardedAt: null })).toBe(false);
    expect(guardAccepts({ status: { in: ["APPROVED"] } }, { status: "APPROVED", discardedAt: null })).toBe(true);
    expect(guardAccepts({ status: { in: ["APPROVED"] } }, { status: "REJECTED", discardedAt: null })).toBe(false);
    expect(guardAccepts({ discardedAt: null }, { status: "APPROVED", discardedAt: null })).toBe(true);
    expect(guardAccepts({ discardedAt: null }, { status: "APPROVED", discardedAt: DISCARDED_AT })).toBe(false);
    expect(guardAccepts({ discardedAt: { not: null } }, { status: "APPROVED", discardedAt: DISCARDED_AT })).toBe(true);
    expect(guardAccepts({ discardedAt: { not: null } }, { status: "APPROVED", discardedAt: null })).toBe(false);
  });

  it("refuses a guard shape it does not understand rather than passing it", () => {
    expect(() => guardAccepts({ title: "x" }, { status: "APPROVED", discardedAt: null })).toThrow();
    expect(() =>
      guardAccepts({ status: { contains: "A" } }, { status: "APPROVED", discardedAt: null })
    ).toThrow();
  });
});

describe("every action nextActionsFor offers can actually fire", () => {
  for (const state of EVERY_STATE) {
    it(`${describeState(state)}`, () => {
      const offered = nextActionsFor(state);

      // An article with no control at all is the gap this whole feature exists to close.
      expect(offered.length).toBeGreaterThan(0);

      for (const action of offered) {
        expect(
          accepts(action, state),
          `${describeState(state)} offers "${action}", but its guard ${JSON.stringify(
            writeForAction(action, now).where
          )} does not match that state, so the click would report affected: 0`
        ).toBe(true);
      }
    });
  }

  it("still refuses the state the article is already in", () => {
    // Widening the verdict guards must not cost the protection they exist for: an action
    // that would write the value a row already holds has to stay unmatched, so `applyBulk`
    // counts it as skipped instead of reporting a change that did not happen.
    expect(accepts("approve", { status: "APPROVED", discardedAt: null })).toBe(false);
    expect(accepts("reject", { status: "REJECTED", discardedAt: null })).toBe(false);
    expect(accepts("reset", { status: "PENDING_REVIEW", discardedAt: null })).toBe(false);
    expect(accepts("discard", { status: "APPROVED", discardedAt: DISCARDED_AT })).toBe(false);
    expect(accepts("restore", { status: "APPROVED", discardedAt: null })).toBe(false);
  });

  it("offers nothing that is not in the vocabulary the route parses", () => {
    for (const state of EVERY_STATE) {
      for (const action of nextActionsFor(state)) {
        expect(BULK_ACTIONS).toContain(action);
      }
    }
  });
});

/**
 * What each filter on the all-articles screen can list.
 *
 * The four narrow filters list one thing: `pending`, `approved` and `rejected` name a status
 * and inherit the tenant client's `discardedAt: null` default, `discarded` names the column
 * and so lists a discarded article whatever verdict it carries. `all` names neither, so it
 * is the mixed list, minus discarded rows.
 */
const LISTABLE: Record<string, ArticleState[]> = {
  pending: [{ status: "PENDING_REVIEW", discardedAt: null }],
  approved: [{ status: "APPROVED", discardedAt: null }],
  rejected: [{ status: "REJECTED", discardedAt: null }],
  discarded: VERDICTS.map((status) => ({ status, discardedAt: DISCARDED_AT })),
  all: VERDICTS.map((status) => ({ status, discardedAt: null })),
};

describe("every action bulkActionsForFilter offers can actually fire", () => {
  for (const [filter, states] of Object.entries(LISTABLE)) {
    it(`${filter}`, () => {
      const offered = bulkActionsForFilter(filter);
      expect(offered.length).toBeGreaterThan(0);

      for (const action of offered) {
        const matching = states.filter((state) => accepts(action, state));

        // `all` is deliberately mixed, so an action there only has to reach part of the
        // list: Approve on the All filter is for the pending and rejected rows in it.
        expect(
          matching.length,
          `the ${filter} filter offers "${action}", and no state it can list satisfies the guard ${JSON.stringify(
            writeForAction(action, now).where
          )}, so a confirmed bulk action would report "Nothing changed"`
        ).toBeGreaterThan(0);

        // The four narrow filters list one kind of row, so an action offered there must
        // reach every row a reader can select, not just some of them.
        if (filter !== "all") {
          expect(
            matching.length,
            `the ${filter} filter offers "${action}" over rows it cannot all reach`
          ).toBe(states.length);
        }
      }
    });
  }

  it("falls back to a list that can fire on an unknown filter", () => {
    // An unknown state falls through to the same where clause `all` uses, so it must offer
    // the same actions and they must be reachable in the same way.
    expect(bulkActionsForFilter("banana")).toEqual(bulkActionsForFilter("all"));
    for (const action of bulkActionsForFilter("banana")) {
      expect(LISTABLE.all.some((state) => accepts(action, state))).toBe(true);
    }
  });
});

describe("the two offer lists agree with each other", () => {
  it("a narrow filter offers exactly what a row in that state offers", () => {
    // They are two spellings of one rule. When they disagree, the bar shows a button the
    // rows below it do not, which reads as a bug in whichever one the reader trusts.
    expect(bulkActionsForFilter("pending")).toEqual(
      nextActionsFor({ status: "PENDING_REVIEW", discardedAt: null })
    );
    expect(bulkActionsForFilter("approved")).toEqual(
      nextActionsFor({ status: "APPROVED", discardedAt: null })
    );
    expect(bulkActionsForFilter("rejected")).toEqual(
      nextActionsFor({ status: "REJECTED", discardedAt: null })
    );
    expect(bulkActionsForFilter("discarded")).toEqual(
      nextActionsFor({ status: "APPROVED", discardedAt: DISCARDED_AT })
    );
  });

  it("the All filter offers the union of what its rows offer, and no restore", () => {
    const union = new Set(LISTABLE.all.flatMap((state) => nextActionsFor(state)));
    expect(new Set(bulkActionsForFilter("all"))).toEqual(union);
    expect(bulkActionsForFilter("all")).not.toContain("restore");
  });
});
