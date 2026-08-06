# Edition Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An edition is identified by a name and a publication date, the ISO week becomes a derived label, and an organization may hold several open editions at once, including special editions that belong to no week.

**Architecture:** `Edition.publishDate` becomes the single date the product sorts and reasons by. `week` and `year` survive as a **derived cache written only by `lib/editions/identity.ts`**, so the roughly forty read sites that already do `edition.week` keep compiling and keep working. The uniqueness that used to live on `@@unique([week, year, organizationId])` moves to a new nullable `weeklySlot` column holding `"2026-W32"`: a weekly edition sets it, a special leaves it null, and Postgres treats nulls in a unique index as distinct, so one week can hold exactly one weekly and any number of specials. Nothing is dropped from the schema, so the migration is additive and reversible.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 7 against Postgres (Supabase), Vitest, TailwindCSS 4.

## Global Constraints

- **No long dashes anywhere.** Not in code, comments, commit messages, copy, or docs. Em dash (U+2014), en dash (U+2013), horizontal bar (U+2015) and the minus sign (U+2212) used as punctuation are all banned. Use a comma, a hyphen (`-`), or a colon.
- **Schema changes ship through `npx prisma db push`.** This project has no `prisma/migrations` directory and does not use `prisma migrate`. One-off data work goes in a `scripts/*.ts` file run with `npx tsx`.
- **Every backfill script is dry-run by default** and writes only with `--apply`, following `scripts/clean-article-categories.ts`.
- **The dashboard UI is written in English.** Only generated newsletter content follows the organization's language.
- **Every API route needs try/catch**, and every tenant-scoped read or write goes through `requireOrgContext()` and the tenant client from `lib/db/tenant.ts`, never bare `prisma`.
- **Baseline before starting: 766 tests passing across 44 files, `npx vitest run` green.** Any task that leaves fewer than that passing is not done.
- **Verification commands:** `npx vitest run` for the suite, `npx tsc --noEmit` for types, `npx next build` before declaring the plan finished.
- **`docs/0-work/` is never read, written, listed or referenced.**
- Another Claude session may be working in this repository. Do not create, apply or drop a `git stash`, do not switch branches, and do not touch `git worktree`. Commit only the files each task names.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `lib/editions/identity.ts` | The one place that converts a publication date and a kind into the columns an edition stores, and an edition row into the label a screen shows. Pure, no database, no clock of its own. |
| `tests/unit/edition-identity.test.ts` | Every rule in `identity.ts`, including the ISO week-year boundary. |
| `scripts/backfill-edition-identity.ts` | Fills `publishDate`, `weeklySlot` and `kind` on editions written before those columns existed. |

**Modified:**

| File | Change |
|---|---|
| `prisma/schema.prisma:289-354` | Three new columns on `Edition`, a new enum, the unique index moved to `weeklySlot`. |
| `lib/editions/proposal.ts:284-339` | `ensureProposal` keys on `weeklySlot` instead of the week/year compound. |
| `tests/unit/proposal.test.ts:392-498` | The argument assertions that pin `ensureProposal`'s key. |
| `app/api/editions/route.ts` | `POST` takes a name, a date and a kind. `GET` orders by `publishDate` and returns the new fields. |
| `app/api/editions/[id]/route.ts` | Returns the new fields. `PATCH` accepts a retitle and a reschedule while the edition is unsent. |
| `app/dashboard/send/page.tsx` | Several open editions instead of one. Create is always reachable. The dialog takes a name and a date. |
| `components/proposal/state.ts:41-53` | `Proposal` carries `title`, `kind`, `publishDate` and `label`. |
| `components/proposal/proposal-view.tsx` | Panel heading and send dialog use the label, not "this week". |
| `components/proposal/copy.ts` | `sendConfirmation` takes a label. |
| `app/dashboard/page.tsx:422` | Heading uses the label. |
| `lib/email/edition-data.ts` | `editionLabel` and `subject` come from the edition's label. |
| `lib/inbound/process.ts` | An item whose link could not be unwrapped is created and marked. |
| `prisma/schema.prisma` (`Article`) | `sourceUnresolved Boolean @default(false)`. |

---

### Task 1: The identity module

Pure functions only. No Prisma import, no `new Date()` without an argument. This ships and is testable with nothing else in place.

**Files:**
- Create: `lib/editions/identity.ts`
- Test: `tests/unit/edition-identity.test.ts`

**Interfaces:**
- Consumes: `isoWeekAndYear` and `weekLabel` from `lib/radar/week.ts`. `isoWeekAndYear(date: Date = new Date()): { week: number; year: number }` returns the ISO week and the ISO **week-year**, which is not always the calendar year. `weekLabel(week: number, year: number): string` returns `"Week 32 · 2026"`.
- Produces:
  - `type EditionKind = "WEEKLY" | "SPECIAL"`
  - `weeklySlotFor(week: number, year: number): string`
  - `parseWeeklySlot(slot: string): { week: number; year: number } | null`
  - `interface EditionWriteFields { publishDate: Date; week: number; year: number; weeklySlot: string | null; kind: EditionKind }`
  - `editionWriteFields(input: { publishDate: Date; kind: EditionKind }): EditionWriteFields`
  - `editionLabel(edition: { title: string | null; week: number; year: number }): string`

> **Naming note.** Task 2 adds a Prisma enum also called `EditionKind`. Prisma 7 generates
> it as the string union `"WEEKLY" | "SPECIAL"`, which is structurally identical to the
> type exported here, so they are interchangeable and neither needs a cast. They only
> collide as *names*, in a file that imports both. If you hit that, alias the Prisma one:
> `import { EditionKind as PrismaEditionKind } from "@prisma/client"`. Do not rename the
> export in `identity.ts`; every task below imports it under this name.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/edition-identity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  editionLabel,
  editionWriteFields,
  parseWeeklySlot,
  weeklySlotFor,
} from "@/lib/editions/identity";

/**
 * RQ-008 unit A. Everything here is a pure function over a date and a kind, so the
 * whole unit is tested without a database, the way lib/radar/week.ts is.
 *
 * The test that matters most is the week-year boundary. ISO 8601 puts 1 January 2027
 * in week 53 of week-year 2026, and the slot has to follow the week-year rather than
 * the calendar year or two editions a week apart collide in the unique index.
 */

describe("weeklySlotFor", () => {
  it("pads the week to two digits so slots sort lexically", () => {
    expect(weeklySlotFor(3, 2026)).toBe("2026-W03");
  });

  it("leaves a two-digit week alone", () => {
    expect(weeklySlotFor(32, 2026)).toBe("2026-W32");
  });

  it("accepts week 53, which ISO years genuinely have", () => {
    expect(weeklySlotFor(53, 2026)).toBe("2026-W53");
  });
});

describe("parseWeeklySlot", () => {
  it("round trips a slot it produced", () => {
    expect(parseWeeklySlot(weeklySlotFor(7, 2027))).toEqual({ week: 7, year: 2027 });
  });

  it("refuses a slot with an unpadded week", () => {
    expect(parseWeeklySlot("2026-W3")).toBeNull();
  });

  it("refuses a week outside 1 to 53", () => {
    expect(parseWeeklySlot("2026-W00")).toBeNull();
    expect(parseWeeklySlot("2026-W54")).toBeNull();
  });

  it("refuses anything that is not a slot", () => {
    expect(parseWeeklySlot("")).toBeNull();
    expect(parseWeeklySlot("Week 32")).toBeNull();
    expect(parseWeeklySlot("2026-32")).toBeNull();
  });
});

describe("editionWriteFields", () => {
  it("derives the week and the year from the publication date", () => {
    const fields = editionWriteFields({
      publishDate: new Date("2026-08-06T09:00:00.000Z"),
      kind: "WEEKLY",
    });

    expect(fields.week).toBe(32);
    expect(fields.year).toBe(2026);
  });

  it("gives a weekly edition the slot for its week", () => {
    const fields = editionWriteFields({
      publishDate: new Date("2026-08-06T09:00:00.000Z"),
      kind: "WEEKLY",
    });

    expect(fields.weeklySlot).toBe("2026-W32");
  });

  it("leaves a special edition with no slot, which is what lets a week hold many", () => {
    const fields = editionWriteFields({
      publishDate: new Date("2026-08-06T09:00:00.000Z"),
      kind: "SPECIAL",
    });

    expect(fields.weeklySlot).toBeNull();
    expect(fields.week).toBe(32);
    expect(fields.year).toBe(2026);
  });

  /**
   * The reason the slot is built from isoWeekAndYear and never from getFullYear.
   * 1 January 2027 is a Friday, and ISO 8601 files it in week 53 of 2026.
   */
  it("follows the ISO week-year across a new year rather than the calendar year", () => {
    const fields = editionWriteFields({
      publishDate: new Date("2027-01-01T00:00:00.000Z"),
      kind: "WEEKLY",
    });

    expect(fields).toMatchObject({ week: 53, year: 2026, weeklySlot: "2026-W53" });
  });

  it("returns the date it was given, untouched", () => {
    const publishDate = new Date("2026-08-06T09:00:00.000Z");
    expect(editionWriteFields({ publishDate, kind: "WEEKLY" }).publishDate).toBe(
      publishDate
    );
  });
});

