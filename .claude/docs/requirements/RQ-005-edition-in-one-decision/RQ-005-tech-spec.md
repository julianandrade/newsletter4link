# Req ID: RQ-005-edition-in-one-decision, technical specification

> One spec for the whole change. This project has no backend and frontend split,
> as `docs/AIDLC.md` records: a feature touches a route handler and a screen
> together, so the route handlers are part of the same unit of work as the
> screens.
>
> Sources, all binding: [`RQ-005.md`](RQ-005.md),
> [`RQ-005-complete-requirement.md`](RQ-005-complete-requirement.md), `CLAUDE.md`,
> `docs/AIDLC.md`.
>
> Written 4 August 2026 against the working tree at commit `428736f`. Every file
> path, signature and defect named below was read in the code, not inferred.
>
> Stack: Next.js 16 App Router, React 19, TypeScript, Prisma 7 against Supabase
> Postgres. Any instruction from a shared agent that assumes .NET or Angular does
> not apply here.

---

## 1. What this spec has to produce

Three units, built so they never touch the same file:

| Unit | Name | Covers | Lands |
|---|---|---|---|
| **A** | Edition lifecycle | `Edition.archivedAt`, archive as the bulk action for sent editions, delete only for never-sent, OWNER-only force delete that removes the edition's `EmailEvent` rows in the same transaction, the same fix on the existing single-edition DELETE, the approval record, and the schema for all three units | first |
| **B** | The proposal | Assembling the week's candidate edition from approved and high-scoring pending articles, an API to read it, a schedule that keeps it current. It proposes and never sends | second |
| **C** | The screens | The Feed becomes the proposal, the Review queue becomes a filter of that view, approving says where the work went | third |

Mapping to the specification's own split: A is RQ-005_01 plus the parts of Story 2
and Story 8 that are edition state, B is the server half of RQ-005_03 and
RQ-005_04, C is RQ-005_02 plus the screen half of RQ-005_03 and RQ-005_04.

### 1.1 The rule that keeps them apart

**No file appears under two units.** Section 6 lists ownership per unit and
section 7 lists the only five points where one unit consumes another's output.
If an implementer finds work that seems to need a file another unit owns, that is
a spec defect: raise it rather than editing across the line.

Three files that would otherwise be fought over are assigned deliberately:

- `prisma/schema.prisma` belongs to **A**. Every column any unit needs, including
  the ones only B writes, lands in A's single schema change.
- `app/dashboard/send/page.tsx` belongs to **A**, because the archive filter, the
  bulk bar and the force-delete confirmation all live there. C does not touch it,
  and does not reuse its `PipelineColumn` or `ArticleCard` helpers.
- `lib/queries.ts` and `lib/db/tenant.ts` belong to **A**.

---

## 2. The shape of the change, in one page

Today a person has to know the machine: run curation, work the queue, create an
edition, finalize it, preview it, send it. After this change:

1. A daily cron assembles or tops up the current ISO week's proposal for every
   organization. It never sends (unit B, conflict C1 in the specification).
2. Opening `/dashboard` reads `GET /api/editions/proposal`, which ensures a
   proposal for the current week exists and returns it with the week's counts and
   the pipeline status in one response (units B and C).
3. The screen shows the assembled edition, its rendered form, the machine's
   status, and one primary control that approves and sends. The queue is a view of
   the same screen (unit C).
4. Approving an article says where it went and offers to go there and to undo
   (unit C).
5. Sending records who approved it and when, and cannot happen twice (unit A).
6. Nothing sent is ever deleted by accident: sent means archive, delete means
   never-sent, force delete is an OWNER's decision against stated numbers and
   takes the delivery history with it in the same transaction (unit A).

### 2.1 Defects found in the code that this change closes

Each was read in the tree. The specification lists C1 to C8; these are those,
with the file and the unit that owns the fix, plus three the specification did
not have.

| # | Defect | Where | Unit |
|---|---|---|---|
| C1 | An unattended send exists and D1 forbids it | `app/api/cron/weekly-send/route.ts`, `vercel.json` | B |
| C2 | Single-edition GET, PATCH and DELETE use bare `prisma`, no auth at all, so any authenticated request reaches another organization's edition by id | `app/api/editions/[id]/route.ts` | A |
| C3 | `includeSent: true` deletes a sent edition and leaves its `EmailEvent` rows pointing at nothing | `app/api/editions/bulk/route.ts` | A |
| C4 | Single delete refuses anything that is not `DRAFT`, so a finalized-but-never-sent edition cannot be deleted, and it cleans up no events | `app/api/editions/[id]/route.ts` | A |
| C6 | `/api/status` counts across every organization | `app/api/status/route.ts` | out of scope, flagged, nothing here reads it |
| C7 | Two week helpers disagree about the year | see 2.2 | A and B |
| C8 | Sending asks for no role, so a VIEWER can send to every subscriber | `app/api/email/send-all/route.ts` | A |
| **N1** | `GET /api/articles/approved` uses bare `prisma` with no auth and no organization filter, so the approved pool leaks across tenants. It is the endpoint behind the destination view Story 3 points at | `app/api/articles/approved/route.ts` | B |
| **N2** | `getCurrentJob()` and `getJobs()` count and read curation jobs across every organization, which is what AC-5.5 forbids for any displayed count | `lib/curation/job-manager.ts` | B, by not using them: see 4.3 |
| **N3** | `POST /api/articles/:id/approve` and `.../reject` call `updateArticleStatus`, which is bare `prisma.article.update` by id with no organization check, and neither route calls `requireOrgContext` at all | `app/api/articles/[id]/approve/route.ts`, `.../reject/route.ts`, `lib/queries.ts` | C for the routes, A for `lib/queries.ts` |

### 2.2 The week, and how many helpers there are

The specification's conflict C7 says two helpers. There are nine. All nine compute
the same ISO week number; five of them pair it with `date.getFullYear()` instead
of the ISO week-year, which is the disagreement that bites in the days around 1
January.

| Copy | Verdict |
|---|---|
| `app/dashboard/send/page.tsx#currentWeekAndYear` | deleted, replaced by the shared helper (A) |
| `app/api/email/send-all/route.ts#getWeekNumber` | deleted, replaced (A) |
| `lib/queries.ts#getWeekNumber` | delegates to the shared helper, and `getCurrentEdition` stops using the calendar year (A) |
| `app/api/cron/weekly-send/route.ts#getWeekNumber` | goes with the file (B) |
| `lib/email/template-renderer.ts`, `app/api/email/preview`, `app/api/email/send-test`, `app/api/generation/{generate,stream,subject-lines}` | **out of scope, flagged.** They are on the render and generation paths, not the proposal path. Converging them is a small separate requirement; doing it here would widen this change into six files no unit owns |

AC-1.8 is therefore satisfied for everything on the RQ-005 path: the proposal, the
schedule, the editions screen, the send endpoint and `lib/queries` all get their
week from one function. The remaining copies are recorded as a follow-up, not
quietly left.

---

## 3. Data model, all of it in unit A

One change to `prisma/schema.prisma`, applied with `npx prisma db push` (this
project has no `prisma/migrations` directory), followed by `npx prisma generate`.

