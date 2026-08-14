# Server paging for subscribers and projects

> Design spec, 14 August 2026. Second of three, after the paging contract and before the
> width scale.
> Contract it adopts: `docs/superpowers/specs/2026-08-13-list-paging-contract-design.md`

## The problem

These are the two screens the first spec had to leave out. Both return every row their
filter matches, render all of them, and still offer bulk actions over the lot, which means
the select-all on each is already "everything in the organization" with no paging to make
that visible or reversible.

`/api/subscribers` and `/api/projects` both filter and sort in the database and then take no
page. Adding one is mechanical: neither sorts by anything derived, so `skip` and `take`
alongside the existing `orderBy` is the whole change, with no need for the two-pass ordering
`/api/articles` requires.

## The decision that matters: paging is opt-in

**A request with no `page` parameter gets the whole list, exactly as today.**

`app/dashboard/send/[id]/page.tsx:420` fetches `/api/subscribers` with no parameters and
selects every active subscriber as the recipients of the edition. A default page size would
have silently limited a send to the first fifty people, and nothing on that screen would
have looked wrong: the list it renders is the list it sends to.

So the route pages only when asked. The subscribers screen asks; the builder does not. The
same rule applies to projects for symmetry, and because `?teams=true` is a second shape on
that route already.

This is the opposite of what "server-side paging" usually means, and it is deliberate. The
alternative, paging by default with an opt-out, puts the burden on every future caller to
remember a flag, and the failure mode when they forget is a truncated send rather than a
slow page.

## What each route gains

```
GET /api/subscribers?page=1&pageSize=50   -> { data, count, total, page, pageSize, sort, meta }
GET /api/subscribers                      -> { data, count, sort, meta }   unchanged
GET /api/projects?page=1&pageSize=50      -> { data, count, total, page, pageSize, sort }
GET /api/projects                         -> { data, count, sort }         unchanged
GET /api/projects?teams=true              -> unchanged
```

`pageSize` is clamped by `clampPageSize` from `lib/list-page-size.ts`, so a query string
cannot ask for ten thousand rows. `total` is a `count` over the same `where` the list uses,
which is what makes "N of M matching" honest, and it is only computed when a page was asked
for: an unpaged request has no use for it and should not pay for a second query.

`idsOnly=true` returns `{ ids, total }` for the matching selection, through the same `where`
and `orderBy`, so the ids and the count always describe the same rows. Same shape as
`/api/articles`.

## What each screen gains

Both adopt the contract from the first spec, unchanged:

- `usePageSize("subscribers")` and `usePageSize("projects")`, so 25, 50 or 100, remembered.
- `Pagination` with the size control, and the page resetting to one when a filter, the sort
  or the size changes.
- The two-step selection, with `matchingTotal` from the route's `total` and
  `resolveMatchingIds` calling `idsOnly`.
- A `filterSummary` in words for the bulk bar and for every destructive confirm. Deleting
  subscribers is the most destructive action in this product that is not an edition send.

## States

| State | Behaviour |
|---|---|
| No `page` parameter | The whole list, no `total`, no second query |
| `page` beyond the end | The last page's rows, with `page` clamped in the response |
| `pageSize` junk or absent | 50 |
| Filter narrows below one page | Pager disappears, selection drops out of matching mode |
| `teams=true` | Untouched, still the distinct team list |

## Testing

- The page window over both routes: first page, last short page, page past the end, and
  `idsOnly` ignoring the page.
- **A request with no `page` returns everything**, which is the test that stands between
  this change and a truncated send. It names the builder in its comment.
- Both screens: the size control appears, the pager recomputes, and a matching selection
  resolves through `idsOnly` rather than from the rendered page.
- Rendered on both screens in the harness, which needs its subscribers and projects stubs
  taught `page`, `pageSize` and `idsOnly`.

## Out of scope

Asides, received emails and templates are capped rather than paged. Each is its own
decision, and none of them has bulk actions over an unbounded set, which is what made these
two urgent.
