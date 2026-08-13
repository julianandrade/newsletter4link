# List Paging Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One page-size control and one two-step selection shared by every list that pages, applied to feeds, articles and curation jobs.

**Architecture:** Two new units (a pure page-size module and a storage-backed hook) plus two extended primitives (`Pagination`, `useSelection`). Screens compose them; no god-hook, because the lists differ in where their rows live. "All matching" always resolves to explicit ids before any action runs.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest with jsdom, @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-13-list-paging-contract-design.md`

## Global Constraints

- Branch `feat/list-paging` in the worktree `C:\Users\julian.andrade\prj\n4l-sources`. Stage explicit paths, never `git add -A`.
- **No long dashes anywhere.** Comma, hyphen or colon.
- **Bulk endpoints keep taking `ids: string[]`.** No endpoint learns a filter.
- **Never read `localStorage` during render.** Effect only, first client render equals the server's.
- Sizes are 25, 50, 100; default 50; anything else clamps to 50.
- `npx vitest run`, `npx tsc --noEmit`, `npm run lint` before each task's commit.
- Dev server on a free port, not 3111.

---

### Task 1: The page-size vocabulary

**Files:** Create `lib/list-page-size.ts`, `tests/unit/list-page-size.test.ts`

**Produces:** `PAGE_SIZES`, `PageSize`, `DEFAULT_PAGE_SIZE`, `clampPageSize(value: unknown): PageSize`, `pageSizeKey(list: string): string`.

- [x] **Step 1: Write the failing test** covering each valid size, `"50"` as a string, `null`, `undefined`, `0`, `5000`, `NaN`, and an object. Every one that is not exactly 25, 50 or 100 returns 50. `pageSizeKey("feeds")` is `"n4l.pageSize.feeds"`.
- [x] **Step 2: Run it and watch it fail** on the unresolved import.
- [x] **Step 3: Implement**, with a comment recording why a stored value is clamped rather than trusted: the key is editable in devtools and a 5,000-row page is a hung tab.
- [x] **Step 4: Run it green.**
- [x] **Step 5: Commit** `Lists: name the three page sizes, and clamp anything else`

---

### Task 2: The hook that remembers

**Files:** Create `components/radar/use-page-size.ts`, `tests/unit/use-page-size.test.tsx`

**Produces:** `usePageSize(list: string): [PageSize, (next: PageSize) => void]`

- [x] **Step 1: Write the failing test.** First render returns 50 even when storage holds 100, because the server rendered 50; after the effect flushes it reads 100. A junk value yields 50. Setting writes through `pageSizeKey`. A throwing `localStorage` (private mode) does not crash the hook.
- [x] **Step 2: Run it and watch it fail.**
- [x] **Step 3: Implement.** `useState(DEFAULT_PAGE_SIZE)`, then a mount effect that reads and clamps. Every storage access wrapped, because Safari private mode throws on write. Comment the render/effect split and point at the two hydration bugs in `2026-08-13-sources-tabs-design.md`.
- [x] **Step 4: Run it green, plus `tsc`.**
- [x] **Step 5: Commit** `Lists: remember a page size per list, in storage rather than the URL`

---

### Task 3: Pagination gains the control

**Files:** Modify `components/radar/controls.tsx`, create `tests/unit/pagination-size.test.tsx`

**Produces:** `Pagination` accepts optional `pageSize`, `onPageSize`, `sizes = PAGE_SIZES`. Existing callers that pass none render exactly as before.

- [x] **Step 1: Write the failing test.** Without the props, no select renders and the markup matches today. With them, a labelled select shows the three sizes, the current one selected, and choosing one calls `onPageSize` with a number, not a string.
- [x] **Step 2: Run it and watch it fail.**
- [x] **Step 3: Implement** with `RadarSelect`, `aria-label="Rows per page"`, options read as "25 per page". Keep the existing early return for a single page, but **render the size control even then**: at 30 rows with a page of 25 you want the control that shows all 30, and hiding it there is the state where it is most needed.
- [x] **Step 4: Run green,** and confirm the two current callers (articles, curation) are visually unchanged.
- [x] **Step 5: Commit** `Radar: let Pagination carry a rows-per-page control`

---

### Task 4: Selection learns "all matching"

**Files:** Modify `components/radar/selection.tsx`, create `tests/unit/selection-matching.test.tsx`

**Produces:** `useSelection(visibleIds, options?)` where options are `{ matchingTotal?: number; resolveMatchingIds?: () => Promise<string[]> }`. The returned `Selection` gains `mode: "page" | "matching"`, `matchingTotal`, `canSelectMatching`, `selectAllMatching()`, and `idsForAction(): Promise<string[]>`.

- [x] **Step 1: Write the failing test.** `canSelectMatching` is false when `matchingTotal` is absent or not greater than `visibleIds.length`. `selectAllMatching()` sets mode and reports `matchingTotal` as the count. `idsForAction()` returns the explicit set in page mode and the resolved list in matching mode. **A change to `visibleIds` drops matching mode back to page**, which is the behaviour that keeps an action from hitting rows nobody can see. A rejecting `resolveMatchingIds` propagates so the caller can abort.
- [x] **Step 2: Run it and watch it fail.**
- [x] **Step 3: Implement.** Rewrite the file's header comment: the rule was "select-all means everything currently visible, never everything in the database", and that is now one of two modes rather than the only one. Record why the second mode is explicit, opt-in, and resolves to ids. Replace the literal NUL in `visibleIds.join("\0")` with `"\u0000"`, same value, so the file stops reading as binary to every grep in the repo.
- [x] **Step 4: Run the whole suite,** since six screens use this hook.
- [x] **Step 5: Commit** `Radar: selection can mean every row a filter matches, resolved to ids`

---

### Task 5: The bulk bar says which selection it holds

**Files:** Modify `components/radar/selection.tsx` (`BulkBar`), extend `tests/unit/selection-matching.test.tsx`

- [ ] **Step 1: Write the failing test.** In matching mode the bar reads "434 selected, all matching"; in page mode it reads as today. A destructive action passes `filterSummary` to its confirm.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.** `BulkBar` takes an optional `filterSummary: string` and renders the mode in its count line.
- [ ] **Step 4: Run green.**
- [ ] **Step 5: Commit** `Radar: the bulk bar says whether the selection is a page or a filter`

---

### Task 6: `idsOnly` on the articles route

**Files:** Modify `app/api/articles/route.ts`, create `tests/unit/articles-ids-only.test.ts`

- [ ] **Step 1: Write the failing test.** For a given filter, `idsOnly=true` returns exactly the ids the same filter selects, in the same order, and ignores `page`. The shape is `{ ids }` with no article bodies.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement** by branching after the existing filter is applied and before pagination, so one filter implementation feeds both outputs.
- [ ] **Step 4: Run green plus `tsc`.**
- [ ] **Step 5: Commit** `Articles: return just the ids a filter matches, for select-all`

---

### Task 7: Feeds adopt both

**Files:** Modify `components/rss-source-manager.tsx`

- [ ] **Step 1: Wire `usePageSize("feeds")`** into `pageWindow`, replacing the `FEEDS_PER_PAGE` constant, and pass the size props to `Pagination`.
- [ ] **Step 2: Wire the second selection step.** `matchingTotal` is `filteredSources.length`; `resolveMatchingIds` maps the already-loaded rows, since this list holds every row in the browser.
- [ ] **Step 3: Give the delete confirm a `filterSummary`** built from the search, category and status, reading "category Security, status active, search \"substack\"".
- [ ] **Step 4: Verify rendered:** change the size and watch the pager recompute, select all matching, and confirm the delete dialog names the filter. Then the CI trio.
- [ ] **Step 5: Commit** `Feeds: rows per page, and select every feed a filter matches`

---

### Task 8: Articles adopt both, and 200 becomes 50

**Files:** Modify `app/dashboard/articles/page.tsx`, `lib/articles/list-filter.ts`

- [ ] **Step 1: Replace `ARTICLE_PAGE_SIZE = 200`** with the requested size, clamped, defaulting to 50. The route reads it from the query; the screen sends what `usePageSize("articles")` holds.
- [ ] **Step 2: Wire the second selection step** using `idsOnly` for `resolveMatchingIds`.
- [ ] **Step 3: Give its destructive confirms a `filterSummary`.**
- [ ] **Step 4: Verify rendered,** including that a filter change while "all matching" is active drops back to page mode. Then the CI trio.
- [ ] **Step 5: Commit** `Articles: fifty per page by default, and select every article a filter matches`

---

### Task 9: Curation jobs take the size

**Files:** Modify `app/dashboard/curation/page.tsx`

- [ ] **Step 1: Wire `usePageSize("curation")`** into the existing `limit` query and pass the size props to its `Pagination`. No selection: that list has no bulk actions.
- [ ] **Step 2: Verify rendered** and run the CI trio.
- [ ] **Step 3: Commit** `Curation: rows per page on the run history`

---

### Task 10: Verify and open the PR

- [ ] **Step 1:** `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, reporting real counts.
- [ ] **Step 2:** Rendered at 1440 on all three screens, 0 console errors, and `detect.mjs` over the changed files.
- [ ] **Step 3:** One row in `CLAUDE.md`'s decision table: what a page size is, where it lives, and what "all matching" is allowed to do.
- [ ] **Step 4:** Push, open the PR, report the checks. Merge only because shipping was explicitly asked for.