```prisma
model Edition {
  // ... unchanged fields ...

  // RQ-005 action 8, D5: archive is what happens to a sent edition. Absence of
  // the marker is the default, visible state.
  archivedAt DateTime?

  // RQ-005 BR-011: the approval that caused the send, recorded so a sent edition
  // can always answer who and when. Immutable once set.
  approvedAt      DateTime?
  approvedByEmail String?
  approvedById    String? // Supabase user id, survives the person leaving

  // RQ-005 action 1: the last time the schedule topped this proposal up. The
  // top-up only considers articles collected after it, so an article an editor
  // removed is never silently added back.
  proposalRefreshedAt DateTime?

  // RQ-005 BR-013: the association that used to point at nothing.
  emailEvents EmailEvent[]

  @@index([archivedAt])
}

model EmailEvent {
  // ... unchanged fields ...

  // RQ-005 BR-013: editionId was a bare String with no relation and no cascade,
  // so deleting an edition orphaned its delivery history instead of removing it.
  edition Edition @relation(fields: [editionId], references: [id], onDelete: Cascade)
}
```

Notes an implementer needs:

- `archivedAt` is orthogonal to `status`. The status enum is untouched: no
  `ARCHIVED` member, because an archived edition is still a sent edition and the
  analytics that read `status` must keep working.
- The `EmailEvent` relation is the structural half of BR-013. Unit A still deletes
  the events explicitly inside the force-delete transaction, for two reasons: the
  count reported to the user (AC-8.6) has to be read anyway, and the code must
  stay correct if a future schema change drops the constraint.
- **Before `db push`, prove there are no orphans.** The relation cannot be added
  over rows that point at nothing:

  ```sql
  select count(*) as orphans
  from "EmailEvent" e
  left join "Edition" ed on ed.id = e."editionId"
  where ed.id is null;
  ```

  The specification's baseline says 71 events across 19 editions and zero
  orphans. If this returns anything other than 0, stop and report it: the rows
  have to be deleted or repointed first, and that decision is the owner's, not
  the implementer's. AC-8.10 makes the same query part of acceptance after the
  work lands.
- Nothing creates an `EmailEvent` for an edition that does not exist:
  `lib/email/sender.ts`, `app/api/email/send-all/route.ts`, `lib/queries.ts`
  (unsubscribe) and `app/api/webhooks/resend/route.ts` all derive `editionId`
  from a real edition or from an existing SENT event. Ad-hoc sends log no events
  at all. The constraint is therefore safe for the write paths as they stand.

---

## 4. Unit by unit

### 4.1 Unit A: edition lifecycle

**Covers** Action 7, Action 8, D5, BR-013, BR-014, the approval record for
BR-011, conflicts C2, C3, C4, C7 and C8, and defect N3's `lib/queries.ts` half.

**Ships alone.** Nothing in it depends on B or C.

#### 4.1.1 New modules

`lib/radar/week.ts`

```ts
/** RQ-005: one answer to "which week is it", for the whole product. */
export interface IsoWeek { week: number; year: number }
export function isoWeekAndYear(date?: Date): IsoWeek;   // ISO 8601 week and week-year
export function isoWeekStart(week: number, year: number): Date; // Monday 00:00 UTC
export function weekLabel(week: number, year: number): string;  // "Week 32 · 2026"
```

The year returned is the ISO week-year, not `getFullYear()`. That is the bug in
the copies listed in 2.2: 31 December 2026 is week 53 of 2026, and 1 January 2027
is also week 53 of 2026.

`lib/auth/roles.ts`

```ts
/** RQ-005: the role hierarchy, in a module a client component may import. */
export const ROLE_ORDER = ["VIEWER", "EDITOR", "ADMIN", "OWNER"] as const;
export type RoleName = (typeof ROLE_ORDER)[number];
export function hasRoleAtLeast(role: RoleName | string | null, min: RoleName): boolean;
```

`lib/auth/context.ts` already exports `hasRole`, but that module imports
`next/headers` and the Supabase server client, so no client component can touch
it. `hasRole` and `requireRole` in `context.ts` are changed to delegate to
`hasRoleAtLeast` so there is one hierarchy, not two. That is the only change to
`context.ts`.

`components/radar/use-role.ts`

```ts
/** RQ-005: the current member's role, for hiding controls a role cannot use.
 *  The server is the authority; this only decides what to render. */
export function useOrgRole(): {
  role: RoleName | null;
  loading: boolean;
  error: string | null;
  atLeast: (min: RoleName) => boolean;
};
```

Reads `GET /api/organizations/current`, which already returns
`{ organization, membership: { role } }`. While loading, `atLeast` returns
`false`, so a control never flashes into view for someone who may not use it.

`lib/editions/lifecycle.ts`

The pure planner plus the four writes. The planner is pure so it can be unit
tested without a database, which is how every test in `tests/unit/` works.

```ts
/** RQ-005 action 7 and 8: what a bulk request may actually do. */
export type EditionBulkAction = "archive" | "unarchive" | "delete" | "forceDelete";
export type HeldBackReason =
  | "not-found"      // another organization's id, or no such edition
  | "already-sent"   // delete refuses it, archive is the action for it
  | "already-archived"
  | "not-archived";

export interface BulkTarget {
  id: string;
  status: "DRAFT" | "FINALIZED" | "SENT";
  sentAt: Date | null;
  archivedAt: Date | null;
  week: number;
  year: number;
}

export interface BulkPlan {
  apply: string[];
  heldBack: Array<{ id: string; reason: HeldBackReason }>;
}

export function planEditionBulk(
  action: EditionBulkAction,
  requestedIds: string[],
  resolved: BulkTarget[]
): BulkPlan;

/** RQ-005 AC-7.6 and AC-8.6: the sentence that says what happened, with numbers. */
export function describeBulkOutcome(
  action: EditionBulkAction,
  outcome: { requested: number; affected: number; heldBack: BulkPlan["heldBack"]; deletedEvents?: number }
): string;

export const MAX_BULK_EDITIONS = 500;
```

Planning rules, which the tests pin:

| Action | `apply` | `heldBack` |
|---|---|---|
| `archive` | every resolved edition whose `archivedAt` is null | `already-archived`, `not-found` |
| `unarchive` | every resolved edition whose `archivedAt` is set | `not-archived`, `not-found` |
| `delete` | every resolved edition whose `sentAt` is null, whatever its status | `already-sent`, `not-found` |
| `forceDelete` | every resolved edition | `not-found` |

`delete` keys on `sentAt`, not on `status === "DRAFT"`, which is conflict C4: a
finalized edition that never went out has no delivery history, so there is
nothing to orphan and nothing to preserve. `forceDelete` accepts a mixed
selection rather than refusing it, because an OWNER who has read a confirmation
stating the real numbers has already made the decision the restriction exists to
protect.

The writes, all through the tenant client:

```ts
export async function archiveEditions(db: TenantClient, ids: string[]): Promise<number>;
export async function unarchiveEditions(db: TenantClient, ids: string[]): Promise<number>;

/** Never-sent only. Deletes any stray events for the same ids in the same
 *  transaction: none should exist, and BR-013 does not depend on that. */
export async function deleteNeverSentEditions(
  db: TenantClient, ids: string[]
): Promise<{ editions: number; events: number }>;

/** RQ-005 AC-8.5, AC-8.7, AC-8.9: events and editions go together or not at all. */
export async function forceDeleteEditions(
  db: TenantClient, ids: string[]
): Promise<{ editions: number; events: number; recipients: number }>;

/** RQ-005 AC-8.6: the numbers the confirmation states, read at the moment of asking. */
export async function countDeliveryImpact(
  db: TenantClient, ids: string[]
): Promise<{ events: number; recipients: number }>;

/** RQ-005 AC-2.5, AC-2.6: sent, with the approval recorded, once. */
export async function markEditionSent(
  db: TenantClient,
  editionId: string,
  approver: { email: string; supabaseUserId: string }
): Promise<{ alreadySent: boolean; approvedByEmail: string | null; approvedAt: Date | null }>;
```

