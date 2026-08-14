# Subscribers and Projects Paging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/api/subscribers` and `/api/projects` opt-in server paging, then let both screens adopt the paging and selection contract.

**Architecture:** One pure module parses the paging parameters for any route. Each route uses it to add `skip`/`take` and a `total`, and answers `idsOnly` through the same `where` and `orderBy`. Each screen wires `usePageSize`, `Pagination` and the two-step selection exactly as feeds and articles already do.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-14-subscribers-projects-paging-design.md`

## Global Constraints

- Branch `feat/list-paging-2`. Stage explicit paths, never `git add -A`.
- **No long dashes anywhere.**
- **A request with no `page` returns every row.** The edition builder at `app/dashboard/send/[id]/page.tsx:420` sends to whatever `/api/subscribers` gives it. This constraint is the PR.
- `pageSize` is clamped by `clampPageSize`; `total` is counted only when a page was asked for.
- Bulk endpoints keep taking `ids: string[]`.
- `npx vitest run`, `npx tsc --noEmit`, `npm run lint` before each commit.

---

### Task 1: The paging parameters, once

**Files:** Create `lib/list-page.ts`, `tests/unit/list-page.test.ts`

**Produces:**
```ts
export interface ListPage { paged: boolean; page: number; pageSize: PageSize }
export function parseListPage(params: URLSearchParams): ListPage;
export function pageArgs(page: number, pageSize: number): { skip: number; take: number };
export function clampToTotal(page: number, pageSize: number, total: number): number;
```

- [x] **Step 1: Write the failing test.** `paged` is false with no `page` and true with one, including `page=1`. A junk page is 1, a junk size is 50. `pageArgs(2, 50)` is `{ skip: 50, take: 50 }`. `clampToTotal` pulls a page past the end back to the last one, and never below 1, and stays 1 for an empty list.
- [x] **Step 2: Run it and watch it fail.**
- [x] **Step 3: Implement.** Comment that `paged` keys off the parameter's presence rather than its value, and why: absence has to mean the whole list.
- [x] **Step 4: Run green plus `tsc`.**
- [x] **Step 5: Commit** `Lists: one way to read a page out of a query string`

---

### Task 2: Subscribers route

**Files:** Modify `app/api/subscribers/route.ts`, create `tests/unit/subscribers-paging.test.ts`

- [x] **Step 1: Write the failing test** over a small pure helper `subscriberListArgs(params)` that returns `{ where, orderBy, page }`, asserting the unpaged case has no `skip`/`take` and the paged case has both. The route's Prisma calls stay untested here, as everywhere else in this repo.
- [x] **Step 2: Run it and watch it fail.**
- [x] **Step 3: Implement.** `findMany` gains `...(page.paged ? pageArgs(...) : {})`. `total` is counted only when paged, in the same `Promise.all`. `idsOnly=true` returns `{ ids, total }` selecting `id` alone. The response gains `total`, `page`, `pageSize` only when paged, so the builder's response shape is byte-identical to today.
- [x] **Step 4: Run green, `tsc`, lint.**
- [x] **Step 5: Commit** `Subscribers: page the list when a page is asked for, and not before`

---

### Task 3: Projects route

**Files:** Modify `app/api/projects/route.ts`, extend the Task 2 test file

- [x] **Step 1: Write the failing test** for the same shape, plus one that `teams=true` is untouched.
- [x] **Step 2: Run it and watch it fail.**
- [x] **Step 3: Implement**, mirroring Task 2 exactly.
- [x] **Step 4: Run green, `tsc`, lint.**
- [x] **Step 5: Commit** `Projects: page the list when a page is asked for`

---

### Task 4: The harness learns both

**Files:** Modify `app/radar-preview/harness.tsx`

- [x] **Step 1:** Teach the subscribers and projects stubs `page`, `pageSize` and `idsOnly`, and give each enough fixture rows to page: the current handful cannot show a pager. Same approach as the articles stub added in the previous PR.
- [x] **Step 2:** Confirm both screens still render, then `tsc` and lint.
- [x] **Step 3: Commit** `Harness: let the subscribers and projects stubs page`

---

**The rendered check is deferred, not done.** The dev server started failing every request
with a Turbopack panic, `node process exited before we could connect to it with exit code
0xc0000142`, while spawning its PostCSS worker. A fresh server on a clean port does the same,
plain `node` spawns children fine, and vitest, tsc and lint all pass, so it is the machine
rather than this change: the same server rendered these screens an hour ago. Task 7 repeats
the rendered pass, and Vercel's build on the PR is the other check that would catch a broken
CSS pipeline.


### Task 5: Subscribers screen adopts the contract

**Files:** Modify `app/dashboard/subscribers/page.tsx`

- [x] **Step 1:** `usePageSize("subscribers")`, send `page` and `pageSize`, reset to page one when a filter, the sort or the size changes.
- [x] **Step 2:** `Pagination` with the size control, rendered when there are rows.
- [x] **Step 3:** The two-step selection: `matchingTotal` from the route's `total`, `resolveMatchingIds` through `idsOnly`.
- [x] **Step 4:** A `filterSummary` in words, on the bar and in the delete confirm. Deleting subscribers is the most destructive thing on this screen.
- [x] **Step 5:** Verify rendered, then the CI trio.
- [x] **Step 6: Commit** `Subscribers: rows per page, and select everyone a filter matches`

---

Verified on a **webpack** dev server: `next dev --webpack` works where Turbopack panics, which
also localises yesterday's failure to Turbopack's worker spawn rather than to the CSS or this
branch. 50 rows, "Page 1 of 4", and "198 subscribers selected, all matching, active
subscribers" after the second step. Zero console errors.


### Task 6: Projects screen adopts the contract

**Files:** Modify `app/dashboard/projects/page.tsx`

- [x] **Step 1 to 5:** The same five steps as Task 5, with `usePageSize("projects")`.
- [x] **Step 6: Commit** `Projects: rows per page, and select every project a filter matches`

---

Verified rendered: 50 rows, "Page 1 of 3", and "137 projects selected, all matching, every
project, unfiltered" after the second step. Zero console errors.


### Task 7: Verify and open the PR

- [ ] **Step 1:** `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, with real counts.
- [ ] **Step 2:** Rendered on both screens at 1440, 0 console errors, plus **the builder's subscriber list still loading every active subscriber**, which is the regression this PR is shaped around.
- [ ] **Step 3:** `detect.mjs` over the changed files.
- [ ] **Step 4:** Push, open the PR, report the checks, merge, confirm the production deployment carries the merge commit.
