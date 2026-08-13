# One paging and selection contract for every list

> Design spec, 13 August 2026. Approved in conversation the same day.
> First of three: this one, then subscribers and projects paging, then the width scale.

## The problem

Every list on this dashboard grew its own paging, and nobody ever decided the vocabulary.

| Screen | Paging | Page size | Bulk select |
|---|---|---|---|
| Articles | server | 200, hardcoded | yes |
| Curation jobs | server | 10, hardcoded | no |
| Feeds | browser | 50 | yes |
| Subscribers | none, renders every row | n/a | yes |
| Projects | none, renders every row | n/a | yes |
| Asides | none, capped at 50 and 200 | n/a | no |
| Received emails | server, capped | 100 | no |

Three paging behaviours, one page size twenty times another, and the two screens whose
bulk actions reach furthest have no paging at all. None of it is written down, so a new
list copies whichever neighbour it was pasted from.

Two things are missing from all of them: a way to change how many rows you see, and a way
to act on everything a filter matches rather than everything on screen.

## Goals

One page-size control and one two-step selection, shared, applied to the three lists that
already page. No bulk endpoint changes: they keep taking `ids: string[]`.

**Non-goals.** Subscribers and projects wait for their own APIs, which is the next spec.
Asides, received emails and templates keep their caps for now; converting a capped list
into a paged one is a separate decision per list. No visual migration.

## Decisions

**25, 50, 100, defaulting to 50.** Three steps that differ enough to be worth a click. Ten
is a page you scroll past without deciding anything; two hundred is not paging, it is the
cap articles has today with a pager attached. Articles therefore drops from 200 rows to 50,
which is the largest visible change here and is deliberate.

**The size lives in `localStorage`, per list, not in the URL.** It is a workspace
preference: a link you send a colleague should show them the same rows, not your density.
A stored value that is not one of the three sizes falls back to 50, so a hand-edited entry
cannot produce a 5,000-row page.

**"All matching" resolves to ids before anything runs.** The bulk endpoints keep taking an
explicit id list. A filter re-interpreted on the server is how you delete rows nobody
chose, and an id list is auditable in a way a query string is not.

**Destructive actions stay available on an all-matching selection**, behind a confirm that
names the count *and* the filter in words. The count alone is exactly what you cannot
verify when the rows are off screen.

## Components

### New

| File | Responsibility |
|---|---|
| `lib/list-page-size.ts` | `PAGE_SIZES`, `DEFAULT_PAGE_SIZE`, `clampPageSize`, `pageSizeKey`. Pure |
| `components/radar/use-page-size.ts` | `usePageSize(listKey)`, localStorage read and write |

### Changed

| File | Change |
|---|---|
| `components/radar/controls.tsx` | `Pagination` gains optional `pageSize`, `onPageSize`, `sizes` |
| `components/radar/selection.tsx` | `useSelection` gains a mode, a matching total, and `resolveIds` |
| `components/rss-source-manager.tsx` | adopts both |
| `app/dashboard/articles/page.tsx` | adopts both; 200 becomes 50 |
| `app/dashboard/curation/page.tsx` | adopts the page size only |
| `app/api/articles/route.ts` | `idsOnly=true` returns `{ ids }` through the same filter |

## Contracts

```ts
// lib/list-page-size.ts
export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;
/** Anything that is not one of the three sizes, including junk from storage. */
export function clampPageSize(value: unknown): PageSize;
export function pageSizeKey(list: string): string; // "n4l.pageSize.feeds"

// components/radar/use-page-size.ts
export function usePageSize(list: string): [PageSize, (next: PageSize) => void];
```

`usePageSize` reads storage **in an effect, never during render**, and its first client
render returns `DEFAULT_PAGE_SIZE`, the same value the server rendered. Reading storage
during render is a server/client branch, and this project has already paid for that twice:
see the hydration notes in `2026-08-13-sources-tabs-design.md`.

```ts
// components/radar/selection.tsx
export type SelectionMode = "page" | "matching";

useSelection(orderedIds: string[], options?: {
  /** Total matching the current filter. The second step appears only when it exceeds the page. */
  matchingTotal?: number;
  /** Called before any bulk action when the mode is "matching". */
  resolveMatchingIds?: () => Promise<string[]>;
})
```

The hook gains `mode`, `selectAllMatching()`, and an `idsForAction(): Promise<string[]>`
that returns the explicit selection in page mode and the resolved list in matching mode.

**A filter change drops matching mode back to page mode.** Acting on a set you can no
longer see is the failure this contract exists to prevent, and it is the one behaviour a
test must pin.

### The API addition

`GET /api/articles?idsOnly=true` returns `{ ids: string[] }` built from the same
`lib/articles/list-filter.ts` the list uses. One filter implementation with two outputs,
so the list and the selection can never disagree about what "matching" means.

## States

| State | Behaviour |
|---|---|
| Fewer rows than a page | No pager, no second selection step |
| Matching total equals page size | No second step: "all on this page" already is everything |
| Page size raised past the total | Pager disappears, page clamps to 1 |
| Resolve fails mid-action | The action does not run, the selection survives, a toast says why |
| Storage unavailable or junk | 50, silently |

## Testing

- `clampPageSize` over each valid size, a junk string, `null`, `0`, `5000`, `"50"`.
- Selection: page to matching and back, the drop on filter change, `idsForAction` in both
  modes, and the guard that a resolve failure runs nothing.
- `Pagination` renders the size control only when handed one, so unmigrated screens are
  untouched.
- `idsOnly` returns exactly the ids the same filter selects, asserted against the list.
- Rendered on all three screens at 1440, plus the CI trio.

## Follow-ups

Subscribers and projects need server paging before they can adopt this; that is the next
spec. Asides, received emails and templates are capped rather than paged, and each is its
own decision.