Tenancy inside a transaction, stated because it is the rule most easily broken:
the id list passed to any of these has already been resolved through
`db.edition.findMany`, so it contains only this organization's ids. Inside
`db.$raw.$transaction` the edition delete still carries `organizationId` in its
where clause; the `EmailEvent` delete carries `editionId: { in: ids }`, which is
the only scope that model has. `db.$raw` is the tenant client's own documented
escape hatch and is what `app/api/analytics/route.ts` already uses for
`emailEvent`.

`markEditionSent` also does one thing that is easy to miss: any article in the
edition still at `PENDING_REVIEW` becomes `APPROVED` in the same transaction. D3
makes the edition the unit of approval, so an article can be proposed while
pending, and an article that has gone to subscribers must not still read as
awaiting a decision.

#### 4.1.2 API contracts

**`PATCH /api/editions/bulk`**, rewritten.

```
Request  { action: "archive" | "unarchive" | "delete" | "forceDelete",
           ids: string[], dryRun?: boolean }

Response 200
{ success: true, action, requested, affected, affectedIds: string[],
  heldBack: [{ id, reason }], deletedEvents?: number,
  recipientsAffected?: number, message: string }

Response 200, dryRun (forceDelete only, no writes)
{ success: true, dryRun: true, action: "forceDelete",
  editions: number, events: number, recipients: number,
  heldBack: [{ id, reason }] }
```

- `includeSent` is gone. A request carrying it is answered 400 naming the
  replacement actions, so an old client fails loudly rather than deleting
  something.
- Roles: `archive`, `unarchive`, `delete` require EDITOR. `forceDelete`, dry run
  included, requires OWNER.
- Validation before anything else: `action` in the set, `ids` a non-empty array of
  non-empty strings, de-duplicated, at most `MAX_BULK_EDITIONS`, and a request
  above the cap is refused with the number in the message (AC-7.7).
- Targets are resolved with `db.edition.findMany({ where: { id: { in: unique } } })`,
  so another organization's id resolves to nothing and is reported as
  `not-found`, never as 403 and never as the row (AC-7.8).
- `try`/`catch`. `Unauthorized` to 401, `Forbidden` to 403, anything else logged
  and answered 500 with a generic message.

**`GET /api/editions`**, extended.

`?archived=exclude | only | all`, default `exclude` (AC-8.3). The payload gains
`archivedAt`, `approvedAt` and `approvedByEmail` so the list can show who
approved a send (AC-2.6).

**`GET /api/editions/[id]`**, **`PATCH`**, **`DELETE`**, all three fixed (C2).

- Every handler calls `requireOrgContext` and reads through the tenant client. An
  edition outside the caller's organization answers 404.
- `PATCH` requires EDITOR. A sent edition is refused 409 with a message naming
  who approved it and when (AC-6.7, AC-2.10). Article and project ids in the body
  are validated against `db.article.findMany` and `db.project.findMany`, so a
  cross-tenant id cannot be written into a join row. The existing transaction and
  ordering semantics are otherwise unchanged, because C's add, remove and reorder
  controls call this route.
- `DELETE` requires EDITOR, allows anything with `sentAt === null` (C4), removes
  any events for that id in the same transaction (AC-8.8), and answers 409 for a
  sent edition with a message pointing at archive and, for an OWNER, force
  delete.
- Single-edition archive and force delete go through the bulk route with one id.
  There is no second endpoint for them.

**`POST /api/email/send-all`**, hardened. Not replaced: it already handles
templates, drafts, custom data, batching, provider choice, event logging and the
SharePoint publish, and duplicating that for a new route would be the worst
outcome available.

- `requireRole(ctx, "EDITOR")` (C8, AC-2.7).
- The send record goes through `markEditionSent`, so `status`, `sentAt`,
  `approvedAt`, `approvedByEmail`, `approvedById` and the pending-to-approved
  flip happen in one transaction (AC-2.6).
- An edition already sent answers 409, and the message names who approved it and
  when (AC-2.10). Today it answers 400 with "This edition has already been sent".
- Partial failure keeps the existing behaviour, which is already what AC-2.8
  requires: the edition reads as sent when at least one recipient received it,
  and the response carries `sent` and `failed`. Outright failure sends nothing,
  marks nothing and records no approval (AC-2.9), which the existing
  `if (result.sent > 0)` guard already gives.
- Its local `getWeekNumber` goes, in favour of `isoWeekAndYear`.

#### 4.1.3 Screen: `app/dashboard/send/page.tsx`

- **Archive filter.** A `ChipGroup` of Active, Archived, All, driving
  `?archived=` on the editions fetch. Changing it prunes the selection to what is
  still visible, which `useSelection` already does when `visibleIds` changes
  (AC-7.3).
- **Bulk bar.** `BulkBar` from `components/radar/selection.tsx` with, in this
  order: Archive, Delete (destructive), Force delete (destructive, rendered only
  when `useOrgRole().atLeast("OWNER")`). Each button sends the whole selection
  with its own action and the server applies it to the eligible subset, which is
  how a mixed selection is handled by outcome rather than refused (AC-7.5). The
  toast reports affected, held back and the reason, from `describeBulkOutcome`
  (AC-7.6).
- **Confirmations.** Delete confirms once, stating the number and that the
  stories return to the approved pool. Force delete first calls the bulk route
  with `dryRun: true` and states the real numbers it comes back with: "this also
  destroys 11 delivery records for 9 recipients" (AC-8.6). Archive needs no
  confirmation: it destroys nothing and unarchive puts it back (AC-8.1, AC-8.3).
- **Sent column** shows `Sent 3 Aug 2026 by julian.andrade@linkconsulting.com`
  when the approval record is present (AC-2.6).
- **The "In review" column stops rendering a list.** This is the one place unit A
  carries a consequence of Action 4. AC-4.1's check is that only one route builds
  a list from the pending-articles query, and this screen builds a second one
  today. It keeps the same fetch and consumes only `count`, showing the number
  and one link to `/dashboard?view=queue`. The link is harmless before C lands:
  `/dashboard` is the pending list already.
- **The "Approved" column stays exactly as it is**, and gains
  `id="approved-waiting"` plus support for `?view=pipeline`. It is the
  destination Story 3 points at, and AC-3.6 forbids building another one.
- `currentWeekAndYear` is deleted in favour of `isoWeekAndYear`.

#### 4.1.4 Other files A owns

- `lib/db/tenant.ts`: add `emailEvent.deleteMany`, with a comment saying why it
  cannot be organization-scoped (the model has no `organizationId`) and that
  callers must pass edition ids already resolved through `db.edition`.
- `lib/queries.ts`: `getWeekNumber` delegates to `lib/radar/week.ts`;
  `getCurrentEdition` uses the ISO week-year instead of `getFullYear()`;
  `updateArticleStatus` and `updateArticleSummary` gain a doc comment saying they
  are unscoped and that new code must not call them, because C replaces the two
  call sites and nothing else may add a third. If `grep` at implementation time
  shows `markEditionAsSent` has no callers left, delete it; if unit B's file is
  still in the tree, leave it.

#### 4.1.5 Tests, `tests/unit/`

In the style of `tests/unit/selection.test.tsx`: pure functions, no database, and
a comment on any test that exists because something actually broke.

