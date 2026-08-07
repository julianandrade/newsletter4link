/**
 * What a bulk article action is, and what it writes.
 *
 * Pulled out of the route because the route had no tests and could not easily get any, and
 * because that is how `reset` went missing: RQ-005's tech spec (section 4, "add `reset` to
 * the actions") was implemented on the client, the route kept its two-item list, and every
 * Undo in the product answered `400 action must be one of approve, reject` from the day the
 * toast shipped. Nothing failed, because nothing was watching.
 *
 * Pure: no Prisma, no fetch. The route supplies the client and the clock.
 */

export type BulkAction = "approve" | "reject" | "reset" | "discard" | "restore";

export const BULK_ACTIONS: BulkAction[] = [
  "approve",
  "reject",
  "reset",
  "discard",
  "restore",
];

/** Above this, a single request is doing too much to stay inside a timeout. */
export const MAX_BULK_IDS = 1000;

export interface ParsedBulk {
  action: BulkAction;
  /** Deduplicated, in first-seen order. */
  ids: string[];
}

export interface BulkError {
  error: string;
}

function isBulkAction(value: unknown): value is BulkAction {
  return typeof value === "string" && BULK_ACTIONS.includes(value as BulkAction);
}

export function parseBulkRequest(body: unknown): ParsedBulk | BulkError {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "The request body must be an object" };
  }

  const { action, ids } = body as { action?: unknown; ids?: unknown };

  if (!isBulkAction(action)) {
    return { error: `action must be one of ${BULK_ACTIONS.join(", ")}` };
  }

  if (!Array.isArray(ids) || ids.length === 0) {
    return { error: "ids must be a non-empty array" };
  }

  if (!ids.every((id) => typeof id === "string" && id.length > 0)) {
    return { error: "every id must be a non-empty string" };
  }

  // Deduplicated before the ceiling is checked: a repeated id is one write, so it should
  // not spend the caller's budget.
  const unique = [...new Set<string>(ids as string[])];

  if (unique.length > MAX_BULK_IDS) {
    return { error: `Cannot act on more than ${MAX_BULK_IDS} articles at once` };
  }

  return { action, ids: unique };
}

export interface BulkWrite {
  /** Merged into the where clause alongside the ids and the tenant scope. */
  where: Record<string, unknown>;
  data: Record<string, unknown>;
}

/**
 * The guard and the write for each action.
 *
 * Every action carries a guard, and the guard is what makes the reported counts honest:
 * `affected` is what actually changed, `skipped` is what somebody else had already
 * decided, and an undo built on `affected` cannot reopen their verdict.
 *
 * A guard names every state the action can legitimately move *from*, never only the state
 * the queue happens to show. `approve` and `reject` started out guarding
 * `status: "PENDING_REVIEW"` alone, which quietly made two offered controls impossible:
 * `nextActionsFor` offers Reject on an approved article and Approve on a rejected one, and
 * both matched nothing, so the click reported "somebody else changed this first" about an
 * article nobody had touched. Each verdict therefore accepts the other verdict as a source,
 * and refuses only the state it would write, which is what keeps a no-op reported as
 * skipped rather than as a phantom success.
 *
 * `reset` accepts exactly the two states the verdicts produce. Resetting something already
 * awaiting a decision is a no-op rather than an error, because a double-clicked Undo must
 * not read as a failure.
 *
 * `tests/unit/article-state-contract.test.ts` walks every action every screen offers back
 * through these guards, so a control that cannot fire fails a test rather than a user.
 */
export function writeForAction(action: BulkAction, now: Date): BulkWrite {
  switch (action) {
    case "approve":
      return {
        where: { status: { in: ["PENDING_REVIEW", "REJECTED"] } },
        data: { status: "APPROVED" },
      };
    case "reject":
      return {
        where: { status: { in: ["PENDING_REVIEW", "APPROVED"] } },
        data: { status: "REJECTED" },
      };
    case "reset":
      return {
        where: { status: { in: ["APPROVED", "REJECTED"] } },
        data: { status: "PENDING_REVIEW" },
      };
    case "discard":
      return { where: { discardedAt: null }, data: { discardedAt: now } };
    case "restore":
      return { where: { discardedAt: { not: null } }, data: { discardedAt: null } };
  }
}
