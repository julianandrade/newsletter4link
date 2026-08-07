# Article State Freedom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisite:** `docs/superpowers/plans/2026-08-07-sent-edition-snapshot.md` must be complete. Until a sent edition carries its own copy of what went out, everything below rewrites delivered newsletters as a side effect. Do not start this plan first.

**Goal:** An EDITOR can move any article between any state at any time, edit the fields that reach the newsletter, and discard the ones they do not want, from any screen that lists articles.

**Architecture:** Three changes make this possible. The bulk route gains the `reset` action that the client has been sending since RQ-005 and the API never accepted. A `discardedAt` column, not a fourth status, carries "I do not want this", so restoring an article gives back the verdict it had. The tenant client hides discarded rows from list reads in one place, rather than at the twenty call sites that would each have to remember.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7 + PostgreSQL (Supabase), TailwindCSS 4, TypeScript, Vitest.

## Global Constraints

- **No long dashes anywhere.** No em dash (U+2014), en dash (U+2013), horizontal bar (U+2015), or minus sign (U+2212) used as punctuation. Use a comma, a hyphen (`-`), or a colon.
- Dashboard copy is in English. Only generated newsletter content follows the organization's language.
- Every state-changing article route requires `requireOrgContext()` then `requireRole(ctx, "EDITOR")`. A refused caller gets 401 for `Unauthorized:` and 403 for `Forbidden:`, never 500. Copy the error handling shape from `app/api/articles/[id]/approve/route.ts:76-91`.
- An id from another organization answers 404, never 403 and never the row. Distinguishing "not yours" from "does not exist" tells a caller which ids are real elsewhere.
- Tests are pure unit tests under `tests/unit/`, using hand-written fake `db` objects that record their arguments. Follow `tests/unit/candidate-pool.test.ts`.
- Run `npx vitest run` and `npx tsc --noEmit`.
- UI uses the AI Radar vocabulary in `components/radar/`: `RadarButton`, `Tag`, `StatusChip`, `SectionLabel`, `EmptyState`, `LoadError`. Do not introduce raw shadcn buttons on a radar screen.
- Do not run `git stash`, switch branches, or create worktrees.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/articles/bulk-action.ts` (create) | The vocabulary of bulk actions: what a request body must look like, and what each action writes. Pure: no Prisma, no fetch. |
| `tests/unit/article-bulk-action.test.ts` (create) | The above, asserted without a database. |
| `prisma/schema.prisma` (modify, `model Article`) | `discardedAt DateTime?` and its index. |
| `prisma/sql/2026-08-07-article-discard.sql` (create) | The one-off SQL. |
| `app/api/articles/bulk/route.ts` (rewrite) | Applies a parsed action, detaches discarded articles from editions that have not been sent, and reports `affectedIds`. |
| `lib/db/tenant.ts` (modify, the `article` block) | List reads exclude discarded rows unless the caller asks for them by name. |
| `tests/unit/tenant-scoping.test.ts` (modify) | The new rule, asserted alongside the organization rule. |
| `lib/articles/patch-input.ts` (create) | Validates and normalises the editable article fields. Pure. |
| `tests/unit/article-patch-input.test.ts` (create) | The above. |
| `app/api/articles/[id]/route.ts` (modify, `PATCH`) | Uses the validator instead of its two inline `typeof` checks. |
| `components/article/article-state-controls.tsx` (create) | The verdict, undo and discard controls, one component used by every screen that shows an article. |
| `app/dashboard/articles/[id]/page.tsx` (modify) | Mounts the controls. |
| `app/dashboard/articles/page.tsx` (create) | The list of every article in every state, with a state filter. The only screen from which a REJECTED or discarded article is reachable at all. |
| `app/api/articles/route.ts` (create) | Backs the above: a tenant-scoped list with a state filter. |

---

### Task 1: The bulk action vocabulary, and the discard column

**Files:**
- Create: `lib/articles/bulk-action.ts`
- Create: `prisma/sql/2026-08-07-article-discard.sql`
- Modify: `prisma/schema.prisma` (`model Article`, after the `status` field at line 250)
- Test: `tests/unit/article-bulk-action.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type BulkAction = "approve" | "reject" | "reset" | "discard" | "restore"`
  - `MAX_BULK_IDS: 1000`
  - `parseBulkRequest(body: unknown): ParsedBulk | BulkError`
  - `writeForAction(action: BulkAction, now: Date): { where: Record<string, unknown>; data: Record<string, unknown> }`

- [ ] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, inside `model Article`, immediately after the `status ArticleStatus @default(PENDING_REVIEW)` line:

```prisma
  /**
   * When an editor said they did not want this at all. Null means they did not.
   *
   * A column rather than a fourth ArticleStatus, for two reasons. Restoring returns the
   * article to the verdict it already had, which a status would have overwritten and lost.
   * And the two questions are genuinely independent: an approved article can be discarded,
   * and it is still an approved article when it comes back.
   *
   * A soft discard rather than a DELETE, because deduplication is by
   * `@@unique([sourceUrl, organizationId])` and `lib/curation/deduplicator.ts` looks the row
   * up on that key. A deleted row stops matching, so the next collection run recreates the
   * article and the same unwanted story arrives every week for ever.
   */
  discardedAt DateTime?
```

And add to the index block near line 263:

```prisma
  @@index([discardedAt])
```

- [ ] **Step 2: Write the one-off SQL**

Create `prisma/sql/2026-08-07-article-discard.sql`:

```sql
-- The soft discard. See lib/articles/bulk-action.ts and prisma/schema.prisma.
--
-- Nullable with no default: every existing article was not discarded, and null says so.
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "discardedAt" TIMESTAMP(3);

-- Every list read filters on this, so it earns an index.
CREATE INDEX IF NOT EXISTS "Article_discardedAt_idx" ON "Article" ("discardedAt");
```

- [ ] **Step 3: Apply the schema and regenerate the client**

Run: `npx prisma db push && npx prisma generate`
Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Write the failing test**

Create `tests/unit/article-bulk-action.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_BULK_IDS,
  parseBulkRequest,
  writeForAction,
} from "@/lib/articles/bulk-action";

/**
 * RQ-005 specified `reset` and the route was never given it, so every Undo in the product
 * has been answering 400 since the day the toast shipped. Nothing tested this route at all.
 * These are its rules, in the one place they can be asserted without a database.
 */