| File | Proves |
|---|---|
| `week.test.ts` | `isoWeekAndYear` on ordinary dates and on 28 Dec, 31 Dec, 1 Jan and 4 Jan boundaries; that the year is the ISO week-year and not the calendar year, which is the disagreement C7 is about (AC-1.8) |
| `editions-lifecycle.test.ts` | `planEditionBulk` for all four actions; a mixed selection splits rather than refusing (AC-7.5); ids that resolve to nothing come back `not-found`, never as an error (AC-7.8); a finalized never-sent edition is deletable (C4); a sent edition is held back from `delete` (AC-8.2); `describeBulkOutcome` states the number and the reason (AC-7.6) and the delivery numbers for a force delete (AC-8.6); `MAX_BULK_EDITIONS` appears in the over-cap message (AC-7.7) |
| `roles.test.ts` | the hierarchy; that force delete needs OWNER and a VIEWER clears nothing (AC-7.4, AC-8.5); that `hasRoleAtLeast` and `lib/auth/context.hasRole` agree |

AC-8.7 and AC-8.9, the invariant and the atomicity, are proven by the SQL in
section 3 run before and after, and by the transaction being a single
`$transaction` call. They are acceptance checks, not unit tests: this repository
has no database test harness and adding one is not in this requirement.

---

### 4.2 Unit B: the proposal

**Covers** Action 1, Action 5's data, conflict C1, defects N1 and N2. Depends on
unit A only for `lib/radar/week.ts`.

**It proposes and never sends.** No function in this unit calls anything in
`lib/email/`, and no code path it introduces writes `status: "SENT"`. That is
BR-011 and D1, and a reviewer should be able to confirm it by grep alone.

#### 4.2.1 `lib/editions/proposal.ts`

Constants, fixed here as constants and not settings, because BR-001 forbids
offering a setting that does not take effect and none of these needs to be
configurable yet:

```ts
/** RQ-005 section 2.2 of the specification: product-owner defaults. */
export const PROPOSAL_ARTICLE_TARGET = 10;
export const PROPOSAL_PROJECT_TARGET = 5;
export const THIN_ARTICLE_THRESHOLD = 5; // fewer than this reads as a light week
```

Pure functions, which are where the tests live:

```ts
export interface Candidate {
  id: string;
  relevanceScore: number | null;
  publishedAt: Date;
  createdAt: Date;
  status: "PENDING_REVIEW" | "APPROVED";
}

/** RQ-005 AC-1.2, AC-1.7: score first, then recency. Never below the threshold,
 *  never padded to look full. */
export function rankCandidates(
  candidates: Candidate[],
  options: { threshold: number; target: number }
): Candidate[];

/** RQ-005 AC-1.6. */
export function isThinProposal(articleCount: number): boolean;

/** RQ-005 action 1: a top-up adds, it never removes and never re-adds.
 *  Only candidates collected after the last refresh are considered, so an
 *  article an editor took out of the proposal stays out. */
export function planTopUp(input: {
  existingArticleIds: string[];
  candidates: Candidate[];
  refreshedAt: Date | null;
  threshold: number;
  target: number;
}): { add: string[]; startOrder: number };
```

Ranking rules the tests pin: an `APPROVED` article is a candidate whatever its
score, since a person already decided it; a `PENDING_REVIEW` article is a
candidate only at or above the organization's `relevanceThreshold` from
`OrgSettings`; a null score never clears the threshold; ties break on
`publishedAt` descending; the result is capped at `target` and is never padded
from below the threshold, so a week with two qualifying articles yields two
(AC-1.7).

Reads and writes, all through the tenant client:

```ts
/** RQ-005 AC-1.1, AC-1.3, AC-1.4: one proposal per organization per week,
 *  created without anyone asking, and never two. */
export async function ensureProposal(db: TenantClient, now?: Date): Promise<{ id: string; created: boolean }>;

/** RQ-005 action 1: keep it current without undoing editorial work. */
export async function refreshProposal(db: TenantClient, editionId: string): Promise<{ added: number }>;

/** The payload behind GET /api/editions/proposal. */
export async function readProposal(db: TenantClient, now?: Date): Promise<ProposalPayload>;
```

`ensureProposal` uses the compound unique that already exists,
`@@unique([week, year, organizationId])`:

```ts
await db.edition.upsert({
  where: { week_year_organizationId: { week, year, organizationId: db.organizationId } },
  create: { week, year, status: "DRAFT" },
  update: {},
});
```

Two things to get right. The tenant client's `upsert` adds `organizationId` to
`create` but not to `where`, so the compound key must be passed in full, which is
what `db.organizationId` is exposed for. And a concurrent create still has to be
survivable: a `P2002` unique violation is caught and answered by re-reading the
existing row, never by an error reaching the screen (AC-1.3).

`refreshProposal` only touches a proposal whose `status` is `DRAFT` and never
removes anything. It appends `planTopUp`'s ids after the current highest `order`,
then sets `proposalRefreshedAt`. A sent or finalized edition is left alone.

Neither function lowers the threshold and neither pads (D2, AC-1.7).

#### 4.2.2 `lib/radar/pipeline.ts`

Story 5's data, read tenant-scoped, which is the point of AC-5.5. It does **not**
call `getCurrentJob` or `getJobs` from `lib/curation/job-manager.ts`: both read
`prisma.curationJob` with no organization filter, and a count shown to one
organization must never include another's rows. Unit B does not change
`job-manager.ts` either, because the collect route and the curation jobs screen
depend on its current signatures and neither is in this requirement.

```ts
/** RQ-005 AC-5.3, AC-5.6: pure, so "is a run needed" is testable. */
export function decideRunNeeded(input: {
  lastRun: { status: "COMPLETED" | "FAILED" | "CANCELLED"; completedAt: Date | null } | null;
  running: boolean;
  now: Date;
}): { needed: boolean; reason: "never-run" | "last-run-failed" | "stale" | "current" | "running" };

export async function readPipelineStatus(db: TenantClient, now?: Date): Promise<PipelineStatus>;
```

`decideRunNeeded`: no run ever, needed, `never-run`. A run in progress, not
needed, `running`. The last run failed, needed, `last-run-failed`, and the status
says so and says when rather than showing the last successful run as current
(AC-5.6). The last completed run more than 24 hours old, needed, `stale`.
Otherwise `current`.

The week's counts, all `db.article.count` over the window
`[isoWeekStart(week, year), now]`: collected, rejected, below threshold, plus the
proposal's own article and project counts. Active recipients from
`db.subscriber.count({ where: { active: true } })`, which the confirmation in
AC-2.3 needs.

#### 4.2.3 API contracts

**`GET /api/editions/proposal`**, the one call the proposal screen makes.

```
Response 200
{
  success: true,
  data: {
    proposal: {
      id, week, year, status, thin: boolean,
      archivedAt, sentAt, approvedAt, approvedByEmail,
      articles: [{ id, title, sourceUrl, author, publishedAt, relevanceScore,
                   summary, category, status, order }],
      projects: [{ id, name, description, team, projectDate, impact, imageUrl, order }]
    },
    counts: { collected: number, rejected: number, belowThreshold: number,
              inProposal: number, approvedWaiting: number, pending: number },
    pipeline: { running: boolean, current: number | null, total: number | null,
                lastRun: { status, startedAt, completedAt, totalFound, curated,
                           duplicates, lowScore, errorsCount } | null,
                runNeeded: boolean, runReason: string },
    recipients: { active: number },
    assembly: { assembled: boolean, candidates: number, thin: boolean,
                refreshedAt: string | null }
  }
}
```

