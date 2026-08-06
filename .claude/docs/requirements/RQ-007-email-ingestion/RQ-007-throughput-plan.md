# Email ingest throughput: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Saved here rather than under `docs/superpowers/plans/` because this repository keeps
> requirement work beside its requirement: this is RQ-007's ingest job, and
> `docs/0-work/` is off limits per `CLAUDE.md`.

**Goal:** Stop the 300-second function ceiling from bounding how many inbound emails one
run can ingest, so a normal day finishes in under a minute and a backlog drains in one
cron firing instead of over days.

**Architecture:** Two independent changes. First, bounded concurrency in both phases of
`runEmailIngestion`: the work is network-bound and sequential for no reason, which is the
actual defect. Second, a wall-clock budget with an atomic row claim and a chained
self-invocation, so a run stops cleanly before the platform kills it and hands the
remainder to a fresh invocation. The first makes the normal day trivial; the second makes
recovery bounded by work rather than by calendar days.

**Tech Stack:** Next.js 16 App Router route handlers, Prisma 7 against Supabase Postgres,
Vitest. `after()` from `next/server` for the post-response continuation. No new
dependencies.

## Global Constraints

- **No new npm dependencies.** The local convention for bounded concurrency is the chunked
  batch in `lib/ai/embeddings.ts:94-106`; generalise it rather than adding `p-limit`.
- **Cron schedules stay daily or coarser.** This project's Vercel plan rejects a sub-daily
  schedule **at build time**, which silently broke every deploy for eleven hours on
  5 August 2026. Do not touch `vercel.json` schedules.
- **`maxDuration` stays 300.** It is the plan ceiling, not a tuning knob.
- **No long dashes in any output**, per the user's global convention: comma, hyphen, or
  colon instead. Applies to code comments, commit messages and docs.
- **Every module gets an `RQ-007` tag** in its header comment, matching the 239 existing
  code tags.
- **Concurrency values live in `config.emailIngest`**, next to the other bounds, with the
  measurement that justifies them in the comment.
- **Measured baseline, for the comments and for judging the result:** extraction call 20 to
  25 seconds on a 32000-character prompt; 3 to 7 seconds per digest item; morningbrew 16
  items in 71s, theresanaiforthat about 20 items in 129s, therundown 3 items in 46s. One
  email costs 25s + items × 5s today.

---

### Task 1: A bounded-concurrency helper

**Files:**
- Create: `lib/concurrency.ts`
- Test: `tests/unit/concurrency.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>` — results in input order; rejects if any task rejects, matching `Promise.all`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/concurrency";