describe("editionLabel", () => {
  it("prefers the title when there is one", () => {
    expect(editionLabel({ title: "AI Act special", week: 32, year: 2026 })).toBe(
      "AI Act special"
    );
  });

  it("falls back to the week label when the title is null", () => {
    expect(editionLabel({ title: null, week: 32, year: 2026 })).toBe("Week 32 · 2026");
  });

  it("treats a whitespace-only title as no title", () => {
    expect(editionLabel({ title: "   ", week: 9, year: 2026 })).toBe("Week 9 · 2026");
  });

  it("trims a title that has room around it", () => {
    expect(editionLabel({ title: "  Year in review  ", week: 1, year: 2027 })).toBe(
      "Year in review"
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/edition-identity.test.ts`

Expected: FAIL, `Failed to resolve import "@/lib/editions/identity"`.

- [ ] **Step 3: Write the implementation**

Create `lib/editions/identity.ts`:

```ts
import { isoWeekAndYear, weekLabel } from "@/lib/radar/week";

/**
 * RQ-008: what identifies an edition, in one place.
 *
 * An edition used to be identified by `week` and `year`, with a unique index over the
 * pair, and that made two things impossible: a second edition inside one week, and an
 * edition with a name of its own. Both were asked for on 6 August 2026.
 *
 * `publishDate` is the identity now. `week` and `year` survive as a derived cache so the
 * forty-odd screens and routes that read `edition.week` keep working, and they are
 * written here and nowhere else: a caller that sets them by hand is how the cache and
 * the date drift apart.
 *
 * `weeklySlot` carries the uniqueness the index used to. A weekly edition holds
 * "2026-W32"; a special holds null. Postgres treats nulls in a unique index as distinct,
 * so one week has exactly one weekly and as many specials as anyone wants, with no
 * partial index and no application-level lock.
 */

export type EditionKind = "WEEKLY" | "SPECIAL";

/**
 * The slot string for an ISO week, zero padded so slots sort lexically.
 *
 * Padded on purpose: "2026-W9" sorts after "2026-W10" as a string, and this value ends
 * up in ORDER BY clauses and in log lines where that would read as a bug.
 */
export function weeklySlotFor(week: number, year: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The week and year in a slot, or null when the string is not one. */
export function parseWeeklySlot(slot: string): { week: number; year: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(slot);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);

  // 1 to 53, because ISO years have 52 or 53 weeks and never a week 0.
  if (week < 1 || week > 53) return null;

  return { week, year };
}

export interface EditionWriteFields {
  publishDate: Date;
  /** Derived. Never set by a caller. */
  week: number;
  /** The ISO week-year, derived. Not always the calendar year of publishDate. */
  year: number;
  /** The slot on a weekly edition, null on anything else. */
  weeklySlot: string | null;
  kind: EditionKind;
}

/**
 * Every column an edition write has to set, from the two facts a caller actually has.
 *
 * The week comes from `isoWeekAndYear`, which returns the week and the ISO week-year
 * together and never apart: 1 January 2027 belongs to week 53 of week-year 2026, and
 * pairing a week number with `getFullYear()` is the bug that helper exists to prevent.
 */
export function editionWriteFields(input: {
  publishDate: Date;
  kind: EditionKind;
}): EditionWriteFields {
  const { week, year } = isoWeekAndYear(input.publishDate);

  return {
    publishDate: input.publishDate,
    week,
    year,
    weeklySlot: input.kind === "WEEKLY" ? weeklySlotFor(week, year) : null,
    kind: input.kind,
  };
}

/**
 * What a screen calls this edition.
 *
 * The title when it has one, and the week label when it does not, so nothing had to be
 * named during the backfill and a weekly edition keeps reading the way it always did.
 */
export function editionLabel(edition: {
  title: string | null;
  week: number;
  year: number;
}): string {
  const trimmed = edition.title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : weekLabel(edition.week, edition.year);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/edition-identity.test.ts`

Expected: PASS, 17 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`

Expected: no output. Nothing else imports this module yet, so the only way this fails is a mistake inside it.

- [ ] **Step 6: Commit**

```bash
git add lib/editions/identity.ts tests/unit/edition-identity.test.ts
git commit -m "Editions: one module owns what identifies an edition"
```

---

### Task 2: The schema, the uniqueness key, and the backfill

The schema change and the `ensureProposal` change are one deliverable: the unique index `ensureProposal` depends on stops existing, so the two cannot land apart without a broken build in between.

**Files:**
- Modify: `prisma/schema.prisma:289-354` (`model Edition`, and a new enum after `EditionStatus`)
- Modify: `lib/editions/proposal.ts:284-339` (`ensureProposal`)
- Modify: `tests/unit/proposal.test.ts:430-498` (the `ensureProposal` describe block)
- Create: `scripts/backfill-edition-identity.ts`

**Interfaces:**
- Consumes: `weeklySlotFor` and `editionWriteFields` from Task 1. `TenantClient` from `lib/db/tenant.ts`, whose `edition.findFirst` and `edition.upsert` inject `organizationId` into `data` on create but **not** into `where`, which is why the full key is passed explicitly.
- Produces: `ensureProposal(db: TenantClient, week: ProposalWeek): Promise<EnsureResult>` keeps its existing signature and its existing `EnsureResult` shape (`{ id, week, year, created }`), so `app/api/cron/weekly-proposal/route.ts` and `app/api/editions/proposal/route.ts` need no change.

- [ ] **Step 1: Change the schema**

In `prisma/schema.prisma`, replace the `model Edition` header block (the `id`, `week`, `year`, `status` lines at 290-293) with:

```prisma
model Edition {
  id String @id @default(cuid())

  /**
   * The day this edition is meant to go out, and the one date the product sorts by.
   *
   * RQ-008: `week` and `year` used to be the identity, under a unique index, which made a
   * second edition inside one week impossible and left an edition with no way to carry a
   * name. They are still here, as a cache derived from this date by
   * `lib/editions/identity.ts` and written nowhere else, so every screen that reads
   * `edition.week` keeps working. `weeklySlot` carries the uniqueness the index had.
   */
  publishDate DateTime

  /** The edition's own name. Null on a weekly, which is labelled from its date. */
  title String?

  kind EditionKind @default(WEEKLY)

  /**
   * "2026-W32" on a weekly edition, null on anything else.
   *
   * This is what keeps the schedule from creating two proposals for one week. Postgres
   * treats nulls in a unique index as distinct, so a week holds exactly one weekly and
   * as many specials as anyone wants, without a partial index Prisma cannot express and
   * without an application-level lock.
   */
  weeklySlot String?

  /** Derived from publishDate by lib/editions/identity.ts. Never set by a caller. */
  week Int
  /** The ISO week-year, derived. Not always the calendar year of publishDate. */
  year Int

  status EditionStatus @default(DRAFT)
```

Then replace the index block at the end of the model (the `@@unique([week, year, organizationId])` line and the three `@@index` lines) with:

```prisma
  @@unique([weeklySlot, organizationId])
  @@index([status])
  @@index([organizationId])
  @@index([archivedAt])
  @@index([publishDate(sort: Desc)])
  @@index([week, year])
}
```

Add the new enum immediately after `enum EditionStatus`:

```prisma
enum EditionKind {
  /** The edition the schedule creates once a week. Carries a weeklySlot. */
  WEEKLY
  /** Anything else: a themed issue, a launch, a year in review. No slot. */
  SPECIAL
}
```

Leave the `scheduledDate` field where it is. It is unused and out of scope; `publishDate` is the field that now carries this meaning, and removing a column is not part of this task.

- [ ] **Step 2: Make the new columns writable against the existing rows**

`publishDate` is required and the existing rows do not have it, so a plain `db push` cannot add it. Add it with a temporary default, backfill in Step 5, then take the default away. Three commands, in this order, and the third one matters: a `@default(now())` left behind on this column would silently date every new edition to the moment it was created, which is the same class of bug as `publishedAt: new Date()` in the curator.

First, add `@default(now())` to the `publishDate` line so the column can be created:

```prisma
  publishDate DateTime @default(now())
```

Then:

```bash
npx prisma db push
```

Expected: the three columns are added, the `week_year_organizationId` unique index is dropped and the `weeklySlot_organizationId` one created. Dropping a unique index is not data loss, so `--accept-data-loss` should not be needed. If Prisma asks for it, read what it says it will drop before agreeing: it must be an index and nothing else.

After the backfill in Step 5 has run with `--apply`, remove the `@default(now())` and push again:

```bash
npx prisma db push
```

- [ ] **Step 3: Regenerate the client**

Run: `npx prisma generate`

Expected: `Generated Prisma Client`. `npx tsc --noEmit` now fails in `lib/editions/proposal.ts` because `week_year_organizationId` no longer exists. That is the expected state until Step 6.

- [ ] **Step 4: Write the backfill script**

Create `scripts/backfill-edition-identity.ts`:

```ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { isoWeekStart } from "../lib/radar/week";
import { weeklySlotFor } from "../lib/editions/identity";

/**
 * Fill publishDate, weeklySlot and kind on editions written before those columns existed.
 *
 *     npx tsx scripts/backfill-edition-identity.ts           # report only
 *     npx tsx scripts/backfill-edition-identity.ts --apply   # write
 *
 * Every existing edition is a weekly one: the only two ways to create an edition before
 * this change were the weekly schedule and a dialog that asked for a week number. So each
 * row gets kind WEEKLY and the slot for the week it already claims.
 *
 * publishDate is the Monday of that week, not sentAt. A sent edition's sentAt is when the
 * job ran, which is a different fact and would put two editions of one week on different
 * weekdays for no reason. The Monday is what the week/year pair already meant.
 */

const pool = new Pool({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ["error"] });

const APPLY = process.argv.includes("--apply");

async function main() {
  const editions = await prisma.edition.findMany({
    select: {
      id: true,
      week: true,
      year: true,
      status: true,
      organizationId: true,
      weeklySlot: true,
      publishDate: true,
    },
    orderBy: [{ year: "asc" }, { week: "asc" }],
  });

  console.log(`${editions.length} editions found.`);

  /**
   * A row that already has a slot has been through this script, or was created after the
   * change. Skipped rather than rewritten: rewriting would overwrite a title-bearing
   * special edition's null slot with a week slot and make it collide with its weekly.
   */
  const needSlot = editions.filter((edition) => edition.weeklySlot === null);

  console.log(
    `${needSlot.length} need a slot. ${editions.length - needSlot.length} already carry one and are left alone.`
  );

  /**
   * Two editions of one organization claiming one week would break the new unique index.
   * The old index made that impossible, so finding one means something else is wrong and
   * the script must stop rather than pick a winner.
   */
  const seen = new Map<string, string>();
  const collisions: string[] = [];

  for (const edition of needSlot) {
    const key = `${edition.organizationId}:${weeklySlotFor(edition.week, edition.year)}`;
    const first = seen.get(key);
    if (first) {
      collisions.push(`${key} is claimed by both ${first} and ${edition.id}`);
      continue;
    }
    seen.set(key, edition.id);
  }

  if (collisions.length > 0) {
    console.error("Refusing to write. Two editions claim one week:");
    for (const line of collisions) console.error(`  ${line}`);
    process.exitCode = 1;
    return;
  }

  for (const edition of needSlot) {
    const slot = weeklySlotFor(edition.week, edition.year);
    const publishDate = isoWeekStart(edition.week, edition.year);

    console.log(
      `  ${edition.id}  week ${edition.week} of ${edition.year}  ->  slot ${slot}, publishDate ${publishDate.toISOString().slice(0, 10)}, kind WEEKLY`
    );

    if (!APPLY) continue;

    await prisma.edition.update({
      where: { id: edition.id },
      data: { weeklySlot: slot, publishDate, kind: "WEEKLY" },
    });
  }

  console.log(
    APPLY ? `Wrote ${needSlot.length} editions.` : "Dry run. Nothing was written. Pass --apply."
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
```

- [ ] **Step 5: Run the backfill, dry then live**

Run: `npx tsx scripts/backfill-edition-identity.ts`

Expected: one line per existing edition showing the slot and the Monday it will get, ending with "Dry run. Nothing was written." Read the lines before going on. If it reports a collision it exits 1 and writes nothing; stop and report that rather than working around it.

Then run: `npx tsx scripts/backfill-edition-identity.ts --apply`

Expected: the same lines, ending with "Wrote N editions."

- [ ] **Step 6: Rewrite the ensureProposal test assertions**

In `tests/unit/proposal.test.ts`, inside `describe("ensureProposal")`, replace the two assertions that name the old compound key. The test at line 445 that reads:

```ts
    const upsert = db.calls.upsert as unknown as {
      where: { week_year_organizationId: Record<string, unknown> };
    };
    expect(upsert.where.week_year_organizationId).toEqual({
      week: 32,
      year: 2026,
      organizationId: "org-1",
    });
```

becomes:

```ts
    /**
     * RQ-008: the key is the weekly slot now, not the week/year pair. This assertion is
     * the whole of AC-1.4: with the slot as the unique key a second weekly for one week
     * is refused by the database, and a special edition holds null there, so a week can
     * carry as many specials as anyone wants.
     */
    const upsert = db.calls.upsert as unknown as {
      where: { weeklySlot_organizationId: Record<string, unknown> };
    };
    expect(upsert.where.weeklySlot_organizationId).toEqual({
      weeklySlot: "2026-W32",
      organizationId: "org-1",
    });
```

And the assertion at line 473 that reads:

```ts
    expect(upsert.create).toEqual({ week: 32, year: 2026, status: "DRAFT" });
```

becomes:

```ts
    expect(upsert.create).toEqual({
      weeklySlot: "2026-W32",
      week: 32,
      year: 2026,
      kind: "WEEKLY",
      publishDate: new Date("2026-08-03T00:00:00.000Z"),
      status: "DRAFT",
    });
```

The date is `WEEK.startsAt`, the Monday already on the `ProposalWeek` fixture at the top of the file.

Add one new test at the end of the same describe block:

```ts
  it("looks the existing proposal up by its slot, not by the week columns", async () => {
    const db = fakeDb({ findFirst: { id: "already-there" } });

    await ensureProposal(db, WEEK);

    const findFirst = db.calls.findFirst as unknown as {
      where: Record<string, unknown>;
    };
    expect(findFirst.where).toEqual({ weeklySlot: "2026-W32" });
  });
```

- [ ] **Step 7: Run the tests to verify the new assertions fail**

Run: `npx vitest run tests/unit/proposal.test.ts`

Expected: FAIL. The `weeklySlot_organizationId` assertions fail because `ensureProposal` still passes the old key.

- [ ] **Step 8: Change ensureProposal**

In `lib/editions/proposal.ts`, add to the imports at the top of the file:

```ts
import { editionWriteFields, weeklySlotFor } from "@/lib/editions/identity";
```

Then replace the body of `ensureProposal` (lines 301-339, from `const { week: weekNumber, year } = week;` to the closing brace) with:

```ts
  const { week: weekNumber, year, startsAt } = week;
  const slot = weeklySlotFor(weekNumber, year);

  const existing = await db.edition.findFirst({
    where: { weeklySlot: slot },
    select: { id: true },
  });
  if (existing) return { id: existing.id, week: weekNumber, year, created: false };

  /**
   * RQ-008: the weekly edition's publication date is the Monday of its week.
   *
   * `startsAt` is already that Monday, computed by `isoWeekStart` and handed in by the
   * caller, so the schedule and this write cannot disagree about which day the week
   * begins on.
   */
  const fields = editionWriteFields({ publishDate: startsAt, kind: "WEEKLY" });

  try {
    const created = await db.edition.upsert({
      where: {
        weeklySlot_organizationId: {
          weeklySlot: slot,
          organizationId: db.organizationId,
        },
      },
      // organizationId is deliberately absent: the tenant client injects it.
      create: { ...fields, status: "DRAFT" } as unknown as Prisma.EditionCreateInput,
      update: {},
      select: { id: true },
    });
    return { id: created.id, week: weekNumber, year, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // Another request, or the schedule, created it between the read and the
    // write. The proposal for the week is theirs and ours, so use it (AC-1.3).
    const raced = await db.edition.findFirst({
      where: { weeklySlot: slot },
      select: { id: true },
    });
    if (!raced) throw error;
    return { id: raced.id, week: weekNumber, year, created: false };
  }
```

Also update the docblock above `ensureProposal` (lines 290-300): replace the sentence naming `@@unique([week, year, organizationId])` with:

```
 * The unique `@@unique([weeklySlot, organizationId])` is what makes a collision
 * impossible. A weekly edition's slot is derived from its week, a special edition's is
 * null, and Postgres treats nulls in a unique index as distinct, so this constraint binds
 * the schedule without binding anything else.
```

- [ ] **Step 9: Run the full suite**

Run: `npx vitest run`

Expected: PASS, 767 or more tests across 45 files. If `pipeline-status.test.ts`, `candidate-pool.test.ts` or `editions-lifecycle.test.ts` fail, read the failure: they build `Edition` fixtures and may need `publishDate`, `kind` and `weeklySlot` added. Add the fields to the fixture rather than loosening the assertion.

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit`

Expected: no output. `app/api/editions/route.ts` still creates an edition with only `week` and `year`, which now fails to compile because `publishDate` is required. Fix it here with the minimum that compiles, so this task ends green:

In `app/api/editions/route.ts`, add the import:

```ts
import { editionWriteFields } from "@/lib/editions/identity";
import { isoWeekStart } from "@/lib/radar/week";
```

and change the `db.edition.create` call (lines 176-182) to:

```ts
    const edition = await db.edition.create({
      data: {
        ...editionWriteFields({
          publishDate: isoWeekStart(week, year),
          kind: "WEEKLY",
        }),
        status: "DRAFT",
      } as any,
    });
```

Task 3 gives this route its real shape. This step only keeps the build green.

- [ ] **Step 11: Commit**

```bash
git add prisma/schema.prisma lib/editions/proposal.ts tests/unit/proposal.test.ts scripts/backfill-edition-identity.ts app/api/editions/route.ts
git commit -m "Editions: the weekly slot carries the uniqueness the week/year index did"
```

---

### Task 3: The editions collection API

**Files:**
- Modify: `app/api/editions/route.ts`
- Test: `tests/unit/edition-create-input.test.ts` (create)

**Interfaces:**
- Consumes: `editionWriteFields`, `editionLabel`, `EditionKind` from Task 1. `requireOrgContext()` from `lib/auth/context`.
- Produces:
  - `parseEditionCreate(body: unknown): { ok: true; value: { title: string | null; publishDate: Date; kind: EditionKind; autoPopulate: boolean } } | { ok: false; error: string }`, exported from `app/api/editions/route.ts` so it can be tested without a request.
  - `GET /api/editions` responses gain `title: string | null`, `kind: "WEEKLY" | "SPECIAL"`, `publishDate: string` and `label: string`, and keep `week` and `year`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/edition-create-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEditionCreate } from "@/app/api/editions/route";

/**
 * RQ-008: creating an edition takes a date and optionally a name, not a week number.
 *
 * The parse is a pure function so the rules are testable without a database or a
 * request, and so the route body stays a thin wrapper around it. The old route took
 * `week` and `year` as required numbers, which is exactly what made a special edition
 * impossible to ask for.
 */

describe("parseEditionCreate", () => {
  it("accepts a date alone and defaults to a weekly edition with no name", () => {
    const result = parseEditionCreate({ publishDate: "2026-08-10" });

    expect(result).toEqual({
      ok: true,
      value: {
        title: null,
        publishDate: new Date("2026-08-10T00:00:00.000Z"),
        kind: "WEEKLY",
        autoPopulate: true,
      },
    });
  });

  it("accepts a name and a kind", () => {
    const result = parseEditionCreate({
      publishDate: "2026-08-10",
      title: "AI Act special",
      kind: "SPECIAL",
    });

    expect(result).toMatchObject({
      ok: true,
      value: { title: "AI Act special", kind: "SPECIAL" },
    });
  });

  it("trims a name and treats a blank one as absent", () => {
    expect(parseEditionCreate({ publishDate: "2026-08-10", title: "  Launch  " }))
      .toMatchObject({ ok: true, value: { title: "Launch" } });

    expect(parseEditionCreate({ publishDate: "2026-08-10", title: "   " }))
      .toMatchObject({ ok: true, value: { title: null } });
  });

  it("lets a caller opt out of auto-population", () => {
    expect(parseEditionCreate({ publishDate: "2026-08-10", autoPopulate: false }))
      .toMatchObject({ ok: true, value: { autoPopulate: false } });
  });

  it("refuses a missing date, because the date is the identity now", () => {
    expect(parseEditionCreate({})).toEqual({
      ok: false,
      error: "publishDate is required, as an ISO date such as 2026-08-10",
    });
  });

  it("refuses a date that is not a date", () => {
    expect(parseEditionCreate({ publishDate: "next tuesday" })).toEqual({
      ok: false,
      error: "publishDate is required, as an ISO date such as 2026-08-10",
    });
  });

  it("refuses a kind that is not one of the two", () => {
    expect(parseEditionCreate({ publishDate: "2026-08-10", kind: "MONTHLY" })).toEqual({
      ok: false,
      error: "kind must be WEEKLY or SPECIAL",
    });
  });

  /**
   * A special edition with no name would be indistinguishable from the weekly one in
   * every list, since both would fall back to the same week label.
   */
  it("requires a special edition to be named", () => {
    expect(parseEditionCreate({ publishDate: "2026-08-10", kind: "SPECIAL" })).toEqual({
      ok: false,
      error: "a special edition needs a title, so it can be told apart from the weekly one",
    });
  });

  it("refuses a title longer than 120 characters", () => {
    expect(
      parseEditionCreate({ publishDate: "2026-08-10", title: "x".repeat(121) })
    ).toEqual({ ok: false, error: "title must be 120 characters or fewer" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/edition-create-input.test.ts`

Expected: FAIL, `parseEditionCreate is not a function`.

- [ ] **Step 3: Write the parser and rewrite the route**

In `app/api/editions/route.ts`, add above the `GET` handler:

```ts
import { editionLabel, editionWriteFields, type EditionKind } from "@/lib/editions/identity";

const KINDS: EditionKind[] = ["WEEKLY", "SPECIAL"];
const MAX_TITLE = 120;

export interface EditionCreateInput {
  title: string | null;
  publishDate: Date;
  kind: EditionKind;
  autoPopulate: boolean;
}

export type ParsedCreate =
  | { ok: true; value: EditionCreateInput }
  | { ok: false; error: string };

/**
 * RQ-008: what creating an edition needs, validated apart from the request.
 *
 * The old route required `week` and `year` as numbers between 1 and 53 and 2000 and 2100,
 * which is why nothing could ask for a special edition: the two required fields were the
 * identity, and the identity was a week. A date and an optional name replace them.
 */
export function parseEditionCreate(body: unknown): ParsedCreate {
  const input = (body ?? {}) as Record<string, unknown>;

  const rawDate = input.publishDate;
  const publishDate =
    typeof rawDate === "string" || typeof rawDate === "number"
      ? new Date(rawDate)
      : null;

  if (!publishDate || Number.isNaN(publishDate.getTime())) {
    return {
      ok: false,
      error: "publishDate is required, as an ISO date such as 2026-08-10",
    };
  }

  const rawKind = input.kind ?? "WEEKLY";
  if (typeof rawKind !== "string" || !KINDS.includes(rawKind as EditionKind)) {
    return { ok: false, error: "kind must be WEEKLY or SPECIAL" };
  }
  const kind = rawKind as EditionKind;

  const rawTitle = typeof input.title === "string" ? input.title.trim() : "";
  if (rawTitle.length > MAX_TITLE) {
    return { ok: false, error: `title must be ${MAX_TITLE} characters or fewer` };
  }
  const title = rawTitle.length > 0 ? rawTitle : null;

  if (kind === "SPECIAL" && title === null) {
    return {
      ok: false,
      error: "a special edition needs a title, so it can be told apart from the weekly one",
    };
  }

  return {
    ok: true,
    value: {
      title,
      publishDate,
      kind,
      autoPopulate: input.autoPopulate !== false,
    },
  };
}
```

In the `GET` handler, change the `orderBy` (lines 53-56) to:

```ts
      // RQ-008: the publication date is the order, not the week. A special edition has a
      // week like everything else, but two editions can share one, so week/year alone no
      // longer produces a stable order.
      orderBy: [{ publishDate: "desc" }, { createdAt: "desc" }],
```

and add four fields to the `editionsWithCounts` map, immediately after `year`:

```ts
      title: edition.title,
      kind: edition.kind,
      publishDate: edition.publishDate,
      // Derived once here so no screen has to reimplement the fallback rule.
      label: editionLabel(edition),
```

Replace the whole body of the `POST` handler between `const body = await request.json();` and the `db.edition.create` call with:

```ts
    const parsed = parseEditionCreate(body);

    if (!parsed.ok) {
      return NextResponse.json(
        { success: false, error: parsed.error },
        { status: 400 }
      );
    }

    const fields = editionWriteFields({
      publishDate: parsed.value.publishDate,
      kind: parsed.value.kind,
    });

    /**
     * RQ-008: only a weekly edition can collide, and the database is what refuses it.
     *
     * The old route did a findFirst on week and year and answered 409 from that, which
     * cannot be right under concurrency and is now also wrong in meaning: two editions
     * sharing a week is the point. A special edition holds a null slot and is never
     * refused.
     */
    if (fields.weeklySlot) {
      const clash = await db.edition.findFirst({
        where: { weeklySlot: fields.weeklySlot },
        select: { id: true, week: true, year: true },
      });

      if (clash) {
        return NextResponse.json(
          {
            success: false,
            error: `The weekly edition for week ${clash.week} of ${clash.year} already exists. Create a special edition to add another for the same week.`,
            editionId: clash.id,
          },
          { status: 409 }
        );
      }
    }

    const edition = await db.edition.create({
      data: {
        ...fields,
        title: parsed.value.title,
        status: "DRAFT",
      } as any,
    });
```

Then change the `if (autoPopulate)` line to `if (parsed.value.autoPopulate)`, and delete the now-dead `const { week, year, autoPopulate = true } = body;` line and the four validation blocks above it (the week and year `if` statements and the `existingEdition` check).

Add `label` to the 201 response payload:

```ts
        data: {
          ...completeEdition,
          label: completeEdition ? editionLabel(completeEdition) : null,
          articleCount: (completeEdition as any)?._count?.articles ?? 0,
          projectCount: (completeEdition as any)?._count?.projects ?? 0,
        },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/edition-create-input.test.ts`

Expected: PASS, 9 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`

Expected: suite green, no type output.

- [ ] **Step 6: Commit**

```bash
git add app/api/editions/route.ts tests/unit/edition-create-input.test.ts
git commit -m "API: creating an edition takes a date and a name, not a week number"
```

---

### Task 4: The single-edition API

**Files:**
- Modify: `app/api/editions/[id]/route.ts`
- Test: `tests/unit/edition-patch-input.test.ts` (create)

**Interfaces:**
- Consumes: `editionLabel`, `editionWriteFields` from Task 1.
- Produces:
  - `parseEditionPatch(body: unknown): { ok: true; value: { title?: string | null; publishDate?: Date } } | { ok: false; error: string }`, exported from the route.
  - `GET`/`PATCH` responses gain `title`, `kind`, `publishDate` and `label`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/edition-patch-input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseEditionPatch } from "@/app/api/editions/[id]/route";

/**
 * RQ-008: an unsent edition can be renamed and rescheduled.
 *
 * Absent and null are different here and the distinction is the whole point of the
 * parse: an absent `title` leaves the name alone, and an explicit null clears it back to
 * the derived week label. A PATCH that could not tell them apart would erase a name every
 * time a screen sent a partial update.
 */

describe("parseEditionPatch", () => {
  it("returns nothing to change for an empty body", () => {
    expect(parseEditionPatch({})).toEqual({ ok: true, value: {} });
  });

  it("leaves the title alone when the key is absent", () => {
    const result = parseEditionPatch({ publishDate: "2026-08-11" });
    expect(result).toEqual({
      ok: true,
      value: { publishDate: new Date("2026-08-11T00:00:00.000Z") },
    });
  });

  it("clears the title when it is explicitly null", () => {
    expect(parseEditionPatch({ title: null })).toEqual({
      ok: true,
      value: { title: null },
    });
  });

  it("clears the title when it is blank", () => {
    expect(parseEditionPatch({ title: "  " })).toEqual({
      ok: true,
      value: { title: null },
    });
  });

  it("trims a new title", () => {
    expect(parseEditionPatch({ title: " Year in review " })).toEqual({
      ok: true,
      value: { title: "Year in review" },
    });
  });

  it("refuses a title longer than 120 characters", () => {
    expect(parseEditionPatch({ title: "x".repeat(121) })).toEqual({
      ok: false,
      error: "title must be 120 characters or fewer",
    });
  });

  it("refuses a publishDate that is not a date", () => {
    expect(parseEditionPatch({ publishDate: "soon" })).toEqual({
      ok: false,
      error: "publishDate must be an ISO date such as 2026-08-10",
    });
  });

  it("refuses a title that is neither a string nor null", () => {
    expect(parseEditionPatch({ title: 7 })).toEqual({
      ok: false,
      error: "title must be a string or null",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/edition-patch-input.test.ts`

Expected: FAIL, `parseEditionPatch is not a function`.

- [ ] **Step 3: Write the parser and wire it in**

In `app/api/editions/[id]/route.ts`, add the import and the parser above `transformEdition`:

```ts
import { editionLabel, editionWriteFields } from "@/lib/editions/identity";

const MAX_TITLE = 120;

export interface EditionPatchInput {
  /** Absent leaves the name alone. Null clears it back to the derived week label. */
  title?: string | null;
  publishDate?: Date;
}

export type ParsedPatch =
  | { ok: true; value: EditionPatchInput }
  | { ok: false; error: string };

/**
 * RQ-008: the name and the date an editor may change on an unsent edition.
 *
 * Absent and null are kept apart deliberately. Every screen that sends a partial PATCH
 * omits the fields it is not touching, so treating an omitted title as "clear it" would
 * erase the name on every reorder.
 */
export function parseEditionPatch(body: unknown): ParsedPatch {
  const input = (body ?? {}) as Record<string, unknown>;
  const value: EditionPatchInput = {};

  if ("title" in input) {
    const raw = input.title;

    if (raw !== null && typeof raw !== "string") {
      return { ok: false, error: "title must be a string or null" };
    }

    const trimmed = typeof raw === "string" ? raw.trim() : "";

    if (trimmed.length > MAX_TITLE) {
      return { ok: false, error: `title must be ${MAX_TITLE} characters or fewer` };
    }

    value.title = trimmed.length > 0 ? trimmed : null;
  }

  if ("publishDate" in input) {
    const raw = input.publishDate;
    const parsed =
      typeof raw === "string" || typeof raw === "number" ? new Date(raw) : null;

    if (!parsed || Number.isNaN(parsed.getTime())) {
      return {
        ok: false,
        error: "publishDate must be an ISO date such as 2026-08-10",
      };
    }

    value.publishDate = parsed;
  }

  return { ok: true, value };
}
```

Add the four fields to `transformEdition`, immediately after `year: edition.year,`:

```ts
    title: edition.title,
    kind: edition.kind,
    publishDate: edition.publishDate,
    label: editionLabel(edition),
```

In the `PATCH` handler, change the destructure at line 183 to add the two new keys:

```ts
    const { status, articles, projects, editorDesignJson, templateId } = body;
```

stays as it is, and immediately after the `existingEdition` sent-check block (after line 202), insert:

```ts
    /**
     * RQ-008: the name and the date, on an edition that has not gone out.
     *
     * Rescheduling rewrites the derived week, year and slot through
     * `editionWriteFields`, so moving a weekly edition across a week boundary moves its
     * slot with it. The kind never changes here: turning a weekly into a special would
     * free its slot and let the schedule create a second weekly for a week that already
     * had one, which is the one thing the slot exists to prevent.
     */
    const patch = parseEditionPatch(body);

    if (!patch.ok) {
      return NextResponse.json(
        { success: false, error: patch.error },
        { status: 400 }
      );
    }
```

Then inside the `const updateData: Prisma.EditionUpdateInput = {};` block, after the `templateId` branch, add:

```ts
    if (patch.value.title !== undefined) {
      updateData.title = patch.value.title;
    }

    if (patch.value.publishDate) {
      const fields = editionWriteFields({
        publishDate: patch.value.publishDate,
        kind: existingEdition.kind,
      });

      updateData.publishDate = fields.publishDate;
      updateData.week = fields.week;
      updateData.year = fields.year;
      updateData.weeklySlot = fields.weeklySlot;
    }
```

Finally, a reschedule can collide. Immediately before the `db.$raw.$transaction` call, add:

```ts
    /**
     * A weekly edition moved onto a week that already has one is refused by name rather
     * than by a Prisma error reaching the screen as "Unique constraint failed".
     */
    if (typeof updateData.weeklySlot === "string") {
      const clash = await db.edition.findFirst({
        where: { weeklySlot: updateData.weeklySlot, id: { not: id } },
        select: { week: true, year: true },
      });

      if (clash) {
        return NextResponse.json(
          {
            success: false,
            error: `Week ${clash.week} of ${clash.year} already has a weekly edition. Move this one to another week, or make it a special edition.`,
          },
          { status: 409 }
        );
      }
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/edition-patch-input.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`

Expected: suite green, no type output.

- [ ] **Step 6: Commit**

```bash
git add "app/api/editions/[id]/route.ts" tests/unit/edition-patch-input.test.ts
git commit -m "API: an unsent edition can be renamed and rescheduled"
```

---

### Task 5: The editions screen holds more than one open edition

**Files:**
- Modify: `app/dashboard/send/page.tsx`
- Test: `tests/unit/edition-list-view.test.ts` (create)

**Interfaces:**
- Consumes: the `GET /api/editions` payload from Task 3, which now carries `title`, `kind`, `publishDate` and `label`.
- Produces: `splitEditions<T>(editions: T[]): { open: T[]; sent: T[] }` and `nextWeeklyDate(now: Date): Date`, both exported from `app/dashboard/send/page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/edition-list-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextWeeklyDate, splitEditions } from "@/app/dashboard/send/page";

/**
 * RQ-008: the screen used to assume exactly one open edition.
 *
 * `editions.find((e) => e.status !== "SENT")` picked the first non-sent edition and
 * called it "the" open one, and the create control only existed when there was none. That
 * pair is what made a special edition unreachable from the interface: with the week's
 * edition open there was no button to press.
 */

const edition = (
  id: string,
  status: "DRAFT" | "FINALIZED" | "SENT",
  publishDate: string,
  sentAt: string | null = null
) => ({ id, status, publishDate, sentAt });

describe("splitEditions", () => {
  it("returns every unsent edition as open, not just the first", () => {
    const result = splitEditions([
      edition("weekly", "DRAFT", "2026-08-10"),
      edition("special", "DRAFT", "2026-08-12"),
      edition("old", "SENT", "2026-08-03", "2026-08-03T04:32:00.000Z"),
    ]);

    expect(result.open.map((e) => e.id)).toEqual(["special", "weekly"]);
    expect(result.sent.map((e) => e.id)).toEqual(["old"]);
  });

  it("counts a finalized edition as open, because it has not gone out", () => {
    const result = splitEditions([edition("f", "FINALIZED", "2026-08-10")]);

    expect(result.open.map((e) => e.id)).toEqual(["f"]);
    expect(result.sent).toEqual([]);
  });

  it("orders open editions by publication date, soonest last", () => {
    const result = splitEditions([
      edition("mid", "DRAFT", "2026-08-11"),
      edition("late", "DRAFT", "2026-08-20"),
      edition("early", "DRAFT", "2026-08-04"),
    ]);

    expect(result.open.map((e) => e.id)).toEqual(["late", "mid", "early"]);
  });

  it("orders sent editions by when they were sent, newest first", () => {
    const result = splitEditions([
      edition("older", "SENT", "2026-07-27", "2026-07-27T04:32:00.000Z"),
      edition("newer", "SENT", "2026-08-03", "2026-08-03T04:32:00.000Z"),
    ]);

    expect(result.sent.map((e) => e.id)).toEqual(["newer", "older"]);
  });

  it("returns two empty lists for no editions", () => {
    expect(splitEditions([])).toEqual({ open: [], sent: [] });
  });
});

describe("nextWeeklyDate", () => {
  it("returns the Monday of the current ISO week", () => {
    // Thursday 6 August 2026. Its ISO week starts on Monday the 3rd.
    expect(nextWeeklyDate(new Date("2026-08-06T09:00:00.000Z")).toISOString()).toBe(
      "2026-08-03T00:00:00.000Z"
    );
  });

  it("returns the Monday itself when asked on a Monday", () => {
    expect(nextWeeklyDate(new Date("2026-08-03T23:59:00.000Z")).toISOString()).toBe(
      "2026-08-03T00:00:00.000Z"
    );
  });

  it("follows the ISO week-year across a new year", () => {
    // 1 January 2027 is a Friday, in week 53 of week-year 2026, which starts 28 December.
    expect(nextWeeklyDate(new Date("2027-01-01T12:00:00.000Z")).toISOString()).toBe(
      "2026-12-28T00:00:00.000Z"
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/edition-list-view.test.ts`

Expected: FAIL, `splitEditions is not a function`.

- [ ] **Step 3: Export the two helpers**

In `app/dashboard/send/page.tsx`, add near the top, after the imports and before the `Edition` interface:

```ts
/**
 * RQ-008: open and sent, from one list, with a stable order for each.
 *
 * Exported and pure so the ordering rules are tested without rendering the page. Generic
 * over the row shape for the same reason: the test passes the four fields it cares about
 * rather than building a whole Edition.
 */
export function splitEditions<
  T extends { status: string; publishDate: string; sentAt: string | null },
>(editions: T[]): { open: T[]; sent: T[] } {
  const open = editions
    .filter((edition) => edition.status !== "SENT")
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate));

  const sent = editions
    .filter((edition) => edition.status === "SENT")
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));

  return { open, sent };
}

/** The Monday of `now`'s ISO week, which is what a weekly edition is dated. */
export function nextWeeklyDate(now: Date): Date {
  const { week, year } = isoWeekAndYear(now);
  return isoWeekStart(week, year);
}
```

Add `isoWeekStart` to the existing `lib/radar/week` import.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/edition-list-view.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Use them, and make create always reachable**

Extend the `Edition` interface (line 40) with the four new fields:

```ts
  title: string | null;
  kind: "WEEKLY" | "SPECIAL";
  publishDate: string;
  label: string;
```

Replace the `sentEditions` and `openEdition` memos (lines 379-392) with:

```ts
  const { open: openEditions, sent: sentEditions } = useMemo(
    () => splitEditions(editions),
    [editions]
  );

  /**
   * The edition the "Open builder" shortcut points at: the soonest open one.
   *
   * There can now be several, which is the change. Nothing else on this screen treats
   * this as "the" edition any more, and the pipeline's In edition column counts them all.
   */
  const nextEdition = openEditions[openEditions.length - 1] ?? null;
```

Replace `headline` and `subtitle` (lines 394-408) with:

```ts
  const headline =
    openEditions.length === 0
      ? "No edition in progress"
      : openEditions.length === 1
        ? openEditions[0].label
        : `${openEditions.length} editions in progress`;

  const subtitle =
    openEditions.length === 0 ? (
      <>
        <Num>{waitingApproved.length}</Num> approved stories are waiting for an
        edition, and <Num>{pending.length}</Num> are still in review.
      </>
    ) : openEditions.length === 1 ? (
      <>
        <Num>{openEditions[0].articleCount}</Num> stories and{" "}
        <Num>{openEditions[0].projectCount}</Num> projects in the draft ·{" "}
        <Num>{waitingApproved.length}</Num> approved and waiting ·{" "}
        <Num>{pending.length}</Num> still in review
      </>
    ) : (
      <>
        {openEditions.map((edition) => edition.label).join(", ")} ·{" "}
        <Num>{waitingApproved.length}</Num> approved and waiting ·{" "}
        <Num>{pending.length}</Num> still in review
      </>
    );
```

Replace the actions block (lines 441-453) so both controls exist together:

```ts
              {nextEdition && (
                <Link
                  href={`/dashboard/send/${nextEdition.id}`}
                  className={radarButtonClass()}
                >
                  Open builder
                </Link>
              )}
              {/* RQ-008: always reachable. This used to appear only when no edition was
                  open, which is what made a special edition impossible to create. */}
              <RadarButton variant="accent" onClick={() => setShowCreate(true)}>
                Create edition
              </RadarButton>
```

Replace the "In edition" column's `note` (line 538) with:

```ts
              note={
                openEditions.length === 0
                  ? "unscheduled"
                  : openEditions.length === 1
                    ? openEditions[0].label
                    : `${openEditions.length} open editions`
              }
```

In the sent-editions card (line 565) and the all-editions table row (lines 666 and 674), replace `Week {edition.week} · {edition.year}` with `{edition.label}`, and the aria label at 666 with `` label={`Select ${edition.label}`} ``. Where a row shows the label, add the date beside it so a special edition is placed in time:

```tsx
                    <span className="text-[11px] text-radar-ink3">
                      {edition.label}
                    </span>
                    {edition.kind === "SPECIAL" && (
                      <StatusChip tone="neutral">special</StatusChip>
                    )}
```

- [ ] **Step 6: Replace the create dialog**

Replace the `week`/`year` state (lines 280-281) with:

```ts
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newKind, setNewKind] = useState<"WEEKLY" | "SPECIAL">("WEEKLY");
```

Replace the `useEffect` that seeded them (lines 315-319) with:

```ts
  useEffect(() => {
    void load();
    // The Monday of the current ISO week, which is what a weekly edition is dated.
    setNewDate(nextWeeklyDate(new Date()).toISOString().slice(0, 10));
  }, [load]);
```

Change the `createEdition` body's fetch to:

```ts
      const res = await fetch("/api/editions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim() || null,
          publishDate: newDate,
          kind: newKind,
          autoPopulate: true,
        }),
      });
```

Replace the dialog's two number inputs (lines 837-869) with:

```tsx
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11.5px] font-medium text-radar-ink2">
                  Publication date
                </span>
                <input
                  type="date"
                  value={newDate}
                  onChange={(event) => setNewDate(event.target.value)}
                  className="h-9 w-full rounded-lg border border-radar-line bg-radar-bg px-3 text-[13px] text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                />
                <span className="mt-1 block text-[11.5px] text-radar-ink3">
                  The week number is read from this date, so nothing has to be counted.
                </span>
              </label>

              <ChipGroup<"WEEKLY" | "SPECIAL">
                label="Edition kind"
                value={newKind}
                onChange={setNewKind}
                options={[
                  { value: "WEEKLY", label: "Weekly" },
                  { value: "SPECIAL", label: "Special" },
                ]}
              />

              <label className="block">
                <span className="mb-1.5 block text-[11.5px] font-medium text-radar-ink2">
                  Name {newKind === "WEEKLY" ? "(optional)" : ""}
                </span>
                <input
                  type="text"
                  maxLength={120}
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder={
                    newKind === "WEEKLY" ? "Left empty, it is labelled by its week" : "AI Act special"
                  }
                  className="h-9 w-full rounded-lg border border-radar-line bg-radar-bg px-3 text-[13px] text-radar-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-radar-accent"
                />
                <span className="mt-1 block text-[11.5px] text-radar-ink3">
                  {newKind === "SPECIAL"
                    ? "A special edition needs a name, so it can be told apart from the weekly one."
                    : "A weekly edition without a name is labelled from its date."}
                </span>
              </label>
            </div>
```

and the footer button label with:

```tsx
              {creating ? "Creating…" : "Create edition"}
```

Disable it when a special has no name:

```tsx
              disabled={creating || !newDate || (newKind === "SPECIAL" && !newTitle.trim())}
```

- [ ] **Step 7: Run the suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`

Expected: suite green, no type output. If `tsc` reports that `Edition` is missing the new fields anywhere else in this file, add them to the interface rather than casting.

- [ ] **Step 8: Look at it**

Start the dev server if it is not already up: `npm run dev -- --port 3111`.

Open `http://localhost:3111/radar-preview?screen=editions` and confirm the heading, the pipeline columns and the sent cards read from `label`. The harness fixture in `app/radar-preview/harness.tsx` will need `title`, `kind`, `publishDate` and `label` added to its edition rows; add them, giving one fixture a special edition with a name so that path is visible.

Take a viewport screenshot, not `fullPage`: a `fullPage` capture renders the sticky header at its scroll position, which looks like the title being clipped and is an artefact of the capture.

- [ ] **Step 9: Commit**

```bash
git add app/dashboard/send/page.tsx app/radar-preview/harness.tsx tests/unit/edition-list-view.test.ts
git commit -m "Editions: several editions can be open, and creating one is always reachable"
```

---

### Task 6: The label replaces "this week" everywhere it is wrong

**Files:**
- Modify: `components/proposal/state.ts:41-53`
- Modify: `components/proposal/copy.ts`
- Modify: `components/proposal/proposal-view.tsx`
- Modify: `app/dashboard/page.tsx:422`
- Modify: `app/dashboard/send/[id]/page.tsx` (lines 108, 951, 1315, 2200)
- Modify: `app/dashboard/generate/page.tsx` (lines 35, 753-755, 828)
- Modify: `app/dashboard/analytics/page.tsx` (lines 36, 268)
- Modify: `app/api/activity/route.ts` (lines 100-114)
- Modify: `lib/email/edition-data.ts`
- Modify: `tests/unit/proposal-copy.test.ts`
- Modify: `tests/unit/edition-email.test.ts`

**Interfaces:**
- Consumes: `label` from the API payloads in Tasks 3 and 4.
- Produces: `Proposal` gains `title: string | null`, `kind: "WEEKLY" | "SPECIAL"`, `publishDate: string` and `label: string`. `sendConfirmation` takes `label: string` in place of `week` and `year`. `EditionInput` in `lib/email/edition-data.ts` gains `label: string`.

- [ ] **Step 1: Write the failing copy test**

In `tests/unit/proposal-copy.test.ts`, add:

```ts
  /**
   * RQ-008: the confirmation names the edition rather than the week.
   *
   * "Send week 32 of 2026?" is wrong the moment two editions share a week, and it was
   * never right for a special edition.
   */
  it("names the edition in the confirmation", () => {
    expect(
      sendConfirmation({
        label: "AI Act special",
        articles: 3,
        projects: 1,
        recipients: 240,
      })
    ).toContain("AI Act special");
  });

  it("does not say the word week when the edition has a name", () => {
    const text = sendConfirmation({
      label: "Year in review",
      articles: 5,
      projects: 0,
      recipients: 12,
    });

    expect(text).not.toMatch(/week/i);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/proposal-copy.test.ts`

Expected: FAIL, `sendConfirmation` still requires `week` and `year`.

- [ ] **Step 3: Change the copy helper and its callers**

In `components/proposal/copy.ts`, change `sendConfirmation`'s parameter from `{ week: number; year: number; articles: number; projects: number; recipients: number }` to `{ label: string; articles: number; projects: number; recipients: number }`, and replace every `week ${week} of ${year}` in the returned sentence with `${label}`.

In `components/proposal/state.ts`, add to `Proposal` after `year: number;`:

```ts
  /** RQ-008: the edition's own name, null on a weekly. */
  title: string | null;
  kind: "WEEKLY" | "SPECIAL";
  publishDate: string;
  /** What to call it on screen: the title, or the week label when there is none. */
  label: string;
```

In `components/proposal/proposal-view.tsx`:
- the first `RadarPanel` title (line 108) becomes `title={`In ${proposal.label}`}`
- the empty-state copy (lines 126-129) loses "This week's": `This proposal is empty. Nothing failed: either nothing cleared your relevance threshold, or every story is still awaiting a decision.`
- the projects panel note (line 200) becomes `` `No projects in ${proposal.label}.` ``
- the dialog title (lines 332-334) becomes `<DialogTitle>Send {proposal.label}?</DialogTitle>`
- the `sendConfirmation` call (lines 329-335) passes `label: proposal.label` instead of `week` and `year`

In `app/dashboard/page.tsx:422`, replace `proposal ? `Week ${proposal.week} · ${proposal.year}` : "This week"` with `proposal ? proposal.label : "This week"`.

In `app/dashboard/send/[id]/page.tsx`, add `title`, `kind`, `publishDate` and `label` to the `Edition` interface at line 108, and replace `Week {edition.week}, {edition.year}` at 1315 and 2200 with `{edition.label}`, and the eyebrow at 951 with `` eyebrow={`Edition · ${edition.label}`} ``.

In `app/dashboard/generate/page.tsx`, add `label: string` to the edition interface at line 35, replace the two strings at 753-755 with `` `${selectedEdition.label} is drafted` `` and `` `${selectedEdition.label} is ready to write` ``, and the option text at 828 with `{edition.label} · {edition.articleCount}{" "}`.

In `app/dashboard/analytics/page.tsx`, add `label: string` at line 36 and replace line 268 with `{edition.label}`.

In `app/api/activity/route.ts`, add `title: true` to the select at line 100 and replace the description at 112 with:

```ts
          description: `${editionLabel(edition)} sent`,
```

importing `editionLabel` from `@/lib/editions/identity`. Add `title` to the metadata object at 114.

- [ ] **Step 4: Run the copy test to verify it passes**

Run: `npx vitest run tests/unit/proposal-copy.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the failing email test**

In `tests/unit/edition-email.test.ts`, add:

```ts
  /**
   * RQ-008: the subject and the edition label follow the edition's name.
   *
   * They were built from the week number, so a special edition would have gone out
   * subject-lined as a weekly issue of a week it did not belong to.
   */
  it("uses the edition label in the subject and the eyebrow", () => {
    const email = buildEditionEmail({
      articles: [{ title: "A story", sourceUrl: "https://example.com/a" }],
      projects: [],
      week: 32,
      year: 2026,
      label: "AI Act special",
    });

    expect(email.editionLabel).toBe("AI Act special");
    expect(email.subject).toBe("AI Radar - AI Act special");
  });

  it("keeps the weekly subject when the label is the week label", () => {
    const email = buildEditionEmail({
      articles: [{ title: "A story", sourceUrl: "https://example.com/a" }],
      projects: [],
      week: 32,
      year: 2026,
      label: "Week 32 · 2026",
    });

    expect(email.subject).toBe("AI Radar Weekly - Week 32, 2026");
  });
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/unit/edition-email.test.ts`

Expected: FAIL, `editionLabel` is `"Week 32"` and the subject ignores the label.

- [ ] **Step 7: Change the email mapping**

In `lib/email/edition-data.ts`, add to `EditionInput` after `year: number;`:

```ts
  /**
   * What this edition is called: the title, or the week label. Supplied rather than
   * derived, because this module is reachable from client components through
   * content-renderer and must not import the Prisma-facing helpers.
   */
  label?: string;
```

and replace the `editionLabel` and `subject` lines in the returned object with:

```ts
    editionLabel: input.label ?? `Week ${input.week}`,
    /**
     * A named edition gets its name in the subject. A weekly one keeps the wording
     * subscribers already recognise, which is why this branches on the label rather
     * than always interpolating it.
     */
    subject: isWeekLabel(input.label, input.week, input.year)
      ? `AI Radar Weekly - Week ${input.week}, ${input.year}`
      : `AI Radar - ${input.label}`,
```

and add above `buildEditionEmail`:

```ts
/** True when the label is just the derived week label, so nothing was named. */
function isWeekLabel(
  label: string | undefined,
  week: number,
  year: number
): boolean {
  return !label || label === `Week ${week} · ${year}`;
}
```

Then pass `label` at every `buildEditionEmail` call site: `app/api/email/preview/route.ts` (lines 62, 177, 198), `app/api/email/send-all/route.ts` (lines 314, 346, 367) and `app/api/email/send-test/route.ts` (line 91). Each of those already loads the edition; add `title: true` to its select where needed and pass `label: editionLabel(edition)`.

- [ ] **Step 8: Run the suite and typecheck**

Run: `npx vitest run && npx tsc --noEmit`

Expected: suite green, no type output. `tsc` is what finds any label call site missed above; fix each one it names.

- [ ] **Step 9: Look at it**

With the dev server up, open each of these and confirm nothing still says "this week" about an edition that has a name:

- `http://localhost:3111/radar-preview?screen=feed`
- `http://localhost:3111/radar-preview?screen=editions`
- `http://localhost:3111/radar-preview?screen=generate`

The harness fixtures need `title`, `kind`, `publishDate` and `label` on their proposal and edition objects. Give at least one fixture a named special edition.

- [ ] **Step 10: Commit**

```bash
git add components/proposal app/dashboard app/api/activity/route.ts app/api/email lib/email/edition-data.ts app/radar-preview/harness.tsx tests/unit/proposal-copy.test.ts tests/unit/edition-email.test.ts
git commit -m "Editions: screens and the subject line name the edition, not the week"
```

---

### Task 7: An unresolved link is marked rather than stored in silence

Independent of everything above. It closes finding D4.

**Files:**
- Create: `lib/inbound/link-outcome.ts`
- Modify: `prisma/schema.prisma` (`model Article`)
- Modify: `lib/inbound/process.ts:363-412`
- Modify: `lib/curation/curator.ts` (`curateArticle` signature)
- Test: `tests/unit/inbound-unresolved-link.test.ts` (create)

**Interfaces:**
- Consumes: `unwrapUrl(raw: string, options?): Promise<{ url: string; unwrapped: boolean; hops: number; note: string | null }>` from `lib/curation/unwrap-url.ts`.
- Produces:
  - `Article.sourceUnresolved Boolean @default(false)`
  - `curateArticle(url, title, content, organizationId, options?: { sourceUnresolved?: boolean })`
  - `classifyUnwrap(result: { unwrapped: boolean; note: string | null }): "resolved" | "refused" | "unresolved"`, exported from **`lib/inbound/link-outcome.ts`**.

> **Why the classifier gets its own module rather than living in `process.ts`.**
> `lib/inbound/process.ts` imports `@/lib/db`, which opens a connection pool at import
> time, so a unit test that imports it pays for a database connection to test a pure
> function. This repository already solved that once: `lib/inbound/tally.ts` exists so
> `tests/unit/inbound-process-order.test.ts` can test `dedupeByUrl` and `tallyItems`
> without importing `process.ts`. Follow that pattern, do not repeat the mistake of
> exporting the helper from `process.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/inbound-unresolved-link.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyUnwrap } from "@/lib/inbound/link-outcome";

/**
 * RQ-008, finding D4: an unwrap that failed used to be indistinguishable from one that
 * succeeded.
 *
 * `ingestForSource` only dropped an item when the note mentioned a private address or a
 * disallowed target. Every other failure, a redirect loop, five hops exhausted, a five
 * second timeout against a slow publisher, fell through and created the article with the
 * newsletter's tracking URL as its source. Nothing recorded it, so the edition would go
 * out linking to link.mail.beehiiv.com with "Beehiiv" as the publisher.
 *
 * Three outcomes now, and each one is a different decision.
 */

describe("classifyUnwrap", () => {
  it("calls a followed chain resolved", () => {
    expect(classifyUnwrap({ unwrapped: true, note: null })).toBe("resolved");
  });

  it("calls a URL that was never a wrapper resolved", () => {
    expect(classifyUnwrap({ unwrapped: true, note: null })).toBe("resolved");
  });

  it("refuses a target the safety check rejected as private", () => {
    expect(
      classifyUnwrap({ unwrapped: false, note: "stopped: not a public address" })
    ).toBe("refused");
  });

  it("refuses a target the safety check said was not allowed", () => {
    expect(
      classifyUnwrap({ unwrapped: false, note: "stopped: the scheme is not allowed" })
    ).toBe("refused");
  });

  it("marks an exhausted hop budget unresolved rather than refusing it", () => {
    expect(
      classifyUnwrap({ unwrapped: false, note: "stopped after 5 hops" })
    ).toBe("unresolved");
  });

  it("marks a redirect loop unresolved", () => {
    expect(
      classifyUnwrap({ unwrapped: false, note: "stopped: the redirects loop" })
    ).toBe("unresolved");
  });

  it("marks a network failure unresolved, which is the timeout case", () => {
    expect(
      classifyUnwrap({
        unwrapped: false,
        note: "stopped: The operation was aborted due to timeout",
      })
    ).toBe("unresolved");
  });

  it("marks a non-URL redirect target unresolved", () => {
    expect(
      classifyUnwrap({
        unwrapped: false,
        note: "stopped: the redirect target was not a URL",
      })
    ).toBe("unresolved");
  });

  it("marks an unwrapped-false result with no note unresolved", () => {
    expect(classifyUnwrap({ unwrapped: false, note: null })).toBe("unresolved");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/inbound-unresolved-link.test.ts`

Expected: FAIL, `classifyUnwrap is not a function`.

- [ ] **Step 3: Add the column**

In `prisma/schema.prisma`, add to `model Article` after `contentHash String?`:

```prisma
  /**
   * True when this article's URL is the wrapper the newsletter used, not the article's
   * own address, because the redirect chain could not be followed.
   *
   * Finding D4 of 6 August 2026: the wrapper was stored in silence and nothing recorded
   * it, so an edition could go out linking to link.mail.beehiiv.com with "Beehiiv" named
   * as the publisher. The flag is what lets a screen say so and an editor decide.
   */
  sourceUnresolved Boolean @default(false)
```

Run: `npx prisma db push && npx prisma generate`

Expected: the column is added with a default, so no backfill is needed: every existing row is `false`, which is the honest reading of a corpus written before the distinction existed.

- [ ] **Step 4: Write the classifier and use it**

Create `lib/inbound/link-outcome.ts`, a module with no imports at all:

```ts
export type UnwrapOutcome = "resolved" | "refused" | "unresolved";

/**
 * What to do with the result of unwrapping a digest item's link.
 *
 * Three outcomes, because there are three decisions. `resolved` is the article's own
 * address. `refused` is a target the safety check rejected, which must not be stored or
 * fetched by anything later. `unresolved` is every other failure: the chain exists but
 * could not be followed, so what we hold is the newsletter's wrapper.
 *
 * `unresolved` used to be silently treated as `resolved`, which is finding D4.
 */
export function classifyUnwrap(result: {
  unwrapped: boolean;
  note: string | null;
}): UnwrapOutcome {
  if (result.unwrapped) return "resolved";

  const note = result.note ?? "";

  if (note.includes("not a public address") || note.includes("not allowed")) {
    return "refused";
  }

  return "unresolved";
}
```

Then in `lib/inbound/process.ts`, add to the imports:

```ts
import { classifyUnwrap } from "@/lib/inbound/link-outcome";
```

Replace the refusal block inside the item mapper (lines 371-385) with:

```ts
      const unwrapped = await unwrapUrl(item.url);
      const outcome = classifyUnwrap(unwrapped);

      if (outcome === "refused") {
        // A URL the safety check refused is not stored. Something else would fetch it later.
        return {
          created: 0,
          duplicate: false,
          note: `${email.id}: refused a link (${unwrapped.note})`,
        };
      }
```

and change the `curateArticle` call below it to pass the flag and to say so in the note:

```ts
      const outcomeOfCuration = await curateArticle(
        unwrapped.url,
        item.title,
        content,
        source.organizationId,
        { sourceUnresolved: outcome === "unresolved" }
      );

      if (outcomeOfCuration.success) {
        return {
          created: 1,
          duplicate: false,
          /**
           * Stated on the run rather than only on the row. A note is what the person
           * reading the ingest result sees, and "this article links to the newsletter,
           * not the publisher" is exactly what they need to know.
           */
          note:
            outcome === "unresolved"
              ? `${email.id}: ${item.url} could not be unwrapped (${unwrapped.note}), so the article links to the newsletter's wrapper`
              : null,
        };
      }
      if (outcomeOfCuration.isDuplicate) return { created: 0, duplicate: true, note: null };

      return {
        created: 0,
        duplicate: false,
        note: `${email.id}: ${item.url} ${outcomeOfCuration.error}`,
      };
```

- [ ] **Step 5: Accept the flag in curateArticle**

In `lib/curation/curator.ts`, change `curateArticle`'s signature to:

```ts
export async function curateArticle(
  url: string,
  title: string,
  content: string,
  organizationId: string,
  options: {
    /** RQ-008 D4: true when `url` is a wrapper the redirect chain would not resolve. */
    sourceUnresolved?: boolean;
  } = {}
): Promise<{
```

and add to the `prisma.article.create` data object, after `organizationId,`:

```ts
        sourceUnresolved: options.sourceUnresolved ?? false,
```

- [ ] **Step 6: Run the test and the suite**

Run: `npx vitest run tests/unit/inbound-unresolved-link.test.ts && npx vitest run && npx tsc --noEmit`

Expected: the new file passes with 9 tests, the suite is green, no type output. `tests/unit/inbound-process-order.test.ts` may assert on the notes the item loop returns; if it fails, read the assertion and extend it rather than weakening it.

- [ ] **Step 7: Show it on the article detail screen**

In `app/dashboard/articles/[id]/page.tsx`, first add `Callout` to the controls import on line 28, which currently reads `import { EmptyState, LoadError, SkeletonRows } from "@/components/radar/controls";`:

```ts
import { Callout, EmptyState, LoadError, SkeletonRows } from "@/components/radar/controls";
```

Then, in the attribution block that renders the source stamp and the URL, add below the URL line:

```tsx
            {article.sourceUnresolved && (
              <Callout tone="warn" title="This link is the newsletter's, not the publisher's">
                The redirect chain could not be followed, so the address above is the
                tracking link the newsletter used. Check where it really goes before this
                story leaves in an edition.
              </Callout>
            )}
```

Add `sourceUnresolved: true` to the select in `lib/queries.ts`'s `getArticleById`, and to the `article` shape the page types.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma lib/inbound/link-outcome.ts lib/inbound/process.ts lib/curation/curator.ts lib/queries.ts "app/dashboard/articles/[id]/page.tsx" tests/unit/inbound-unresolved-link.test.ts
git commit -m "Inbound: an unwrap that failed is recorded, not stored as if it worked"
```

---

## Finishing

- [ ] **Run the whole thing**

```bash
npx vitest run
npx tsc --noEmit
npx next build
```

Expected: at least 800 tests passing, no type output, a clean build. `next build` is the step that catches a cron schedule or a route config the tests do not: a deploy failed for eleven hours on 3 August 2026 because a sub-daily cron schedule is refused at build time and every local signal was green.

- [ ] **Probe the deployed route after pushing**

A green local build says nothing about whether Vercel shipped it. After the push, fetch `/api/editions` from the deployed URL and confirm a response carries `label`, `kind` and `publishDate`. A Vercel environment change does nothing until the next deployment, and neither does a schema change: `npx prisma db push` runs against the database from wherever it is invoked, so confirm the production database has the new columns before the deployment that expects them goes live.

- [ ] **Update the docs**

Add a row to the Architecture Decisions table in `CLAUDE.md`: an edition is identified by its publication date and its name, the ISO week is derived, and `weeklySlot` is what keeps the weekly schedule idempotent.

Note in `.claude/docs/requirements/STATUS.md` that findings A1, A2, A6, B1 (partly) and D4 from
`FINDINGS-2026-08-06-flexibility-and-provenance.md` are closed, and that the four P0 items other than D4 are still open.

## What this plan deliberately does not do

Each of these is a real finding from `FINDINGS-2026-08-06-flexibility-and-provenance.md` and each is out of scope here, so nobody implementing this plan has to guess:

- **The `PATCH /api/articles/[id]` tenant hole (P0).** A security fix with no relation to the edition model. It belongs in its own change, reviewed on its own.
- **`publishedAt: new Date()` in `curateArticle` (P0).** Fixing it needs a decision about what to do with the thousands of rows already carrying a false date, and a new `capturedAt` column. Its own plan.
- **`Article` to `RSSSource` and `InboundEmail` relations (P0), and a screen for received emails (P0).** The provenance work. Its own plan, and the largest of the three.
- **Article states beyond the three that exist (B1), drag and drop (B2), editing a title (B3).** These become worth doing once an edition is no longer a week, and doing them first would mean designing them against the model this plan replaces.
- **A date on the article in the email template (C4).** Blocked on the `publishedAt` fix: rendering the date that exists today would print the capture time as the publication date to every subscriber.
- **The 390px break in `machine-status.tsx` (E1).** A two-line CSS fix, unrelated to any of this. Fold it into whichever change next touches that file, or do it on its own in five minutes.