- `export const dynamic = "force-dynamic"`. The handler ensures the proposal
  exists and then reads it, which is a side effect on a GET and is deliberate:
  AC-1.1 requires the proposal to exist without a person asking, and the
  alternative is a screen that opens on an empty state and then posts. The
  operation is an idempotent upsert, so a second GET changes nothing.
- Any member of the organization may call it, VIEWER included, since a VIEWER may
  read the proposal and the schedule would have created it anyway. Creating a
  draft is not sending.
- `try`/`catch`, `Unauthorized` to 401.

**`POST /api/editions/proposal`**, EDITOR or above: ensure, then
`refreshProposal`, then return the same payload. This is the "pull in what has
been collected since" control, and it is the same function the schedule calls.

**`GET /api/editions/proposal/candidates?search=&limit=`**, the pool behind C's
add control (AC-6.1): approved and above-threshold pending articles that are not
already in the current proposal, ranked the same way as the proposal itself, plus
featured projects not already in it. A separate route rather than a field on the
main payload, because the pool can be hundreds of rows and the screen only needs
it when the picker opens.

**`GET /api/articles/approved`**, fixed (N1): `requireOrgContext`, the tenant
client, `Unauthorized` to 401. The response shape, including `editionCount` and
`excludeInEdition`, is unchanged, because `app/dashboard/send/page.tsx` and
`components/edition-article-picker.tsx` both read it.

**`GET /api/cron/weekly-proposal`**, new, and the resolution of C1.

- Same cron secret check the current route has:
  `authHeader !== "Bearer " + config.cron.secret` answers 401.
- For every organization: `createTenantClient(org.id)`, `ensureProposal`,
  `refreshProposal`. Nothing else.
- Returns a per-organization summary: created or found, articles added, whether
  the result is thin.
- **It does not import `lib/email/`, does not call `sendNewsletterToAll`, does
  not call `markEditionSent`, and does not write `FINALIZED` or `SENT`.**

**`app/api/cron/weekly-send/route.ts` is deleted.** Not reduced to a stub and not
left unscheduled. It auto-finalizes and sends with no human in the loop, D1 and
BR-011 both forbid that, and a route that exists can be called.

**`vercel.json`**: the Sunday `weekly-send` entry is replaced.

```json
{
  "crons": [
    { "path": "/api/cron/daily-collection", "schedule": "0 9 * * *" },
    { "path": "/api/cron/weekly-proposal", "schedule": "30 9 * * *" }
  ]
}
```

Daily at 09:30 UTC, half an hour after collection, so the proposal is current
whenever a person opens the product rather than only on a Monday. The name keeps
"weekly" because what it maintains is the week's proposal.

#### 4.2.4 Tests, `tests/unit/`

| File | Proves |
|---|---|
| `proposal.test.ts` | `rankCandidates` orders by score then recency; a null score never qualifies; a pending article below the threshold is never included and the threshold is never lowered to fill a light week (AC-1.7); the cap at `PROPOSAL_ARTICLE_TARGET` (AC-1.2); `isThinProposal` at 4, 5 and 0 (AC-1.6); `planTopUp` excludes ids already in the proposal, excludes candidates collected before `refreshedAt` so a removed article stays removed, and starts ordering after the current maximum (AC-6.2, AC-6.3) |
| `pipeline.test.ts` | `decideRunNeeded` for never-run, running, failed, stale and current, and that learning the answer never requires starting a run (AC-5.3, AC-5.6) |

AC-1.3's collision behaviour and AC-1.4's organization scoping are enforced by
the compound unique and the tenant client. The unit test that carries them is a
`planTopUp` and `ensureProposal` argument test: the upsert `where` must contain
`organizationId`, asserted against a fake tenant client that records the
arguments it was handed. That is the one place in unit B where a small fake is
worth writing.

---

### 4.3 Unit C: the screens

**Covers** Action 3, Action 4, Action 6, the screen halves of Action 2 and Action
5, BR-009, BR-012, defect N3's route half. Depends on A for the role hook and on
B for the proposal payload.

#### 4.3.1 The proposal screen, `app/dashboard/page.tsx`

The Feed becomes the proposal (D4). One screen, one data source, two views.

State lives here and nowhere else, so a decision taken in the queue updates the
header counts and the proposal contents at once (AC-4.5). The views are
presentational and take callbacks.

Layout, top to bottom:

1. `PageHeading`, eyebrow `Week 32 · 2026`, title "This week's edition",
   subtitle the counts in words a business user reads without hovering: how many
   were collected, how many were rejected or below the threshold, how many are in
   the proposal (AC-1.5). A `StatusChip tone="warn"` reading "thin" when
   `proposal.thin`, and the mark names the reason from the same counts (AC-1.6).
2. **The machine's status band** (Story 5): when collection last ran and whether
   it succeeded, what it produced, whether a run is in progress with its
   progress, whether a run is needed in those terms, and the assembly state of
   the proposal (AC-5.1 to AC-5.4, AC-5.6). "Run curation" stays, for EDITOR and
   above, as an override rather than a step, and keeps the existing SSE reader in
   this file (AC-5.7).
3. `ChipGroup` view switch: Proposal, Queue with its count. Bound to `?view=`, so
   the queue is reachable in one action and is linkable (AC-4.2, AC-4.3).
4. **Proposal view**: the ordered articles with, for EDITOR and above, Move up,
   Move down, Remove and Reject per row; the projects with the same three
   controls (AC-6.6); an "Add from what is waiting" picker; then the rendered
   edition; then the primary control.
5. **Queue view**: everything the review screen does today.

Details that decide whether this reads as one decision or as four:

- **The rendered edition is on the screen** (AC-2.2), in a sandboxed iframe fed
  by `POST /api/email/preview` with `{ editionId }`. `sandbox="allow-same-origin"`
  with no `allow-scripts`, `srcDoc` for the html. Opening a separate preview is
  not a step.
- **One primary control**, "Approve and send". It confirms once, and the
  confirmation states the edition, the number of articles and the number of
  active recipients from `recipients.active` (AC-2.3). On confirm it posts to
  `/api/email/send-all` with `{ editionId }` and nothing else, so the edition as
  stored is what goes out and there is no stale copy in the client to send
  (AC-2.4). No save, no finalize, no navigation (AC-2.1).
- **Editor controls write immediately.** Reorder, remove and add each issue a
  `PATCH /api/editions/[id]` with the full articles array and optimistic local
  state, so whatever is on screen is what would be sent and there is no save
  button (AC-6.5, AC-6.3). Remove takes the article out of the edition and does
  **not** reject it, and the message says it is back in approved and waiting
  (AC-6.2). Reject is a verdict on the article and gets the Story 3 treatment.
- **Role gating** through `useOrgRole()`. A VIEWER sees the proposal, the counts,
  the status and the preview, and none of the controls (AC-6.8, AC-2.7). The
  server is the authority; this only decides what to render.
- **A sent edition offers no controls** and says it was sent, by whom and when
  (AC-6.7, AC-2.5).
- Loading and error states for every fetch, per the house rules. An empty
  proposal is not an error: it says so and offers the queue and the add picker.

#### 4.3.2 The old route, `app/dashboard/review/page.tsx`

Becomes four lines: a server component that calls
`redirect("/dashboard?view=queue")`. A bookmark still works and lands with the
filter applied (AC-4.3). Nothing else is left in the file, which is what makes
AC-4.1 checkable: after this, `/api/articles/pending` is fetched to build a list
in exactly one route.

#### 4.3.3 New components, `components/proposal/`