describe("mapWithConcurrency", () => {
  it("returns results in input order, not completion order", async () => {
    const items = [30, 10, 20, 0];
    const result = await mapWithConcurrency(items, 2, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return ms;
    });
    expect(result).toEqual([30, 10, 20, 0]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return null;
    });

    expect(peak).toBe(4);
  });

  it("is faster than sequential for network-shaped work", async () => {
    const started = Date.now();
    await mapWithConcurrency(Array.from({ length: 8 }, (_, i) => i), 4, async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return null;
    });
    // Eight items of 25ms at four at a time is two waves, about 50ms. Sequential is 200ms.
    expect(Date.now() - started).toBeLessThan(150);
  });

  it("passes the index, so a caller can label its work", async () => {
    const seen: number[] = [];
    await mapWithConcurrency(["a", "b", "c"], 2, async (_item, index) => {
      seen.push(index);
      return null;
    });
    expect(seen.sort()).toEqual([0, 1, 2]);
  });

  it("rejects when a task rejects, like Promise.all", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("item two failed");
        return n;
      })
    ).rejects.toThrow("item two failed");
  });

  it("handles an empty list without calling the worker", async () => {
    let calls = 0;
    const result = await mapWithConcurrency([], 4, async () => {
      calls += 1;
      return null;
    });
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it("treats a limit below one as one, rather than stalling", async () => {
    const result = await mapWithConcurrency([1, 2], 0, async (n) => n);
    expect(result).toEqual([1, 2]);
  });

  it("does not run more workers than there are items", async () => {
    let peak = 0;
    let running = 0;
    await mapWithConcurrency([1, 2], 10, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return null;
    });
    expect(peak).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/concurrency.test.ts`
Expected: FAIL, cannot resolve `@/lib/concurrency`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * RQ-007: run an async function over a list, a few at a time.
 *
 * The email ingest was sequential in both phases and its work is almost entirely waiting:
 * a DNS lookup and a HEAD per redirect hop, an embedding call, a scoring call. Measured on
 * 6 August 2026, one newsletter cost 25 seconds of extraction plus 3 to 7 seconds per item,
 * one item at a time, so a single email with twenty items took over two minutes and the
 * 300-second function ceiling bounded a run to two emails.
 *
 * A pool of workers rather than chunks. The chunked form in `lib/ai/embeddings.ts` waits
 * for the slowest item in each chunk before starting the next, which on work this uneven
 * leaves most of the window idle: one 25-second redirect chain stalls nineteen fast ones.
 *
 * Rejects if any task rejects, which is `Promise.all` semantics and is deliberate: the
 * ingest already relies on a throw reaching the per-email catch that marks the row FAILED.
 * Tasks already in flight run to completion, so a partial batch may have written rows.
 * That is safe here because re-processing a row cannot duplicate an article: the curator
 * checks by URL and by embedding first.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workers = Math.max(1, Math.min(Math.trunc(limit) || 1, items.length));

  let next = 0;

  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        results[index] = await fn(items[index], index);
      }
    })
  );

  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/concurrency.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/concurrency.ts tests/unit/concurrency.test.ts
git commit -m "Concurrency: a worker pool, because the ingest waits far more than it works"
```

---

### Task 2: Concurrency values in config

**Files:**
- Modify: `lib/config.ts:69-100` (the `emailIngest` block)
- Test: `tests/unit/ingest-concurrency-config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `config.emailIngest.emailConcurrency` (number) and `config.emailIngest.itemConcurrency` (number).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";

/**
 * The two limits multiply into outbound calls in flight, so the product is the number
 * that matters, not either one alone.
 */
describe("the ingest concurrency limits", () => {
  it("are set", () => {
    expect(config.emailIngest.emailConcurrency).toBeGreaterThan(1);
    expect(config.emailIngest.itemConcurrency).toBeGreaterThan(1);
  });

  it("keep the worst case in flight modest, because two providers are rate limited", () => {
    const worstCase =
      config.emailIngest.emailConcurrency * config.emailIngest.itemConcurrency;
    expect(worstCase).toBeLessThanOrEqual(16);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ingest-concurrency-config.test.ts`
Expected: FAIL, `expected undefined to be greater than 1`.

- [ ] **Step 3: Write minimal implementation**

Add to the `emailIngest` object in `lib/config.ts`, after `maxEssayBodyChars`:

```ts
    /**
     * Emails processed at once in phase two.
     *
     * Each one costs an extraction call of 20 to 25 seconds before its items begin, and
     * that call is per email and unavoidable, so this is the limit that decides how many
     * emails a 300-second window holds.
     */
    emailConcurrency: 4,
    /**
     * Items processed at once within one email.
     *
     * A digest item is a redirect chain to unwrap, an embedding and a relevance score,
     * which is 3 to 7 seconds of almost pure waiting.
     *
     * Four times the email limit is sixteen calls in flight at the worst moment, across
     * Anthropic and OpenAI. Both are rate limited per organization, and a 429 here costs
     * an article rather than a retry, so the product is kept small on purpose.
     */
    itemConcurrency: 4,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ingest-concurrency-config.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts tests/unit/ingest-concurrency-config.test.ts
git commit -m "Config: the two ingest concurrency limits, and why their product is the number"
```

---

### Task 3: Parallelise both phases of the ingest

**Files:**
- Modify: `lib/inbound/process.ts` — `fetchPendingContent` (lines 53-101), the phase-two email loop in `runEmailIngestion` (lines 138-201), and the digest item loop in `ingestForSource` (lines 266-300)
- Test: `tests/unit/inbound-process-order.test.ts`

**Interfaces:**
- Consumes: `mapWithConcurrency` from Task 1; `config.emailIngest.emailConcurrency` and `.itemConcurrency` from Task 2.
- Produces: no signature changes. `runEmailIngestion(options)` and `IngestResult` keep their shapes so the route and its tests are untouched.

**Why this is one task rather than three:** all three loops mutate the same
`IngestResult` accumulator, and making one concurrent while its neighbours still assume
sequential mutation is the seam where this kind of change breaks. They move together or
not at all.

- [ ] **Step 1: Write the failing test**

The three loops need a database, so the unit test covers the pure part that concurrency
changes: turning per-item outcomes into totals without depending on completion order.
Create `lib/inbound/tally.ts` in step 3 and test it here.

```ts
import { describe, expect, it } from "vitest";
import { tallyItems, type ItemOutcome } from "@/lib/inbound/tally";

/**
 * With a worker pool, items finish out of order. The totals and the notes must not
 * depend on that, or a run's reported numbers would vary between identical inputs.
 */
describe("tallyItems", () => {
  const outcomes: ItemOutcome[] = [
    { created: 1, duplicate: false, note: null },
    { created: 0, duplicate: true, note: null },
    { created: 0, duplicate: false, note: "a1: refused a link (stopped: not allowed)" },
    { created: 1, duplicate: false, note: null },
  ];

  it("sums what was created and what was a duplicate", () => {
    const tally = tallyItems(outcomes);
    expect(tally.created).toBe(2);
    expect(tally.duplicates).toBe(1);
  });

  it("keeps the notes in input order, whatever order the work finished in", () => {
    const shuffled = [outcomes[3], outcomes[0], outcomes[2], outcomes[1]];
    // The caller passes results indexed by input, so tally sees input order either way.
    expect(tallyItems(outcomes).notes).toEqual([
      "a1: refused a link (stopped: not allowed)",
    ]);
    expect(tallyItems(shuffled).notes).toEqual([
      "a1: refused a link (stopped: not allowed)",
    ]);
  });

  it("drops the empty notes rather than carrying nulls into the report", () => {
    expect(tallyItems(outcomes).notes).toHaveLength(1);
  });

  it("returns zeroes for no items, which is a valid digest", () => {
    expect(tallyItems([])).toEqual({ created: 0, duplicates: 0, notes: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/inbound-process-order.test.ts`
Expected: FAIL, cannot resolve `@/lib/inbound/tally`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/inbound/tally.ts`:

```ts
/**
 * RQ-007: per-item outcomes into the numbers a run reports.
 *
 * Extracted when the item loop became a worker pool. Items now finish out of order, and a
 * run's totals must not depend on that: the same email has to report the same numbers
 * every time it is processed, or the report is not evidence of anything.
 */
export interface ItemOutcome {
  created: number;
  duplicate: boolean;
  note: string | null;
}

export interface ItemTally {
  created: number;
  duplicates: number;
  notes: string[];
}

export function tallyItems(outcomes: readonly ItemOutcome[]): ItemTally {
  return {
    created: outcomes.reduce((total, outcome) => total + outcome.created, 0),
    duplicates: outcomes.filter((outcome) => outcome.duplicate).length,
    notes: outcomes
      .map((outcome) => outcome.note)
      .filter((note): note is string => note !== null),
  };
}
```

Then in `lib/inbound/process.ts`:

In `fetchPendingContent`, change only the loop header and keep every line of the body:

```ts
  // Was: for (const email of pending) { ...body... }
  await mapWithConcurrency(
    pending,
    config.emailIngest.emailConcurrency,
    async (email) => {
      // ...the existing body, unchanged, from `const outcome = await fetchEmailContent(...)`
      // down to the closing brace of the `if (exhausted)` note push.
    }
  );
```

The body needs no other edit, and specifically **do not** rewrite the
`result.contentFetched += 1` and `result.notes.push(...)` mutations into returned values as
Task 3's item loop does. They are safe as written: JavaScript is single threaded, so an
increment cannot interleave with another increment, and note order in phase one carries no
meaning. The item loop is different only because its totals are asserted by a test.

Replace the digest `for (const item of extracted.items)` loop in `ingestForSource` with:

```ts
  const outcomes = await mapWithConcurrency(
    extracted.items,
    config.emailIngest.itemConcurrency,
    async (item): Promise<ItemOutcome> => {
      const unwrapped = await unwrapUrl(item.url);

      if (!unwrapped.unwrapped && unwrapped.note?.startsWith("stopped: ")) {
        if (
          unwrapped.note.includes("not a public address") ||
          unwrapped.note.includes("not allowed")
        ) {
          return {
            created: 0,
            duplicate: false,
            note: `${email.id}: refused a link (${unwrapped.note})`,
          };
        }
      }

      const content = item.snippet.length > 0 ? item.snippet : item.title;
      const outcome = await curateArticle(
        unwrapped.url,
        item.title,
        content,
        source.organizationId
      );

      if (outcome.success) return { created: 1, duplicate: false, note: null };
      if (outcome.isDuplicate) return { created: 0, duplicate: true, note: null };
      return {
        created: 0,
        duplicate: false,
        note: `${email.id}: ${item.url} ${outcome.error}`,
      };
    }
  );

  const tally = tallyItems(outcomes);
  const notes = [...droppedNotes, ...tally.notes];
```

where `droppedNotes` is the existing `extracted.dropped.length > 0` note, moved above this
block into an array. Return `{ created: tally.created, duplicates: tally.duplicates, note: notes.length > 0 ? notes.join("; ") : null, failure: null }`.

Replace the phase-two `for (const email of emails)` loop with a `mapWithConcurrency` over
`emails` at `config.emailIngest.emailConcurrency`, moving the existing body verbatim into
the callback. Two things must change inside it:

- The article cap check `if (result.articlesCreated >= config.emailIngest.maxArticlesPerRun)` currently `break`s. A worker pool cannot break a sibling, so it becomes an early `return` from the callback, and `result.cappedOut = true` plus the existing note are set on the first worker to see it. Guard the note with `if (!result.cappedOut)` so it is pushed once.
- Nothing else. The per-email `try`/`catch` stays exactly as it is, including the `FAILED` write, so an unexpected throw still fails that one email and no other.

- [ ] **Step 4: Run the tests and the typecheck**

Run: `npx vitest run tests/unit/inbound-process-order.test.ts && npx tsc --noEmit && npx vitest run`
Expected: the new file passes, `tsc` is silent, and the full suite is green with no fewer
tests than before.

- [ ] **Step 5: Verify against a real email, not only the suite**

The suites do not exercise these loops, so measure the thing itself. Requeue one large
newsletter and time a real run:

```bash
npx tsx scripts/requeue-inbound.ts --empty-processed
# then, with CRON_SECRET set, against the deployed build:
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://newsletter4link.vercel.app/api/cron/email-ingest?limit=1" -w "\n%{time_total}s\n"
```

Expected: the same `articlesCreated` as the sequential run for that email, in
substantially less wall clock. Morning Brew produced 16 items in 71s sequentially; four at
a time should land near 30s. **If the article count differs, stop:** concurrency changed a
result, which means a shared mutation was missed.

- [ ] **Step 6: Commit**

```bash
git add lib/inbound/process.ts lib/inbound/tally.ts tests/unit/inbound-process-order.test.ts
git commit -m "Inbound: process emails and items a few at a time, since the work is all waiting"
```

---

### Task 4: A wall-clock budget, an atomic claim, and a chained continuation

**Files:**
- Modify: `prisma/schema.prisma` — add `claimedAt` to `InboundEmail` (model at line 1021)
- Create: `lib/inbound/claim.ts`
- Modify: `lib/inbound/process.ts` — `runEmailIngestion` takes a deadline and reports whether work remains
- Modify: `app/api/cron/email-ingest/route.ts` — budget, chain depth, self-invocation
- Test: `tests/unit/inbound-claim.test.ts`

**Interfaces:**
- Consumes: `mapWithConcurrency`, `config.emailIngest.*` from Tasks 1 and 2.
- Produces:
  - `CLAIM_LEASE_MS: number` and `claimCutoff(now?: Date): Date` in `lib/inbound/claim.ts`
  - `shouldStop(deadline: number | undefined, now?: number): boolean` in `lib/inbound/claim.ts`
  - `claimEmail(id: string, now?: Date): Promise<boolean>` in `lib/inbound/claim.ts`, importing `prisma` from `@/lib/db` itself rather than taking a client, which is what `lib/inbound/process.ts` already does
  - `runEmailIngestion(options: { limit?: number; deadline?: number })` returning `IngestResult & { moreWork: boolean }`
  - In the route: `readChain(request: Request): number`, `selfOrigin(): string | null`, and `runIngestAndHandOver(request: Request, chain: number): Promise<IngestResult & { moreWork: boolean }>`, which both the synchronous and the handover path call

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { CLAIM_LEASE_MS, claimCutoff, shouldStop } from "@/lib/inbound/claim";

/**
 * The claim exists because a run can overlap with a manual trigger. That is not
 * hypothetical: it is how this job was debugged all through the night of 6 August 2026,
 * and the STATUS note tells the next person to trigger it by hand too.
 */
describe("claimCutoff", () => {
  it("is the lease length before now, so an older claim is reclaimable", () => {
    const now = new Date("2026-08-07T10:00:00.000Z");
    expect(claimCutoff(now).toISOString()).toBe("2026-08-07T09:50:00.000Z");
  });

  it("uses a lease long enough to outlast one function invocation", () => {
    // A run is capped at 300 seconds, so a lease shorter than that could be reclaimed
    // while its owner is still working, and the email would be processed twice.
    expect(CLAIM_LEASE_MS).toBeGreaterThan(300_000);
  });
});

describe("shouldStop", () => {
  it("is false with time to spare", () => {
    expect(shouldStop(10_000, 0)).toBe(false);
  });

  it("is true once the deadline has passed", () => {
    expect(shouldStop(10_000, 10_001)).toBe(true);
  });

  it("is true at the deadline exactly, rather than starting one more email", () => {
    expect(shouldStop(10_000, 10_000)).toBe(true);
  });

  it("never stops when there is no deadline, which is the manual case", () => {
    expect(shouldStop(undefined, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/inbound-claim.test.ts`
Expected: FAIL, cannot resolve `@/lib/inbound/claim`.

- [ ] **Step 3: Write the claim module and the schema column**

`prisma/schema.prisma`, inside `model InboundEmail` after `processedAt`:

```prisma
  /**
   * When a run took this row to work on, so two runs cannot process it at once.
   *
   * A lease rather than a status, for two reasons. A `PROCESSING` state would strand rows
   * for ever when a run is killed mid flight, which is exactly what the 300-second ceiling
   * does; a timestamp expires by itself. And `processedAt` already means something else:
   * conflating two meanings in one column is the defect this requirement spent 6 August
   * 2026 removing from the extractor.
   */
  claimedAt DateTime?
```

Add to the same model's index list: `@@index([status, claimedAt])`.

Then `npx prisma generate && npx prisma db push`.

Create `lib/inbound/claim.ts`:

```ts
import { prisma } from "@/lib/db";

/**
 * RQ-007: one run's exclusive hold on one email, and the clock that ends a run.
 *
 * A run and a manual trigger can overlap, and a chained run can start while a stale
 * invocation is still finishing. Without a claim they would both extract the same
 * newsletter, pay twice for it, and race to write its row.
 */

/**
 * How long a claim is honoured before another run may take the row.
 *
 * Longer than the 300-second function ceiling on purpose: a lease that expires while its
 * owner is still working is worse than no lease, because it produces the double
 * processing it exists to prevent.
 */
export const CLAIM_LEASE_MS = 600_000;

/** Claims at or before this instant are stale and may be taken. */
export function claimCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - CLAIM_LEASE_MS);
}

/**
 * Whether a run is out of time.
 *
 * True at the deadline rather than past it: starting an email costs 25 seconds of
 * extraction before anything is written, so the last moment to start is well before the
 * last moment available.
 */
export function shouldStop(deadline: number | undefined, now: number = Date.now()): boolean {
  if (deadline === undefined) return false;
  return now >= deadline;
}

/**
 * Take one email, or find that somebody else already has it.
 *
 * A compare and swap, not a read then write: `updateMany` with the expected status and an
 * absent or expired claim in the `where` is atomic in Postgres, and the returned count is
 * the answer. A read followed by a write would leave a window between them exactly wide
 * enough for the second run to pass the same check.
 */
export async function claimEmail(id: string, now: Date = new Date()): Promise<boolean> {
  const claimed = await prisma.inboundEmail.updateMany({
    where: {
      id,
      status: "RECEIVED",
      OR: [{ claimedAt: null }, { claimedAt: { lte: claimCutoff(now) } }],
    },
    data: { claimedAt: now },
  });

  return claimed.count === 1;
}
```

- [ ] **Step 4: Run the claim tests**

Run: `npx vitest run tests/unit/inbound-claim.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire the budget and the claim into the run**

In `lib/inbound/process.ts`:

- `runEmailIngestion(options: { limit?: number; deadline?: number } = {})`.
- Return type becomes `Promise<IngestResult & { moreWork: boolean }>`; add `moreWork` to the object `empty()` builds, defaulting to `false`.
- In the phase-two callback, first line: `if (shouldStop(options.deadline)) { result.moreWork = true; return; }` then `if (!(await claimEmail(prisma, email.id))) return;` — a row somebody else holds is simply skipped.
- Same deadline check at the top of the `fetchPendingContent` callback.
- After both phases, set `result.moreWork = true` when a count of remaining work is non-zero: `await prisma.inboundEmail.count({ where: { status: { in: ["CONTENT_PENDING", "RECEIVED"] }, retryCount: { lt: config.emailIngest.maxContentAttempts } } })`.
- On the `PROCESSED`, `FAILED` and `IGNORED_UNKNOWN_SENDER` writes, also set `claimedAt: null`, so a terminal row holds no lease.

- [ ] **Step 6: Wire the route**

In `app/api/cron/email-ingest/route.ts`, add above the handler:

```ts
/** Chained invocations allowed from one cron firing, as a runaway backstop. */
const MAX_CHAIN = 12;

/**
 * Wall clock a run may use before it stops and hands over.
 *
 * Sixty seconds below `maxDuration`, which is the room the handover itself needs plus the
 * tail of whatever was already in flight when the budget ran out.
 */
const RUN_BUDGET_MS = 240_000;

function readChain(request: Request): number {
  const raw = new URL(request.url).searchParams.get("chain");
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** This deployment's own origin, for handing the remainder to a fresh invocation. */
function selfOrigin(): string | null {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? null;
}
```

In the handler, replace `runEmailIngestion({ limit: readLimit(request) })` with a deadline,
and hand over afterwards:

```ts
    const chain = readChain(request);
    const result = await runEmailIngestion({
      limit: readLimit(request),
      deadline: Date.now() + RUN_BUDGET_MS,
    });

    /**
     * Hand the remainder to a fresh invocation.
     *
     * The cron stays daily, which the plan requires, and a backlog still drains in one
     * firing instead of one email batch per day. `after()` runs once the response is sent,
     * so the caller is not held open for the child, and the child is asked to answer
     * immediately and work in its own `after()` for the same reason.
     */
    const origin = selfOrigin();

    if (result.moreWork && chain < MAX_CHAIN && origin && config.cron.secret) {
      after(async () => {
        await fetch(
          `${origin}/api/cron/email-ingest?chain=${chain + 1}&handover=1`,
          { headers: { Authorization: `Bearer ${config.cron.secret}` } }
        ).catch((error) => {
          // Losing the handover costs a day, not the data: tomorrow's cron picks the
          // backlog up. Worth a line in the log and nothing more.
          console.warn("[EMAIL INGEST] handover failed:", error);
        });
      });
    }

    return NextResponse.json({ success: true, chain, ...result });
```

with `import { after } from "next/server";` at the top.

For `handover=1`, answer before working so the parent is not held for the child's run:

```ts
    if (new URL(request.url).searchParams.get("handover") === "1") {
      after(async () => {
        await runIngestAndHandOver(request, chain);
      });
      return NextResponse.json({ success: true, accepted: true, chain });
    }
```

Extract the run-plus-handover body into `runIngestAndHandOver(request, chain)` so the
synchronous path and the handover path share it. **Keep the synchronous path as the
default**: a manual trigger must still return the result JSON, which is how every
diagnosis in this requirement was made.

- [ ] **Step 7: Verify the chain against production, because nothing else can**

`tsc`, the suites and `next build` all pass without exercising a single chained
invocation. Deploy, then:

```bash
npx tsx scripts/requeue-inbound.ts --empty-processed
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://newsletter4link.vercel.app/api/cron/email-ingest" -w "\n%{time_total}s\n"
```

Expected: a response inside 250 seconds carrying `moreWork` and `chain: 0`, and then the
backlog continuing to fall without another manual call. Confirm by polling the counts:

```bash
npx tsx scripts/tmp-check.ts   # or a one-off groupBy on InboundEmail.status
```

**Three things to check, and each has a specific failure it catches:**
1. Counts keep falling after the first response returns. If they stop, the handover never
   fired: check the logs for `handover failed` and whether `VERCEL_URL` was set.
2. No email ends with more articles than its sequential run produced. Duplicates would mean
   the claim is not holding.
3. `chain` in the last run's response is below `MAX_CHAIN`. Hitting the cap means the
   budget is too small for the work, not that the cap is wrong.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma lib/inbound/claim.ts lib/inbound/process.ts \
  app/api/cron/email-ingest/route.ts tests/unit/inbound-claim.test.ts
git commit -m "Ingest: a time budget and a handover, so a backlog drains in one firing"
```

---

### Task 5: Record what changed and what it cost

**Files:**
- Modify: `.claude/docs/requirements/STATUS.md` — the loose end about the 300-second ceiling
- Modify: `.claude/docs/requirements/RQ-007-email-ingestion/RQ-007-review.md` — append the throughput finding

- [ ] **Step 1: Replace the loose end with the measurement**

In `STATUS.md`, the paragraph beginning "Also worth knowing: the job cannot finish a large
batch inside its 300-second limit" is now wrong. Replace it with the before and after
wall-clock numbers from Task 3 step 5 and Task 4 step 7, the two concurrency values, and
one sentence on the handover and its `MAX_CHAIN` backstop.

- [ ] **Step 2: Note the claim column in the requirement's review**

One paragraph: `InboundEmail.claimedAt` exists, it is a lease rather than a status and
why, and the consequence for anyone writing a new consumer of this table, which is that a
row with a live claim belongs to somebody.

- [ ] **Step 3: Commit**

```bash
git add .claude/docs/requirements/STATUS.md \
  .claude/docs/requirements/RQ-007-email-ingestion/RQ-007-review.md
git commit -m "Docs: the ingest ceiling is gone, with the numbers that show it"
```