const ok = (body: unknown) => {
  const parsed = parseBulkRequest(body);
  if ("error" in parsed) throw new Error(`expected a parse, got: ${parsed.error}`);
  return parsed;
};

const err = (body: unknown) => {
  const parsed = parseBulkRequest(body);
  if (!("error" in parsed)) throw new Error("expected a refusal, got a parse");
  return parsed.error;
};

describe("parseBulkRequest", () => {
  it("accepts every action the product can take", () => {
    for (const action of ["approve", "reject", "reset", "discard", "restore"] as const) {
      expect(ok({ action, ids: ["a"] }).action).toBe(action);
    }
  });

  it("names the allowed actions when refusing an unknown one", () => {
    // The message is the whole diagnosis when a client and a route disagree, which is
    // exactly how `reset` went unnoticed.
    expect(err({ action: "archive", ids: ["a"] })).toContain("reset");
    expect(err({ action: "archive", ids: ["a"] })).toContain("discard");
  });

  it("refuses a missing or empty selection", () => {
    expect(err({ action: "approve" })).toContain("non-empty array");
    expect(err({ action: "approve", ids: [] })).toContain("non-empty array");
    expect(err({ action: "approve", ids: "a" })).toContain("non-empty array");
  });

  it("refuses an id that is not a non-empty string", () => {
    expect(err({ action: "approve", ids: ["a", ""] })).toContain("non-empty string");
    expect(err({ action: "approve", ids: ["a", 7] })).toContain("non-empty string");
    expect(err({ action: "approve", ids: ["a", null] })).toContain("non-empty string");
  });

  it("survives a body that is not an object at all", () => {
    expect(err(null)).toBeTruthy();
    expect(err("approve")).toBeTruthy();
    expect(err([])).toBeTruthy();
  });

  it("deduplicates the selection", () => {
    expect(ok({ action: "approve", ids: ["a", "b", "a"] }).ids).toEqual(["a", "b"]);
  });

  it("refuses more than the ceiling, counted after deduplication", () => {
    const ids = Array.from({ length: MAX_BULK_IDS + 1 }, (_, i) => `id-${i}`);

    expect(err({ action: "approve", ids })).toContain(String(MAX_BULK_IDS));
    // The duplicate does not count against the ceiling, because it is one write.
    expect(ok({ action: "approve", ids: [...ids.slice(0, MAX_BULK_IDS), "id-0"] }).ids)
      .toHaveLength(MAX_BULK_IDS);
  });
});