| File | Holds |
|---|---|
| `proposal-view.tsx` | The ordered edition, per-row editor controls, the preview iframe, the approve-and-send control and its confirmation |
| `queue-view.tsx` | The review queue moved intact: `ArticleFiltersComponent`, the three layouts from `LayoutToggle`, `useSelection`, `BulkBar`, the bulk reject confirmation and the edit dialog. Every capability survives (AC-4.6) |
| `machine-status.tsx` | Story 5's band |
| `add-to-proposal.tsx` | The picker over `GET /api/editions/proposal/candidates` |
| `state.ts` | `proposalReducer`, pure. One decision updates the proposal, the queue and the counts together, which is how AC-4.5 becomes a unit test rather than a click-through |
| `copy.ts` | Pure sentence builders. Where the product's words live |

`components/article-filters.tsx`, `components/layout-toggle.tsx`,
`components/radar/primitives.tsx`, `controls.tsx` and `selection.tsx` are used
unchanged. `queue-view.tsx` is a move, not a rewrite: the existing review screen
is good, and the defect is that it is a second screen.

#### 4.3.4 Saying where the work went, BR-009

`copy.ts` is the single source of these words, which is what makes AC-3.4's "the
same message whether one at a time or in bulk" true by construction rather than
by discipline.

```ts
/** RQ-005 BR-009: an action that moves work off the screen says where it went. */
export interface Outcome {
  message: string;
  destination?: { label: string; href: string };
  undo?: { label: string };
}
export function approvedOutcome(count: number): Outcome;   // "Approved and waiting for an edition"
export function rejectedOutcome(count: number): Outcome;   // names where rejected stories can be seen
export function removedFromProposalOutcome(title: string): Outcome; // back to approved and waiting
export function thinReason(counts: ProposalCounts): string; // AC-1.6
```

- The destination for an approval is
  `/dashboard/send?view=pipeline#approved-waiting`, the approved-and-waiting
  column that already exists. No screen is built for it (AC-3.6), and the link
  works before unit A adds the anchor because that view is the default.
- Every one of them carries an undo, rendered as a `sonner` toast action
  (AC-3.3, AC-3.5). Undo posts `{ action: "reset", ids }` to
  `/api/articles/bulk`, which returns the article to `PENDING_REVIEW` and to the
  list it left.
- A bulk decision reports the count and the same destination and undo (AC-3.4).

#### 4.3.5 Route changes C owns

**`PATCH /api/articles/bulk`**: add `"reset"` to the actions, mapping to
`status: "PENDING_REVIEW"` from `APPROVED` or `REJECTED`. Return `affectedIds`,
so an undo acts on exactly what the previous action changed rather than on the
selection as it was. Getting the ids means selecting the eligible ones first,
tenant-scoped, then `updateMany` over that list; a row another reviewer decided
in between is reported as skipped, which the existing response already does.
Require EDITOR.

**`POST /api/articles/[id]/approve`** and **`.../reject`**: fixed (N3). Both call
`requireOrgContext`, `requireRole(ctx, "EDITOR")`, and write through
`db.article.updateMany({ where: { id, status: "PENDING_REVIEW" }, data: { status } })`.
Zero rows means either another organization's id or an article already decided,
and both answer 404, so a foreign row is indistinguishable from one that does not
exist. Neither route calls `updateArticleStatus` any more.

**`components/app-sidebar.tsx`**: "Review queue" is removed from the secondary
list, and the primary Feed entry becomes "This week" pointing at `/dashboard`.
One entry for this work, no two entries leading to the same list under two names
(AC-4.4).

**`app/radar-preview/harness.tsx`**: the dev-only verification harness imports
`app/dashboard/review/page` and stubs `/api/articles/pending` and
`/api/articles/approved`. It has to move with the screens or the build breaks:
drop the `review` entry from `SCREENS`, add stubs for
`/api/editions/proposal`, `/api/editions/proposal/candidates` and
`/api/organizations/current`. The fixture articles already there are enough to
make the proposal render. This is the one place a list is built from fixture
pending data after the consolidation, and it is not a route.

#### 4.3.6 Tests, `tests/unit/`

| File | Proves |
|---|---|
| `proposal-state.test.ts` | `proposalReducer`: approving in the queue removes the row, decrements the pending count and increments approved-and-waiting in one dispatch, so no second list is left holding a story that was just decided (AC-4.5); undo puts it back where it was (AC-3.3); removing from the proposal moves it to waiting rather than rejecting it (AC-6.2); reorder produces the order the PATCH sends and survives a payload round trip (AC-6.3) |
| `proposal-copy.test.ts` | every outcome names its destination and carries an undo (AC-3.1, AC-3.3, AC-3.5); the bulk message reports the count and the same destination as the single one (AC-3.4); `thinReason` names the collected and below-threshold counts rather than judging the week (AC-1.6) |

---

## 5. Roles, and what each route answers

The hierarchy is `VIEWER < EDITOR < ADMIN < OWNER`, already in
`lib/auth/context.ts`. Rules for every route in this requirement, from section 4
of the specification:

- No session, or a session with no organization: **401**, from
  `requireOrgContext` throwing `Unauthorized: ...` and the catch mapping any
  message starting with `Unauthorized` to 401.
- Authenticated but the role is too low: **403**, from `requireRole` throwing
  `Forbidden: ...`. The UI does not offer a control the current role cannot use,
  so a 403 is a defence, not the normal path.
- A row belonging to another organization: **404**. Never 403, never the row.

| Route | Method | Minimum role | Unit |
|---|---|---|---|
| `/api/editions` | GET | member | A |
| `/api/editions` | POST | EDITOR | A |
| `/api/editions/[id]` | GET | member | A |
| `/api/editions/[id]` | PATCH | EDITOR | A |
| `/api/editions/[id]` | DELETE | EDITOR | A |
| `/api/editions/bulk` | PATCH, archive, unarchive, delete | EDITOR | A |
| `/api/editions/bulk` | PATCH, forceDelete and its dry run | **OWNER** | A |
| `/api/email/send-all` | POST | **EDITOR** | A |
| `/api/editions/proposal` | GET | member | B |
| `/api/editions/proposal` | POST | EDITOR | B |
| `/api/editions/proposal/candidates` | GET | member | B |
| `/api/articles/approved` | GET | member | B |
| `/api/cron/weekly-proposal` | GET | cron secret | B |
| `/api/articles/bulk` | PATCH, including reset | EDITOR | C |
| `/api/articles/[id]/approve`, `/reject` | POST | EDITOR | C |

Security notes beyond roles, against the OWASP sections in `CLAUDE.md`:

- **A01, access control.** Every route in the table calls `requireOrgContext`
  first and reads through the tenant client. The three handlers in
  `app/api/editions/[id]/route.ts` and `GET /api/articles/approved` currently
  call neither, which is why they are in scope.
- **A05, injection.** No raw SQL is added. The one SQL statement in this spec is
  the orphan check in section 3, run by hand.
- **A10 and error handling.** Every handler has `try`/`catch`, logs the cause
  server-side and answers the client a message that names what failed without a
  stack trace.
- **LLM.** This requirement adds no AI call and no prompt. The one thing it does
  in that direction is remove agency: the schedule proposes and a person
  approves, which is LLM06's least-privilege applied to automation rather than to
  a model.

---

## 6. File ownership, the whole change

No path appears twice. A path marked new does not exist yet.

### Unit A, edition lifecycle

