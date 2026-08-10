# One picker, built for 128 waiting stories

> Design, 10 August 2026

## The problem

Adding articles to an edition is one click per article, on two different screens that
disagree with each other. With 128 approved stories waiting, both are unusable.

The click count is the symptom, not the cause. The picker was built for a pool of about
twenty and has never been given the tools the rest of the app already has.

**No filters.** `components/edition-article-picker.tsx` has a search box and nothing else.
`components/proposal/add-to-proposal.tsx` the same. Meanwhile `components/article-filters.tsx`
already ships a score range, topic pills, a date range and eight sort orders, and the Queue
uses it. The two pickers are the only article lists in the app flying blind.

This is the real bottleneck. An editor sends ten to twenty stories, so the job is finding
the good ones among 128, not adding 128. Bulk-add on its own would not have helped: you
still have to read 128 titles to know which ones to tick.

**The pool is silently truncated.** `readCandidatePool` applies `take: limit`, and the
dialog asks for `limit=50`. With 128 waiting, 78 of them do not exist as far as that dialog
is concerned, and nothing on screen says so. Put a "select all" button on top of that and it
would confidently offer to add 50 while looking like it means everything.

**No selection.** `components/radar/selection.tsx` is the house pattern: `useSelection`,
`SelectCheckbox`, `BulkBar`, unit-tested, already wired into subscribers, projects, the
Queue, Sources and the editions table. The two pickers are the only long lists that skip it.
`add-to-proposal.tsx` even imports `SelectCheckbox` and then rolls its own `Set`, so it gets
the checkbox and none of the shift-range or select-all behaviour behind it.

## The shape

One filtered, selectable candidate list, used by both surfaces. Narrow 128 down to the
dozen worth sending, take them in one action, and clear the rest without leaving the screen.

```
Edition 33 · Articles

┌ In this edition (12) ─────────────────────────┐
│ ⠿ 1  Anthropic ships a smaller…   8.4  ↑↓  ✕ │
│ ⠿ 2  The quiet revolution in…     9.1  ↑↓  ✕ │
└───────────────────────────────────────────────┘

┌ Waiting ──────────────────────────────────────┐
│ [🔍 Search…] [Score high↓] [Filters ②] [Clear] │
│ ☑ THE VERGE · 2d   Anthropic ships…  ▮▮▮▯ 8.4 │
│ ☑ ARS TECH · 3d    The quiet rev…    ▮▮▮▮ 9.1 │
│ ☐ WIRED · 4d       Why agents are…   ▮▮▮▯ 8.0 │
│ Showing 24 of 128 waiting                      │
└───────────────────────────────────────────────┘

  ┌ 2 stories selected · Select all visible ─────┐
  │            [Add 2]  [Reject]  [Discard]      │
  └──────────────────────────────────────────────┘
```

### The decisions, and why

**The builder hosts the list inline at full width; the proposal keeps its dialog. They
share the list, not the chrome.** The builder's `grid-cols-2` gave equal width to a
128-row pool and a 12-row edition, which is the wrong allocation of the screen. Inline also
means the edition's running order stays visible, so you watch it grow as you add. Sharing
the guts rather than the shell is what stops the drift: the two surfaces currently disagree
on checkboxes, on which pool they read, and on whether stories already used elsewhere are
offered.

**The bar carries Add, Reject and Discard, not just Add.** The backlog of
approved-but-never-used stories has no other home. The Queue only lists `PENDING_REVIEW`,
so an approved story that never made an edition is invisible everywhere except the picker,
and accumulates forever. `PATCH /api/articles/bulk` already does both verdicts with an
EDITOR guard and a 1000-id ceiling, so this is wiring, not new machinery.

**No drag-and-drop between pipeline columns.** You cannot drag 128 things. Checkboxes plus
one action beat dragging at every scale above about five items, work on touch and keyboard,
and add no dependency. Reordering *within* an edition keeps the drag it already has, because
there the list is short and position is the whole point.

**The pool excludes anything already in any edition.** This matches the proposal's existing
rule (`editions: { none: {} }` in `readCandidatePool`) and is a deliberate behaviour change
for the builder, which today reads `/api/articles/approved` and so offers stories already
used elsewhere. One rule in one place beats two screens answering the same question
differently.

**Filters run in the database, not the browser.** Narrowing 50 client-side when 128 match
is narrowing the wrong set. This is the same rule already recorded in CLAUDE.md: a route
that paginates or caps its rows sorts and filters in the database.

## Sorting a capped pool

`date` and `source` are derived values. `date` is `publishedAt ?? capturedAt` and Postgres
cannot express that through Prisma's `orderBy`; `source` is a publication name derived from
the URL and has no column at all. Sorting in process after a `take` would order only the
rows that survived an arbitrary cut, which is precisely the defect `lib/articles/sort.ts`
was written to remove.

So the pool takes the two-pass shape `app/api/articles/route.ts` already uses:

1. read the whole filtered set, selecting only the sort columns
2. `sortArticles` over all of it, giving a total order
3. slice the page, keeping `total` as the population
4. re-read the page's full rows by id
5. re-order by the sliced ids, because `findMany` does not honour `in` order

`total` is what makes the count line honest: "Showing 24 of 128 waiting" rather than a
number that quietly means "24 of the first 50".

## Units

| Unit | Responsibility |
|---|---|
| `readCandidatePool` (`lib/editions/proposal.ts`) | What may still be added, filtered, ordered, counted. The one place eligibility is decided. |
| `GET /api/editions/proposal/candidates` | Parse and clamp query params. No policy. |
| `CandidateList` (`components/edition/candidate-list.tsx`) | Filters, selection, rows, bar. Knows nothing about how a host persists. |
| `EditionOrderList` (`components/edition/edition-order-list.tsx`) | Position within an edition: number, up, down, remove, drag. |
| Hosts (builder, proposal dialog, pipeline board) | Persistence. Each keeps its own model. |

The seam that matters is the last one. The builder batches into `isDirty` and waits for
Save Draft; the proposal writes through on every change. `CandidateList` hands back the
chosen rows and lets each host decide, so neither persistence model leaks into the list.

There is no add/verdict conflict to reconcile: the pool excludes anything already in an
edition, so nothing sitting in the builder's unsaved selection can be discarded from the
pool underneath it.

## What is not being built

- **A "not this time" state** that parks an approved story without rejecting it. It needs a
  new `Article` column, and it is worth its own conversation once the filters reveal whether
  the backlog still accumulates when it is easy to work.
- **Drag-and-drop between pipeline columns**, for the reason above.
- **Fixing the unbounded double full-table read** in `app/api/articles/pending/route.ts`.
  Real, and separate from the picker.