describe("writeForAction", () => {
  const now = new Date("2026-08-07T10:00:00.000Z");

  it("approve and reject only touch what is still awaiting a decision", () => {
    // Without the guard a stale selection flips an article another reviewer has already
    // decided, and the reported count hides it.
    expect(writeForAction("approve", now)).toEqual({
      where: { status: "PENDING_REVIEW" },
      data: { status: "APPROVED" },
    });
    expect(writeForAction("reject", now)).toEqual({
      where: { status: "PENDING_REVIEW" },
      data: { status: "REJECTED" },
    });
  });

  it("reset takes a decided article back to awaiting a decision", () => {
    // The inverse of the two above, so it must match exactly what they can produce and
    // nothing else: resetting an article that was never decided is a no-op, not an error.
    expect(writeForAction("reset", now)).toEqual({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
      data: { status: "PENDING_REVIEW" },
    });
  });

  it("discard stamps the time and only touches what is not already discarded", () => {
    expect(writeForAction("discard", now)).toEqual({
      where: { discardedAt: null },
      data: { discardedAt: now },
    });
  });

  it("restore clears it, and leaves the verdict alone", () => {
    // The point of a column rather than a fourth status: an approved article that was
    // discarded comes back approved.
    expect(writeForAction("restore", now)).toEqual({
      where: { discardedAt: { not: null } },
      data: { discardedAt: null },
    });
  });

  it("no action ever writes both a status and a discard", () => {
    for (const action of ["approve", "reject", "reset", "discard", "restore"] as const) {
      const { data } = writeForAction(action, now);
      expect("status" in data && "discardedAt" in data).toBe(false);
    }
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run tests/unit/article-bulk-action.test.ts`
Expected: FAIL, with a resolution error on `@/lib/articles/bulk-action`.

- [ ] **Step 6: Write the implementation**

Create `lib/articles/bulk-action.ts`:

```ts
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
 * `reset` accepts exactly the two states the verdicts produce. Resetting something already
 * awaiting a decision is a no-op rather than an error, because a double-clicked Undo must
 * not read as a failure.
 */
export function writeForAction(action: BulkAction, now: Date): BulkWrite {
  switch (action) {
    case "approve":
      return { where: { status: "PENDING_REVIEW" }, data: { status: "APPROVED" } };
    case "reject":
      return { where: { status: "PENDING_REVIEW" }, data: { status: "REJECTED" } };
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
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run tests/unit/article-bulk-action.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add lib/articles/bulk-action.ts tests/unit/article-bulk-action.test.ts prisma/schema.prisma prisma/sql/2026-08-07-article-discard.sql
git commit -m "Articles: the five bulk actions, and a discard that keeps the verdict"
```

---

### Task 2: The bulk route, on top of the vocabulary

**Files:**
- Modify: `app/api/articles/bulk/route.ts` (full rewrite of the handler body)
- Test: `tests/unit/article-bulk-apply.test.ts` (create)

**Interfaces:**
- Consumes: `parseBulkRequest`, `writeForAction`, `ParsedBulk` from Task 1.
- Produces:
  - `applyBulk(db: TenantClient, parsed: ParsedBulk, now: Date): Promise<BulkOutcome>` in a new `lib/articles/bulk-apply.ts`. It needs a database, so it goes in its own module rather than in `bulk-action.ts`, which stays pure.
  - `interface BulkOutcome { affected: number; affectedIds: string[]; skipped: number; detachedFrom: number }`
  - The route's response body: `{ success: true, action, requested, affected, affectedIds, skipped, detachedFrom }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/article-bulk-apply.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyBulk } from "@/lib/articles/bulk-apply";

/**
 * What the route does with a parsed action. The interesting parts are the two things the
 * old route got wrong: it never reported which ids it changed, so the client's Undo acted
 * on the whole selection including the rows somebody else had already decided; and nothing
 * detached a discarded article from an edition that had not gone out yet.
 */

function fakeDb(options: {
  matching?: string[];
  editions?: Array<{ id: string }>;
} = {}) {
  const calls: Record<string, any> = {};

  return {
    calls,
    db: {
      organizationId: "org-1",
      article: {
        findMany: async (args: any) => {
          calls.articleFindMany = args;
          return (options.matching ?? []).map((id) => ({ id }));
        },
        updateMany: async (args: any) => {
          calls.articleUpdateMany = args;
          return { count: (options.matching ?? []).length };
        },
      },
      edition: {
        findMany: async (args: any) => {
          calls.editionFindMany = args;
          return options.editions ?? [];
        },
      },
      editionArticle: {
        deleteMany: async (args: any) => {
          calls.editionArticleDeleteMany = args;
          return { count: 1 };
        },
      },
    } as any,
  };
}

const now = new Date("2026-08-07T10:00:00.000Z");

describe("applyBulk", () => {
  it("reports the ids it actually changed, not the ids it was asked about", async () => {
    // The client's Undo is built on this. Reporting the whole selection is how an undo
    // reopens a verdict another reviewer took in between.
    const { db } = fakeDb({ matching: ["a", "c"] });

    const result = await applyBulk(db, { action: "approve", ids: ["a", "b", "c"] }, now);

    expect(result.affectedIds).toEqual(["a", "c"]);
    expect(result.affected).toBe(2);
    expect(result.skipped).toBe(1);
  });

  it("selects the matching ids before writing, so the report is not a guess", async () => {
    const { db, calls } = fakeDb({ matching: ["a"] });

    await applyBulk(db, { action: "approve", ids: ["a", "b"] }, now);

    expect(calls.articleFindMany.where).toEqual({
      id: { in: ["a", "b"] },
      status: "PENDING_REVIEW",
    });
    expect(calls.articleUpdateMany.where).toEqual({ id: { in: ["a"] } });
    expect(calls.articleUpdateMany.data).toEqual({ status: "APPROVED" });
  });

  it("writes nothing when the guard matched nothing", async () => {
    const { db, calls } = fakeDb({ matching: [] });

    const result = await applyBulk(db, { action: "reset", ids: ["a"] }, now);

    expect(result.affected).toBe(0);
    expect(result.skipped).toBe(1);
    expect(calls.articleUpdateMany).toBeUndefined();
  });

  it("detaches a discarded article from editions that have not been sent", async () => {
    const { db, calls } = fakeDb({ matching: ["a"], editions: [{ id: "ed-1" }] });

    const result = await applyBulk(db, { action: "discard", ids: ["a"] }, now);

    expect(calls.editionFindMany.where.status).toEqual({ not: "SENT" });
    expect(calls.editionArticleDeleteMany.where).toEqual({
      editionId: { in: ["ed-1"] },
      articleId: { in: ["a"] },
    });
    expect(result.detachedFrom).toBe(1);
  });

  it("resolves the edition ids through the scoped client, never from the request", async () => {
    // editionArticle.deleteMany is not organization-scoped by the tenant client and cannot
    // be, so the ids it is given must have come back from db.edition.findMany.
    const { db, calls } = fakeDb({ matching: ["a"], editions: [{ id: "ed-1" }] });

    await applyBulk(db, { action: "discard", ids: ["a"] }, now);

    expect(calls.editionFindMany).toBeDefined();
    expect(calls.editionArticleDeleteMany.where.editionId.in).toEqual(["ed-1"]);
  });

  it("leaves sent editions alone, because their snapshot is the record", async () => {
    const { db, calls } = fakeDb({ matching: ["a"], editions: [] });

    const result = await applyBulk(db, { action: "discard", ids: ["a"] }, now);

    expect(calls.editionArticleDeleteMany).toBeUndefined();
    expect(result.detachedFrom).toBe(0);
  });

  it("does not touch editions for any action other than discard", async () => {
    for (const action of ["approve", "reject", "reset", "restore"] as const) {
      const { db, calls } = fakeDb({ matching: ["a"], editions: [{ id: "ed-1" }] });

      await applyBulk(db, { action, ids: ["a"] }, now);

      expect(calls.editionFindMany).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/article-bulk-apply.test.ts`
Expected: FAIL, with a resolution error on `@/lib/articles/bulk-apply`.

- [ ] **Step 3: Write the implementation**

Create `lib/articles/bulk-apply.ts`:

```ts
import type { TenantClient } from "@/lib/db/tenant";
import { writeForAction, type ParsedBulk } from "./bulk-action";

/**
 * Applying a parsed bulk action, and reporting honestly what it did.
 *
 * Two reads and one write rather than a single `updateMany`, because `updateMany` returns a
 * count and the client needs the ids: an undo built on the requested selection reopens the
 * verdicts another reviewer took in between, which is precisely the bug the RQ-005 spec
 * called out when it asked for `affectedIds` and never got it.
 *
 * Not a transaction. The window between the select and the write is small, and a lost race
 * costs one article a redundant write of the value it already holds. A transaction here
 * would hold a lock across a thousand-row selection for no gain.
 */
export interface BulkOutcome {
  affected: number;
  affectedIds: string[];
  skipped: number;
  /** Editions a discarded article was pulled out of. Always 0 for other actions. */
  detachedFrom: number;
}

export async function applyBulk(
  db: TenantClient,
  parsed: ParsedBulk,
  now: Date
): Promise<BulkOutcome> {
  const { where, data } = writeForAction(parsed.action, now);

  // Scoped by the tenant client, so ids from another organization simply do not match and
  // are reported as skipped rather than refused, which would confirm they exist.
  const matching = await db.article.findMany({
    where: { id: { in: parsed.ids }, ...where },
    select: { id: true },
  });

  const affectedIds = matching.map((row) => row.id);

  if (affectedIds.length === 0) {
    return {
      affected: 0,
      affectedIds: [],
      skipped: parsed.ids.length,
      detachedFrom: 0,
    };
  }

  await db.article.updateMany({
    // The guard already ran in the select above, so repeating it here would only reopen
    // the race it cannot close.
    where: { id: { in: affectedIds } },
    data: data as never,
  });

  const detachedFrom =
    parsed.action === "discard" ? await detachFromOpenEditions(db, affectedIds) : 0;

  return {
    affected: affectedIds.length,
    affectedIds,
    skipped: parsed.ids.length - affectedIds.length,
    detachedFrom,
  };
}

/**
 * Pull discarded articles out of every edition that has not gone out.
 *
 * A sent edition is deliberately left alone: it carries its own snapshot of what it
 * contained (`lib/editions/sent-snapshot.ts`), so removing the join row changes nothing a
 * reader will ever see, and leaving it is the smaller action.
 *
 * The edition ids come back from `db.edition.findMany`, which is organization-scoped.
 * `db.editionArticle.deleteMany` is not scoped and cannot be, since the join table has no
 * organizationId of its own, so ids reaching it must have been resolved this way and never
 * taken from a request body.
 */
async function detachFromOpenEditions(
  db: TenantClient,
  articleIds: string[]
): Promise<number> {
  const open = await db.edition.findMany({
    where: {
      status: { not: "SENT" },
      articles: { some: { articleId: { in: articleIds } } },
    },
    select: { id: true },
  });

  if (open.length === 0) return 0;

  await db.editionArticle.deleteMany({
    where: {
      editionId: { in: open.map((edition) => edition.id) },
      articleId: { in: articleIds },
    },
  });

  return open.length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/article-bulk-apply.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Rewrite the route on top of it**

Replace the whole of `app/api/articles/bulk/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { requireOrgContext, requireRole } from "@/lib/auth/context";
import { parseBulkRequest } from "@/lib/articles/bulk-action";
import { applyBulk } from "@/lib/articles/bulk-apply";

/**
 * PATCH /api/articles/bulk
 *
 * Approve, reject, reset, discard or restore a whole selection in one request. A queue
 * after a big collection run is hundreds of items long, and deciding them individually is
 * the reason the queue never gets cleared.
 *
 * Body: { action: "approve" | "reject" | "reset" | "discard" | "restore", ids: string[] }
 *
 * Two defects this replaces. `reset` was specified by RQ-005, implemented on the client and
 * never added here, so every Undo in the product answered 400 from the day it shipped. And
 * the route required only organization membership, so a VIEWER, whose whole definition is
 * that they decide nothing, could approve or reject the entire queue.
 *
 * The vocabulary and the writes live in `lib/articles/bulk-action.ts` and
 * `lib/articles/bulk-apply.ts`, where they are unit tested. This handler is the HTTP shell.
 */
export async function PATCH(request: Request) {
  try {
    const ctx = await requireOrgContext();
    requireRole(ctx, "EDITOR");

    const body = await request.json().catch(() => null);
    const parsed = parseBulkRequest(body);

    if ("error" in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }

    const outcome = await applyBulk(ctx.db, parsed, new Date());

    return NextResponse.json({
      success: true,
      action: parsed.action,
      requested: parsed.ids.length,
      ...outcome,
    });
  } catch (error) {
    console.error("Error applying bulk article action:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }

    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { success: false, error: "Failed to apply the bulk action" },
      { status: 500 }
    );
  }
}
```

Note the response now carries `success: true`, which the client at `components/proposal/use-queue-actions.ts:53` and `:117` already checks for and the old route already returned. No client change is needed for that. The old route returned `{ error }` without `success: false` on its 400s; the client reads `json?.error`, so both shapes work.

- [ ] **Step 6: Run the whole suite and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 7: Verify the Undo actually works**

Run: `npm run dev`, open `/dashboard?view=queue`, approve one story, and click Undo in the toast that follows.
Expected: the toast reads "Back in the queue, awaiting a decision" and the story reappears in the list at the position it left. Before this task the same click produced "That decision could not be undone".

- [ ] **Step 8: Commit**

```bash
git add app/api/articles/bulk/route.ts lib/articles/bulk-apply.ts tests/unit/article-bulk-apply.test.ts
git commit -m "Articles: the bulk route accepts reset, reports what changed, and requires EDITOR"
```

---

### Task 3: A discarded article leaves every list, in one place

**Files:**
- Modify: `lib/db/tenant.ts:52-99` (the `article` block)
- Modify: `tests/unit/tenant-scoping.test.ts` (add a describe block)
- Modify: `app/api/articles/approved/route.ts:32-47`, `app/api/status/route.ts:24-26`, `app/api/activity/route.ts:68`, `app/api/generation/generate/route.ts:56`, `app/api/email/send-test/route.ts:99`, `lib/inbound/received.ts:177`

**Interfaces:**
- Consumes: the `discardedAt` column from Task 1.
- Produces: a second rule on the tenant client's article reads, documented in its module comment.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/tenant-scoping.test.ts`, before the final closing brace of the file:

```ts
describe("discarded articles are out of every list", () => {
  it("findMany excludes them by default", async () => {
    await db().article.findMany({ where: { status: "APPROVED" } });

    expect(lastCall("findMany").args.where).toEqual({
      discardedAt: null,
      status: "APPROVED",
      organizationId: "org-1",
    });
  });

  it("count excludes them by default, so the counts match the lists", async () => {
    await db().article.count({ where: { status: "APPROVED" } });

    expect(lastCall("count").args.where).toEqual({
      discardedAt: null,
      status: "APPROVED",
      organizationId: "org-1",
    });
  });

  it("a caller that asks for them by name wins", async () => {
    // The discard filter is applied before the caller's where, unlike organizationId which
    // is applied after. The scope is not the caller's to widen; the discard view is.
    await db().article.findMany({ where: { discardedAt: { not: null } } });

    expect(lastCall("findMany").args.where.discardedAt).toEqual({ not: null });
    expect(lastCall("findMany").args.where.organizationId).toBe("org-1");
  });

  it("findFirst and findUnique still find one, so a discarded article can be restored", async () => {
    // The detail screen has to open a discarded article to offer Restore. A lookup by id is
    // never a list, so it is never filtered.
    await db().article.findFirst({ where: { id: "row-1" } });

    expect("discardedAt" in lastCall("findFirst").args.where).toBe(false);
  });

  it("updateMany still reaches one, so restore can write to it", async () => {
    await db().article.updateMany({ where: { id: { in: ["row-1"] } }, data: { x: 1 } });

    expect("discardedAt" in lastCall("updateMany").args.where).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/tenant-scoping.test.ts`
Expected: FAIL on the first two, which get a where clause with no `discardedAt`. The last three pass already and are there to pin the behaviour that must not change.

- [ ] **Step 3: Change the tenant client**

In `lib/db/tenant.ts`, replace the `findMany` and `count` entries of the `article` block (lines 53-57 and 94-98) with:

```ts
      /**
       * Discarded rows are out, unless the caller asks for them by name.
       *
       * Applied *before* the caller's where, which is the opposite of `organizationId`
       * below it. The organization is not the caller's to widen, so it goes last and wins;
       * the discard view is exactly what a "show me what I threw away" screen has to ask
       * for, so it goes first and loses to an explicit `discardedAt`.
       *
       * Here rather than at the twenty article reads across the codebase, because that is
       * twenty chances to forget and one of them is the send route.
       */
      findMany: <T extends Prisma.ArticleFindManyArgs>(args?: T) =>
        prisma.article.findMany({
          ...args,
          where: { discardedAt: null, ...args?.where, organizationId },
        } as T),
```

and

```ts
      count: <T extends Prisma.ArticleCountArgs>(args?: T) =>
        prisma.article.count({
          ...args,
          where: { discardedAt: null, ...args?.where, organizationId },
        } as T),
```

Then extend the module comment at the top of the file, after the paragraph ending "Verified against the database, not assumed.":

```
 * The `article` model carries a second rule: `findMany` and `count` exclude discarded rows.
 * `findFirst`, `findUnique` and `updateMany` do not, because a lookup by id is not a list
 * and restoring a discarded article means writing to one.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/tenant-scoping.test.ts`
Expected: PASS, including the five new tests.

- [ ] **Step 5: Fix the reads that bypass the wrapper**

These use raw Prisma or `db.$raw` and therefore never see the rule. Add `discardedAt: null` to each where clause:

- `app/api/articles/approved/route.ts:34`, inside the `db.$raw.article.findMany` where, immediately after `organizationId: db.organizationId,`
- `app/api/status/route.ts:24-26`, all three `prisma.article.count` calls
- `app/api/activity/route.ts:68`, the `prisma.article.findMany` where
- `app/api/generation/generate/route.ts:56`, the `prisma.article.findMany` where
- `app/api/email/send-test/route.ts:99`, the `prisma.article.findMany` where
- `lib/inbound/received.ts:177`, the `prisma.article.findMany` where

Add this comment above the first one only, and a one-line `// Discarded rows are out. See lib/db/tenant.ts.` above the rest:

```ts
        // Discarded rows are out. This query uses the raw client for its `_count`, so the
        // tenant wrapper's rule does not reach it and the filter is mine to carry.
        discardedAt: null,
```

- [ ] **Step 6: Leave deduplication alone, deliberately**

Do **not** add the filter to `lib/curation/deduplicator.ts`. `isDuplicateByUrl` looks the row up on `sourceUrl_organizationId` and must keep seeing discarded articles: that is the entire reason a discard is soft rather than a DELETE. Discarding a story is how an editor says "never show me this again", and a dedupe that stopped seeing it would recreate the article on the next collection run.

Add this note above `isDuplicateByUrl` in `lib/curation/deduplicator.ts:8`:

```ts
/**
 * Check if an article is a duplicate based on URL (within an organization)
 *
 * Sees discarded articles on purpose. A discard means "never show me this again", and it is
 * soft precisely so this lookup keeps matching; filtering here would recreate the story on
 * the next collection run, every run, for ever.
 */
```

- [ ] **Step 7: Run the whole suite and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add lib/db/tenant.ts tests/unit/tenant-scoping.test.ts app/api/articles/approved/route.ts app/api/status/route.ts app/api/activity/route.ts app/api/generation/generate/route.ts app/api/email/send-test/route.ts lib/inbound/received.ts lib/curation/deduplicator.ts
git commit -m "Articles: a discarded article leaves every list, and stays deduplicated"
```

---

### Task 4: Editing more than the summary

**Files:**
- Create: `lib/articles/patch-input.ts`
- Create: `tests/unit/article-patch-input.test.ts`
- Modify: `app/api/articles/[id]/route.ts:70-93`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseArticlePatch(body: unknown): { data: ArticlePatch } | { error: string }` where `ArticlePatch` may contain `title`, `summary`, `sourceUrl`, `author`, `publishedAt`, `category`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/article-patch-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseArticlePatch } from "@/lib/articles/patch-input";

const ok = (body: unknown) => {
  const parsed = parseArticlePatch(body);
  if ("error" in parsed) throw new Error(`expected a parse, got: ${parsed.error}`);
  return parsed.data;
};

const err = (body: unknown) => {
  const parsed = parseArticlePatch(body);
  if (!("error" in parsed)) throw new Error("expected a refusal, got a parse");
  return parsed.error;
};

describe("parseArticlePatch", () => {
  it("accepts the six editable fields", () => {
    expect(
      ok({
        title: "A model ships",
        summary: "Why it matters.",
        sourceUrl: "https://example.test/a1",
        author: "Someone",
        publishedAt: "2026-08-01T10:00:00.000Z",
        category: ["Models"],
      })
    ).toEqual({
      title: "A model ships",
      summary: "Why it matters.",
      sourceUrl: "https://example.test/a1",
      author: "Someone",
      publishedAt: new Date("2026-08-01T10:00:00.000Z"),
      category: ["Models"],
    });
  });

  it("only includes the fields that were sent", () => {
    // A PATCH that names one field must not blank the other five.
    expect(ok({ summary: "Just this" })).toEqual({ summary: "Just this" });
  });

  it("refuses a body with nothing editable in it", () => {
    expect(err({})).toContain("No valid fields");
    expect(err({ status: "APPROVED" })).toContain("No valid fields");
    expect(err({ relevanceScore: 9 })).toContain("No valid fields");
  });

  it("refuses a title that is blank, because the newsletter renders it", () => {
    expect(err({ title: "   " })).toContain("title");
  });

  it("trims a title and an author", () => {
    expect(ok({ title: "  Spaced  ", author: "  Someone  " })).toEqual({
      title: "Spaced",
      author: "Someone",
    });
  });

  it("clears an author with an empty string, since not every story has one", () => {
    expect(ok({ author: "" })).toEqual({ author: null });
  });

  it("refuses a sourceUrl that is not an http or https URL", () => {
    // The value becomes an href in a mail client. javascript: must never reach one.
    expect(err({ sourceUrl: "javascript:alert(1)" })).toContain("http");
    expect(err({ sourceUrl: "not a url" })).toContain("http");
    expect(err({ sourceUrl: "ftp://example.test/x" })).toContain("http");
    expect(ok({ sourceUrl: "https://example.test/x" }).sourceUrl).toBe(
      "https://example.test/x"
    );
  });

  it("refuses a publishedAt that is not a date, and accepts null to clear it", () => {
    expect(err({ publishedAt: "sometime last week" })).toContain("date");
    expect(ok({ publishedAt: null })).toEqual({ publishedAt: null });
  });

  it("drops blank categories and deduplicates the rest", () => {
    expect(ok({ category: ["Models", "  ", "Models", " Agents "] })).toEqual({
      category: ["Models", "Agents"],
    });
  });

  it("refuses a category array holding something other than strings", () => {
    expect(err({ category: ["Models", 7] })).toContain("category");
  });

  it("survives a body that is not an object", () => {
    expect(err(null)).toBeTruthy();
    expect(err("title")).toBeTruthy();
    expect(err([])).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/article-patch-input.test.ts`
Expected: FAIL, with a resolution error on `@/lib/articles/patch-input`.

- [ ] **Step 3: Write the implementation**

Create `lib/articles/patch-input.ts`:

```ts
/**
 * What an editor may change about an article, and what a valid change looks like.
 *
 * The route accepted `summary` and `category` and nothing else, so a wrong title, a
 * tracking URL where the publisher's link should be, a missing author and the wrong
 * publication date were all uneditable anywhere in the product. All four reach the
 * newsletter.
 *
 * Pure: no Prisma, no fetch. The route owns the tenant scope and the role check.
 */

export interface ArticlePatch {
  title?: string;
  summary?: string;
  sourceUrl?: string;
  author?: string | null;
  publishedAt?: Date | null;
  category?: string[];
}

export interface PatchError {
  error: string;
}

/** http and https only: the value ends up as an href in a mail client. */
function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseArticlePatch(
  body: unknown
): { data: ArticlePatch } | PatchError {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "The request body must be an object" };
  }

  const input = body as Record<string, unknown>;
  const data: ArticlePatch = {};

  if (typeof input.title === "string") {
    const trimmed = input.title.trim();
    // The newsletter renders it and the archive links it. There is no sensible blank.
    if (trimmed.length === 0) return { error: "title cannot be blank" };
    data.title = trimmed;
  }

  if (typeof input.summary === "string") {
    // A blank summary is legitimate: the template falls back to the headline.
    data.summary = input.summary;
  }

  if (typeof input.sourceUrl === "string") {
    const trimmed = input.sourceUrl.trim();
    if (!isSafeUrl(trimmed)) {
      return { error: "sourceUrl must be an http or https URL" };
    }
    data.sourceUrl = trimmed;
  }

  if (typeof input.author === "string") {
    const trimmed = input.author.trim();
    // Empty clears it. Not every story names an author, and there has to be a way back.
    data.author = trimmed.length > 0 ? trimmed : null;
  }

  if (input.publishedAt === null) {
    data.publishedAt = null;
  } else if (typeof input.publishedAt === "string") {
    const parsed = new Date(input.publishedAt);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "publishedAt must be a date, or null to clear it" };
    }
    data.publishedAt = parsed;
  }

  if (Array.isArray(input.category)) {
    if (!input.category.every((value) => typeof value === "string")) {
      return { error: "every category must be a string" };
    }
    const cleaned = (input.category as string[])
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    data.category = [...new Set(cleaned)];
  } else if (input.category !== undefined) {
    return { error: "category must be an array of strings" };
  }

  if (Object.keys(data).length === 0) {
    return {
      error:
        "No valid fields to update. Provide title, summary, sourceUrl, author, publishedAt or category.",
    };
  }

  return { data };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/article-patch-input.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Use it in the route**

In `app/api/articles/[id]/route.ts`, replace lines 70-93, from `const body = await request.json();` through the closing brace of the `if (Object.keys(updateData).length === 0)` block, with:

```ts
    const body = await request.json().catch(() => null);
    const parsed = parseArticlePatch(body);

    if ("error" in parsed) {
      return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });
    }
```

Then change the update on line 113-116 to use `parsed.data`:

```ts
    const article = await db.article.update({
      where: { id },
      data: parsed.data,
    });
```

Add the import at the top:

```ts
import { parseArticlePatch } from "@/lib/articles/patch-input";
```

And extend the handler's doc comment, replacing its first line:

```
 * Update an article's editable fields. EDITOR or above, this organization only.
 *
 * Six fields, not the two it started with: title, summary, sourceUrl, author, publishedAt
 * and category. All six reach the newsletter, and none of the four added here was editable
 * anywhere in the product. Validation lives in `lib/articles/patch-input.ts`.
```

- [ ] **Step 6: Run the whole suite and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add lib/articles/patch-input.ts tests/unit/article-patch-input.test.ts app/api/articles/[id]/route.ts
git commit -m "Articles: the six fields that reach the newsletter are all editable"
```

---

### Task 5: The controls, on one component

**Files:**
- Create: `components/article/article-state-controls.tsx`
- Modify: `app/dashboard/articles/[id]/page.tsx`
- Test: `tests/unit/article-state-controls.test.tsx` (create)

**Interfaces:**
- Consumes: `PATCH /api/articles/bulk` from Task 2, `hasRoleAtLeast` from `lib/auth/roles.ts`, the radar primitives.
- Produces:
  - `nextActionsFor(article: { status: string; discardedAt: string | null }): BulkAction[]`, exported from the component file and unit tested on its own.
  - `<ArticleStateControls article={...} canEdit={boolean} onChanged={() => void} />`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/article-state-controls.test.tsx`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/article-state-controls.test.tsx`
Expected: FAIL, with a resolution error on the component.

- [ ] **Step 3: Write the component**

Create `components/article/article-state-controls.tsx`:

```tsx
"use client";

/**
 * Every state an article can be moved to, from wherever it is shown.
 *
 * Before this, the only controls in the product were Approve and Reject on the queue, which
 * lists PENDING_REVIEW and nothing else. An article that had been decided was decided: the
 * detail screen carried no control at all, the approved pool was read-only, and a rejected
 * article was unreachable. This component is the single answer, mounted by every screen
 * that shows an article.
 *
 * One request shape for all five actions, `PATCH /api/articles/bulk` with a selection of
 * one, so a single verdict and a bulk verdict cannot drift apart the way the old single-id
 * routes did.
 */

import { useState } from "react";
import { toast } from "sonner";
import { RadarButton } from "@/components/radar/primitives";
import type { BulkAction } from "@/lib/articles/bulk-action";

export interface ArticleState {
  status: string;
  discardedAt: string | null;
}

/**
 * The actions worth offering, in the order they should read.
 *
 * A discarded article offers only Restore. Deciding one would be deciding something that is
 * out of every list, so the verdict would be invisible until it came back.
 */
export function nextActionsFor(article: ArticleState): BulkAction[] {
  if (article.discardedAt) return ["restore"];

  switch (article.status) {
    case "APPROVED":
      return ["reject", "reset", "discard"];
    case "REJECTED":
      return ["approve", "reset", "discard"];
    default:
      return ["approve", "reject", "discard"];
  }
}

const LABELS: Record<BulkAction, string> = {
  approve: "Approve",
  reject: "Reject",
  reset: "Back to the queue",
  discard: "Discard",
  restore: "Restore",
};

const DONE: Record<BulkAction, string> = {
  approve: "Approved, and in the pool for an edition",
  reject: "Rejected, and out of the running",
  reset: "Back in the queue, awaiting a decision",
  discard: "Discarded, and out of every list",
  restore: "Restored, with the verdict it had",
};

export function ArticleStateControls({
  article,
  articleId,
  canEdit,
  onChanged,
}: {
  article: ArticleState;
  articleId: string;
  /** RQ-005 AC-6.8: a VIEWER reads and decides nothing. */
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<BulkAction | null>(null);

  if (!canEdit) return null;

  const run = async (action: BulkAction) => {
    setBusy(action);

    try {
      const res = await fetch("/api/articles/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [articleId] }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Could not ${action} that story`);
      }

      if (json.affected === 0) {
        // The guard matched nothing, which means somebody else moved it first. Saying so
        // is better than a success message about a change that did not happen.
        toast.info("Somebody else changed this story first. Reloading it.");
      } else {
        toast.success(
          json.detachedFrom > 0
            ? `${DONE[action]}, and out of ${json.detachedFrom} open ${
                json.detachedFrom === 1 ? "edition" : "editions"
              }`
            : DONE[action]
        );
      }

      onChanged();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : `Could not ${action} that story`
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {nextActionsFor(article).map((action) => (
        <RadarButton
          key={action}
          size="sm"
          variant={action === "approve" || action === "restore" ? "accent" : "default"}
          disabled={busy !== null}
          onClick={() => void run(action)}
          className={
            action === "discard" || action === "reject"
              ? "hover:border-radar-err hover:text-radar-err"
              : undefined
          }
        >
          {busy === action ? "Saving…" : LABELS[action]}
        </RadarButton>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/article-state-controls.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Mount it on the article detail screen**

In `app/dashboard/articles/[id]/page.tsx`:

1. Add `import { ArticleStateControls } from "@/components/article/article-state-controls";`
2. Ensure the article fetched by the screen carries `status` and `discardedAt`. `GET /api/articles/:id` returns the whole row through `getArticleById`, so both arrive with no route change.
3. Render the controls in the screen's header block, beside the title:

```tsx
<ArticleStateControls
  article={{ status: article.status, discardedAt: article.discardedAt }}
  articleId={article.id}
  canEdit={canEdit}
  onChanged={() => void reload()}
/>
```

Use the screen's existing reload function for `onChanged`, and its existing role hook for `canEdit`. `components/proposal/use-can-edit.ts` is the hook the other screens use.

4. Above the controls, show the current state so the buttons read as a change from something:

```tsx
{article.discardedAt ? (
  <StatusChip tone="neutral">discarded</StatusChip>
) : article.status === "APPROVED" ? (
  <StatusChip tone="ok">approved</StatusChip>
) : article.status === "REJECTED" ? (
  <StatusChip tone="err">rejected</StatusChip>
) : (
  <StatusChip tone="warn">no verdict yet</StatusChip>
)}
```

Import `StatusChip` from `@/components/radar/primitives`.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`, open an approved article's detail page from a headline link.
Expected: the chip reads "approved" and three buttons offer Reject, Back to the queue, and Discard. Click Back to the queue; the chip becomes "no verdict yet" and the buttons become Approve, Reject, Discard.

- [ ] **Step 7: Commit**

```bash
git add components/article/article-state-controls.tsx tests/unit/article-state-controls.test.tsx app/dashboard/articles/[id]/page.tsx
git commit -m "Articles: every state is reachable from the article itself"
```

---

### Task 6: A screen that shows every article, in every state

**Files:**
- Create: `app/api/articles/route.ts`
- Create: `app/dashboard/articles/page.tsx`
- Test: `tests/unit/article-list-filter.test.ts` (create)
- Modify: `app/dashboard/layout.tsx` (navigation entry)

**Interfaces:**
- Consumes: `ArticleStateControls` and `nextActionsFor` from Task 5, `useSelection` and `BulkBar` from `components/radar/selection`.
- Produces:
  - `articleListWhere(params: { state: string | null; search: string | null }): Record<string, unknown>` in `lib/articles/list-filter.ts` (create), pure and unit tested.
  - `GET /api/articles?state=pending|approved|rejected|discarded|all&search=`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/article-list-filter.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/article-list-filter.test.ts`
Expected: FAIL, with a resolution error on `@/lib/articles/list-filter`.

- [ ] **Step 3: Write the filter**

Create `lib/articles/list-filter.ts`:

```ts
/**
 * The where clause behind the all-articles screen.
 *
 * Kept out of the route so the mapping from a query string to a filter is testable, and
 * because the `discarded` case is subtle: it works by naming `discardedAt` explicitly,
 * which is the one thing that overrides the tenant client's default exclusion. See the
 * `article` block in `lib/db/tenant.ts`.
 */

export type ArticleListState = "pending" | "approved" | "rejected" | "discarded" | "all";

const STATUS_BY_STATE: Record<string, string> = {
  pending: "PENDING_REVIEW",
  approved: "APPROVED",
  rejected: "REJECTED",
};

export function articleListWhere(params: {
  state: string | null;
  search: string | null;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (params.state && STATUS_BY_STATE[params.state]) {
    where.status = STATUS_BY_STATE[params.state];
  } else if (params.state === "discarded") {
    // Naming the column is what beats the wrapper's default. Nothing else here does.
    where.discardedAt = { not: null };
  }

  const search = params.search?.trim();
  if (search) {
    where.title = { contains: search, mode: "insensitive" };
  }

  return where;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/article-list-filter.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the route**

Create `app/api/articles/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { articleListWhere } from "@/lib/articles/list-filter";

export const dynamic = "force-dynamic";

/**
 * GET /api/articles?state=pending|approved|rejected|discarded|all&search=
 *
 * Every article in this organization, in whatever state. The product had no such route:
 * `pending` and `approved` each had their own, and a REJECTED or discarded article was not
 * reachable from anywhere, which is why a rejection could not be undone from any screen.
 *
 * A read, so membership is enough. The writes behind the buttons on this screen go through
 * PATCH /api/articles/bulk, which requires EDITOR.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { db } = await requireOrgContext();

    const articles = await db.article.findMany({
      where: articleListWhere({
        state: searchParams.get("state"),
        search: searchParams.get("search"),
      }),
      // Finding C1: nulls last, then the capture time. Mirrors the pending route.
      orderBy: [
        { publishedAt: { sort: "desc", nulls: "last" } },
        { capturedAt: "desc" },
      ],
      take: 200,
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        author: true,
        publishedAt: true,
        capturedAt: true,
        relevanceScore: true,
        summary: true,
        category: true,
        status: true,
        discardedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: articles, count: articles.length });
  } catch (error) {
    console.error("Error listing articles:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { success: false, error: "Failed to list the articles" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 6: Write the screen**

Create `app/dashboard/articles/page.tsx` as a client component that:

1. Holds `state` in a `useState<ArticleListState>("all")` and `search` in a debounced input.
2. Fetches `/api/articles?state=${state}&search=${search}` on every change, with a loading and an error branch. Use `SkeletonRows` while loading, `LoadError` with `onRetry` on failure, and `EmptyState` when the list is empty, all from `@/components/radar/controls`.
3. Renders a filter strip of five `RadarButton`s, one per state, with the active one in `variant="accent"`. Label them: All, Awaiting a decision, Approved, Rejected, Discarded.
4. Renders each article as a row carrying `SourceStamp`, `ArticleTitleLink`, `ScoreMeter`, its topic `Tag`s, a `StatusChip` for its state using the same mapping as Task 5 Step 5, and `<ArticleStateControls>`.
5. Supports selection with `useSelection(articles.map(a => a.id))` and a `BulkBar` whose actions are the five bulk actions, each posting `PATCH /api/articles/bulk` with the selected ids. Follow the pattern in `components/proposal/queue-view.tsx:117-142`.
6. Puts a confirmation `Dialog` in front of the bulk Reject and the bulk Discard, and none in front of Approve, Reset or Restore. Copy the dialog from `components/proposal/queue-view.tsx:583-624`, changing the wording. The reason a bulk removal asks first is on record: 23 curated stories were lost to one unconfirmed click.
7. Reloads the list after any successful action.

- [ ] **Step 7: Add it to the navigation**

In `app/dashboard/layout.tsx`, add an entry pointing at `/dashboard/articles`, labelled `Articles`, next to the existing entries. Match the shape of the entries already there.

- [ ] **Step 8: Verify in the browser**

Run: `npm run dev` and open `/dashboard/articles`.
Expected, in order:
1. The All filter lists articles in every state except discarded, each with a state chip.
2. Rejected lists rejected articles, and each one offers Approve, Back to the queue, and Discard.
3. Discarding one removes it from every filter except Discarded.
4. Discarded lists it, offering only Restore, and Restore returns it with the verdict it had.
5. The queue at `/dashboard?view=queue` never shows a discarded article.

- [ ] **Step 9: Run the whole suite and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: both clean.

- [ ] **Step 10: Commit**

```bash
git add lib/articles/list-filter.ts tests/unit/article-list-filter.test.ts app/api/articles/route.ts app/dashboard/articles/page.tsx app/dashboard/layout.tsx
git commit -m "Articles: one screen for every article, in every state"
```

---

## Self-Review

**Spec coverage.** The ask was: edit, delete, approve, undo and discard an article in any state, as ADMIN or EDITOR, with sent newsletters as the only immutable record. Task 2 gives undo and every other transition. Task 1 and Task 3 give discard and make it stick without breaking deduplication. Task 4 gives editing beyond the summary. Task 5 puts the controls on the article. Task 6 makes a rejected or discarded article reachable at all, which nothing in the product currently does. The immutable record is the prerequisite plan.

**Role choice, stated.** Every write requires EDITOR, not ADMIN. The user asked for "admin ou até editor", and EDITOR is the lower bar of the two, so requiring it grants both. `ROLE_ORDER` in `lib/auth/roles.ts` is `VIEWER, EDITOR, ADMIN, OWNER` and `hasRoleAtLeast` is inclusive upward.

**Deliberate omission.** There is no hard DELETE anywhere in this plan. The decision was a soft discard, and adding a second destructive path would give two ways to remove an article with different consequences for deduplication. If a row genuinely has to leave the database later, that is a separate, ADMIN-only decision with its own confirmation.

**Known interaction with the prerequisite, and why it does not matter here.** Discarding an article that appeared in an edition sent *before* the snapshot column existed still removes it from that edition's archive rendering, because there is no snapshot to fall back on. The product has never gone to real recipients and every existing edition is test data Julian intends to wipe, so this needs no mitigation. Task 2's `detachFromOpenEditions` still deliberately leaves sent editions alone, because that is the correct behaviour once snapshots exist.

**Type consistency check.** `BulkAction` is defined once in `lib/articles/bulk-action.ts` and imported by `bulk-apply.ts`, the route, and the controls component. `nextActionsFor` returns `BulkAction[]`, and `LABELS` and `DONE` are `Record<BulkAction, string>`, so adding a sixth action fails the typecheck in three places rather than silently rendering nothing.