| File | New | What happens |
|---|---|---|
| `prisma/schema.prisma` | | `Edition.archivedAt`, the approval record, `proposalRefreshedAt`, the `EmailEvent` relation |
| `lib/radar/week.ts` | new | The one week helper |
| `lib/auth/roles.ts` | new | The hierarchy, importable by a client component |
| `lib/auth/context.ts` | | `hasRole` and `requireRole` delegate to `roles.ts` |
| `components/radar/use-role.ts` | new | `useOrgRole()` |
| `lib/editions/lifecycle.ts` | new | The bulk planner, the outcome sentences, the four writes, `markEditionSent` |
| `lib/db/tenant.ts` | | `emailEvent.deleteMany` |
| `lib/queries.ts` | | Week delegation, ISO year in `getCurrentEdition`, warnings on the unscoped helpers |
| `app/api/editions/route.ts` | | `?archived=`, archive and approval fields in the payload |
| `app/api/editions/[id]/route.ts` | | Auth and tenancy on all three handlers, delete by `sentAt`, event cleanup, sent-edition refusals |
| `app/api/editions/bulk/route.ts` | | Rewritten to four actions and a dry run |
| `app/api/email/send-all/route.ts` | | EDITOR guard, approval record, 409 with who and when, shared week helper |
| `app/dashboard/send/page.tsx` | | Archive filter, three bulk actions, real numbers in the force-delete confirmation, approver in the list, the "In review" column stops building a list, the Approved column gains its anchor |
| `tests/unit/week.test.ts` | new | |
| `tests/unit/editions-lifecycle.test.ts` | new | |
| `tests/unit/roles.test.ts` | new | |

### Unit B, the proposal

| File | New | What happens |
|---|---|---|
| `lib/editions/proposal.ts` | new | Constants, ranking, thin, top-up, ensure, refresh, read |
| `lib/radar/pipeline.ts` | new | Tenant-scoped pipeline status and `decideRunNeeded` |
| `app/api/editions/proposal/route.ts` | new | GET ensure and read, POST refresh |
| `app/api/editions/proposal/candidates/route.ts` | new | The add-control pool |
| `app/api/articles/approved/route.ts` | | Auth and tenancy, shape unchanged |
| `app/api/cron/weekly-proposal/route.ts` | new | Propose only |
| `app/api/cron/weekly-send/route.ts` | | **Deleted** |
| `vercel.json` | | The cron entry replaced |
| `tests/unit/proposal.test.ts` | new | |
| `tests/unit/pipeline.test.ts` | new | |

### Unit C, the screens

| File | New | What happens |
|---|---|---|
| `app/dashboard/page.tsx` | | Becomes the proposal screen and owns the state |
| `app/dashboard/review/page.tsx` | | Becomes a redirect to `/dashboard?view=queue` |
| `components/proposal/proposal-view.tsx` | new | |
| `components/proposal/queue-view.tsx` | new | The review queue, moved intact |
| `components/proposal/machine-status.tsx` | new | |
| `components/proposal/add-to-proposal.tsx` | new | |
| `components/proposal/state.ts` | new | `proposalReducer` |
| `components/proposal/copy.ts` | new | The words, and the destinations |
| `components/app-sidebar.tsx` | | One entry for this work |
| `app/api/articles/bulk/route.ts` | | `reset`, `affectedIds`, EDITOR guard |
| `app/api/articles/[id]/approve/route.ts` | | Auth, tenancy, EDITOR |
| `app/api/articles/[id]/reject/route.ts` | | Auth, tenancy, EDITOR |
| `app/radar-preview/harness.tsx` | | Follows the screens |
| `tests/unit/proposal-state.test.ts` | new | |
| `tests/unit/proposal-copy.test.ts` | new | |

### Touched by nobody, deliberately

`lib/curation/job-manager.ts` (N2, worked around rather than changed),
`app/api/status/route.ts` (C6, flagged), `app/api/curation/*`,
`app/dashboard/send/[id]/page.tsx` (the 2,259 line builder: the requirement
changes the path a person takes, not the builder),
`components/edition-article-picker.tsx`, `lib/email/*`,
`app/api/email/{preview,send-test}/route.ts`, `app/api/generation/*`.

---

## 7. The only coupling between units

Five points, and nothing else crosses. Each is written so the consumer can be
built and tested before the producer lands.

| # | Producer | Consumer | Contract | Before it lands |
|---|---|---|---|---|
| 1 | A, `lib/radar/week.ts` | B | `isoWeekAndYear`, `isoWeekStart` | B cannot compute the week without it. This is why A lands first |
| 2 | A, `lib/auth/roles.ts` and `components/radar/use-role.ts` | C | `useOrgRole().atLeast(min)` | C would have to gate on nothing, showing controls a VIEWER's request then refuses. Land A first |
| 3 | B, `GET /api/editions/proposal` | C | The payload in 4.2.3, fixed here so C can build against a stub | C shows its loading and empty states, which it needs anyway |
| 4 | A, `app/dashboard/send/page.tsx` | C | The destination `/dashboard/send?view=pipeline#approved-waiting` and the anchor on the approved column | The link lands on the same screen and the same column, since pipeline is the default view. C is correct either way |
| 5 | A, `PATCH /api/editions/[id]` | C | Request shape unchanged from today: `{ articles: [{ articleId, order }], projects: [...] }` | The route exists today, so C's controls work before A hardens it |

**Landing order: A, then B, then C.** Each is independently deployable and
independently testable, and none of them leaves the product worse than it is if
the next one is a week behind.

Two overlaps are accepted rather than resolved, both stated so a reviewer does
not read them as oversights:

- `POST /api/editions` keeps its own auto-population, which takes the same 10
  articles and 5 projects as `lib/editions/proposal.ts`. Making it delegate would
  make A depend on B for no behavioural gain. The numbers agree because section
  2.2 of the specification fixed them; converging the code is a follow-up.
- `lib/queries.ts#getCurrentEdition` also creates an edition for the current week.
  Nothing on the RQ-005 path calls it after this change. It is left in place with
  its year bug fixed, and removing it is a separate tidy-up.

---

## 8. Traceability, acceptance criterion to unit and file

`[R]` in the specification marks a criterion that must be covered by a unit test.
Criteria without a test file named here are screen behaviour, checked by the test
plan and by acceptance.

| AC | Unit | Where it is satisfied | Test |
|---|---|---|---|
| AC-1.1, AC-1.2 | B | `ensureProposal`, `rankCandidates`, `GET /api/editions/proposal` | `proposal.test.ts` |
| AC-1.3 `[R]` | B | Compound unique upsert, `P2002` re-read | `proposal.test.ts` |
| AC-1.4 `[R]` | B | Tenant client, `organizationId` in the upsert key | `proposal.test.ts` |
| AC-1.5 | B, C | `counts` in the payload, worded in `copy.ts` | `proposal-copy.test.ts` |
| AC-1.6 `[R]` | B, C | `isThinProposal`, `thinReason` | `proposal.test.ts`, `proposal-copy.test.ts` |
| AC-1.7 `[R]` | B | `rankCandidates` never pads, never lowers the threshold | `proposal.test.ts` |
| AC-1.8 `[R]` | A | `lib/radar/week.ts`, and 2.2 for what converges | `week.test.ts` |
| AC-1.9 | B | The cron imports nothing from `lib/email/` | grep, and code review |
| AC-2.1 to AC-2.3 | C | One control, preview on screen, one confirmation with the recipient count | test plan |
| AC-2.4 `[R]` | C | The send posts `{ editionId }` only, so the stored edition is what goes | `proposal-state.test.ts` |
| AC-2.5, AC-2.6 `[R]` | A | `markEditionSent`, the approval columns, the editions list | `editions-lifecycle.test.ts` |
| AC-2.7 `[R]` | A, C | EDITOR guard on send-all, control hidden by `useOrgRole` | `roles.test.ts` |
| AC-2.8, AC-2.9 `[R]` | A | Existing partial and total failure handling, kept and asserted | `editions-lifecycle.test.ts` |
| AC-2.10 `[R]` | A | `markEditionSent` returns `alreadySent`, 409 names who and when | `editions-lifecycle.test.ts` |
| AC-3.1 to AC-3.5 `[R]` | C | `copy.ts`, the toast, the reset action | `proposal-copy.test.ts`, `proposal-state.test.ts` |
| AC-3.6 | A, C | The approved column is the destination and is not rebuilt | code review |
| AC-4.1 | A, C | Review becomes a redirect, the editions screen stops building a list | grep for `/api/articles/pending` |
| AC-4.2 to AC-4.4 | C | `?view=`, one nav entry | test plan |
| AC-4.5 `[R]` | C | `proposalReducer` | `proposal-state.test.ts` |
| AC-4.6 | C | `queue-view.tsx` is a move | test plan |
| AC-5.1 to AC-5.4, AC-5.7 | B, C | `readPipelineStatus`, `machine-status.tsx`, the run control kept | test plan |
| AC-5.3, AC-5.6 `[R]` | B | `decideRunNeeded` | `pipeline.test.ts` |
| AC-5.5 `[R]` | B | Tenant client, not `job-manager` | `pipeline.test.ts` |
| AC-6.1 to AC-6.6 | C | Editor controls writing straight through `PATCH /api/editions/[id]` | `proposal-state.test.ts`, test plan |
| AC-6.7 `[R]` | A | PATCH refuses a sent edition, 409 with who and when | `editions-lifecycle.test.ts` |
| AC-6.8 `[R]` | A, C | `useOrgRole`, EDITOR on PATCH | `roles.test.ts` |
| AC-7.1 | A | `useSelection`, `SelectCheckbox`, `BulkBar`, unchanged | test plan |
| AC-7.2, AC-7.3 `[R]` | A | `useSelection` prunes on filter change, already covered | `tests/unit/selection.test.tsx`, existing |
| AC-7.4 | A | Three actions, force delete behind OWNER | `roles.test.ts` |
| AC-7.5, AC-7.6 `[R]` | A | `planEditionBulk`, `describeBulkOutcome` | `editions-lifecycle.test.ts` |
| AC-7.7 `[R]` | A | `MAX_BULK_EDITIONS` in the message | `editions-lifecycle.test.ts` |
| AC-7.8 `[R]` | A | Unresolved ids come back `not-found` | `editions-lifecycle.test.ts` |
| AC-8.1 | A, C | Every removal is confirmed or reversible and reports | code review |
| AC-8.2 to AC-8.4 `[R]` | A | `planEditionBulk`, `archivedAt`, `?archived=` | `editions-lifecycle.test.ts` |
| AC-8.5, AC-8.6 `[R]` | A | OWNER gate, `countDeliveryImpact`, the dry run | `roles.test.ts`, `editions-lifecycle.test.ts` |
| AC-8.7, AC-8.9 `[R]` | A | The FK plus one `$transaction`, and the SQL in section 3 | acceptance, see 4.1.5 |
| AC-8.8 `[R]` | A | Single DELETE removes events too | `editions-lifecycle.test.ts` |
| AC-8.10 | A | The orphan query before and after | acceptance |

---

## 9. Rollout

1. **Unit A.** Run the orphan query in section 3 and confirm it returns 0. Edit
   the schema, `npx prisma db push`, `npx prisma generate`. Then the code. The
   schema change is additive: every new column is nullable and the new relation
   is over data that already satisfies it, so a deploy of A before its own code
   is harmless.
2. **Unit B.** Deploy the code and `vercel.json` together, so the cron entry and
   the route it points at arrive at the same time. Confirm after the first run
   that no edition moved to `FINALIZED` or `SENT` without a person: the whole
   point of C1.
3. **Unit C.** Deploy. Check the old bookmark `/dashboard/review` redirects and
   that nothing but `/dashboard` builds a list from `/api/articles/pending`.
4. **After all three.** Run the orphan query again (AC-8.10), and correct the
   editions entry in `.claude/docs/requirements/ROADMAP.md`, which is accurate
   about selection and stale about deletion (C5 in the specification).

Rollback: unit C and unit B are code-only and revert cleanly. Unit A's schema is
additive, so reverting the code leaves three unused nullable columns and a
foreign key that is satisfied by every row; nothing has to be undone in the
database.

---

## 10. Risks

| Risk | Why it matters | What this spec does about it |
|---|---|---|
| The `EmailEvent` foreign key fails to apply | `db push` stops, and a half-applied schema is worse than none | The orphan query is a precondition, not a check afterwards, and its failure is escalated rather than worked around |
| A GET that creates a row | `GET /api/editions/proposal` ensures the proposal | Idempotent upsert, `force-dynamic`, documented in 4.2.3. A second call changes nothing, and the schedule would have created it anyway |
| The daily top-up undoes editorial work | An editor removes a story and the machine puts it back the next morning | `proposalRefreshedAt` plus `planTopUp` considering only articles collected since. Unit tested |
| Pending articles get sent without a verdict | The proposal may hold pending articles by design | `markEditionSent` flips them to `APPROVED` in the same transaction, so nothing that went out still reads as awaiting a decision |
| Nine week helpers, four converged | AC-1.8 says one answer | The four on the RQ-005 path converge, the five on the render and generation paths are listed in 2.2 as a flagged follow-up rather than silently left |
| Unit C is the largest piece of work | Moving the review screen intact while building the proposal around it | `queue-view.tsx` is a move, not a rewrite, and the reducer keeps the state in one place so the two views cannot disagree |
| The preview harness | It imports the review screen and would break the build | Explicitly assigned to unit C in 4.3.5 |

---

## 11. Out of scope

From section 12 of the specification, plus what this spec adds:

- Making `/api/status` tenant-aware (C6).
- Making `lib/curation/job-manager.ts` tenant-aware (N2). Worked around, flagged.
- Converging the five remaining week helpers on the render and generation paths
  (2.2).
- Converging `POST /api/editions` auto-population with the proposal module, and
  removing `lib/queries.ts#getCurrentEdition` (section 7).
- Any per-article control inside the builder beyond add, remove, reorder and
  reject: RQ-006.
- New scoring or a fourth AI call: RQ-004.
- Rewriting `app/dashboard/send/[id]/page.tsx`.
- Any new user-facing setting, including a configurable proposal size or thin
  threshold: BR-001.
- Unsending, recalling or editing a sent edition.
- Retention or pruning of delivery events in general. Only the events belonging
  to an edition being force deleted are touched.

---

## 12. Before handing any unit on

Per unit, not per requirement:

```bash
npx tsc --noEmit
npx vitest run
```

Both clean. A unit that leaves either failing is not finished, and a failure that
cannot be fixed inside the unit's own files is a spec defect to raise rather than
a note to leave for the verifier.

House rules this spec inherits and a reviewer checks: org-scoped data through
`lib/db/tenant.ts` and never bare `prisma`; `try`/`catch` on every route with
`Unauthorized` to 401 and `Forbidden` to 403; the vocabulary in
`components/radar/primitives.tsx` and `controls.tsx`; bulk selection through
`components/radar/selection.tsx`; a loading state and an error state on every
fetch; no long dashes anywhere, comments included; an `RQ-005` tag wherever a
reader would otherwise ask why the code exists; unit tests in the style of
`tests/unit/selection.test.tsx`.
