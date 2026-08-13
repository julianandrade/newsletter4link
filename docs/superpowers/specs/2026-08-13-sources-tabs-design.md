# Sources, retabbed

> Design spec, 13 August 2026. Approved in conversation the same day.
> Mock: https://claude.ai/code/artifact/362cf05c-2167-4ec1-ac73-f3028c687e42

## The problem

`/dashboard/sources` carries two whole collections stacked on one screen, each with its own
header and its own toolbar, plus two more surfaces below them. Measured in the preview
harness at 1440 by 900, with its 434-feed stub:

| Measured | Value |
|---|---|
| Page height | 45,554px, 50.6 viewports |
| Headings | 12: one `h1` and eleven `h2`, one per category |
| Toolbars | 2, in two different dialects |
| Fetches of `/api/rss-sources` per load | 3 |
| Ways to add a source | 2, an inline form and a modal |
| Feed rows in the DOM | 434, no page size |

Eight defects follow from that structure. They are referenced by id throughout this spec.

- **D1** Two page headers. `components/rss-source-manager.tsx:700` renders its own `h2`,
  subtitle and action buttons below the real `PageHeading`.
- **D2** The `h1` counts feeds only. The email sources are a footnote in the subtitle while
  filling the first fold. `app/dashboard/sources/page.tsx:67`
- **D3** Two toolbars, 30 pixels apart, in two vocabularies: "Name, A to Z" against
  "Name (A-Z)", "Every source" against "All Categories".
- **D4** Two ways to add. The email form opens inline, pushes the list down, and needs a
  `scrollIntoView` call to explain itself. `components/email-source-manager.tsx:271`
- **D5** Unmatched senders is the last block on the page, though it is the only queue where
  mail is being dropped right now. `components/email-source-manager.tsx:729`
- **D6** The existing chip group makes "Sources" a container for two collections, and
  "Received" hides both. `app/dashboard/sources/page.tsx:136`
- **D7** One route fetched three times per load, by the page and by each manager.
  `page.tsx:38`, `email-source-manager.tsx:138`, `rss-source-manager.tsx:183`
- **D8** No page size. Every feed renders, each category wrapped in its own `Card`.
  `components/rss-source-manager.tsx:892`

## Goals

Four tabs on one route. One heading covering both kinds of source, one attention banner, one
toolbar, one list at a time. No change to any API route, any payload, or how a feed or an
email source behaves.

**Non-goals.** No new sidebar destination. No server-side paging for `/api/rss-sources`. No
reshaping of row anatomy, dialogs, the bulk bar, or the category grouping. No visual
migration: the AI Radar vocabulary in `components/radar/` is the design authority and this
change stays inside it.

## Information architecture

```
/dashboard/sources?tab=feeds|email|unmatched|received

  PageHeading        438 sources, 14 need attention
                     434 feeds - 4 email - last collected 4h ago     [Curation jobs]
  SourcesAttention   failing feeds, then quiet email, each with a jump
  SourcesTabs        Feeds 434 | Email 4 | Unmatched 4 | Received
  one panel          the tab's list, its own toolbar, its own add button
```

The tab lives in the URL as `?tab=`, written with `router.replace` so the back button is not
filled with tab switches. An unknown or missing value resolves to `feeds`. This keeps the
attention banner's jump and a bookmark both working without adding a sidebar entry, which is
what the RQ-005 AC-4.4 rule against two entries for one list would object to.

`Received` carries no count. Every other tab's count is a number an editor acts on; the
received log's size is not, and fetching it would cost a third page-level request for
decoration.

## Components

### New

| File | Responsibility |
|---|---|
| `lib/sources/tabs.ts` | `SOURCES_TABS`, `SourcesTab`, `TAB_LABELS`, `resolveTab(raw)` |
| `lib/sources/summary.ts` | `splitSources`, `sourcesHeading`, `sourceAttention`. Pure |
| `components/sources/use-source-collections.ts` | The page's two fetches and their reloads |
| `components/sources/sources-tabs.tsx` | `ChipGroup` with counts, `idBase`, horizontal scroll |
| `components/sources/sources-attention.tsx` | One banner over both kinds, with tab jumps |
| `components/sources/source-filter-bar.tsx` | Search, selects, sort, clear. Layout only |
| `components/sources/unknown-senders.tsx` | Lifted whole out of the email manager |
| `components/sources/email-source-dialog.tsx` | The email create form, in a `Dialog` |

### Edited

| File | Change |
|---|---|
| `app/dashboard/sources/page.tsx` | Rewritten as the shell, about 180 lines |
| `components/rss-source-manager.tsx` | Loses its header block and its toolbar markup; takes `sources` and `reload` as props; pagination wraps the filtered list |
| `components/email-source-manager.tsx` | Becomes the list only: header, warnings, create form and unknown senders all leave |
| `components/inbound/received-emails.tsx` | Its toolbar becomes `SourceFilterBar` |
| `components/radar/primitives.tsx` | `ChipGroup` gains roving-tabindex arrow keys |

### Untouched

Every API route. `RSSSourceRow`, the edit, delete, import and bulk-delete dialogs, the bulk
bar, and every mutation handler. The per-category `Card` grouping, which now groups whatever
the current page holds. `lib/inbound/health.ts`, whose rules are reused rather than restated.

## Contracts

```ts
// lib/sources/tabs.ts
export const SOURCES_TABS = ["feeds", "email", "unmatched", "received"] as const;
export type SourcesTab = (typeof SOURCES_TABS)[number];
export function resolveTab(raw: string | null | undefined): SourcesTab; // fallback "feeds"

// lib/sources/summary.ts
export function splitSources(rows: SourceRow[]): { feeds: SourceRow[]; emailSources: SourceRow[] };

export interface AttentionLine {
  tone: "err" | "warn";
  tab: SourcesTab;      // where the jump goes
  headline: string;     // "12 feeds failed on the last run."
  detail: string;       // up to two specifics, then "and N more"
  jumpLabel: string;    // "Show feeds"
}
export function sourceAttention(input: {
  feeds: SourceRow[];
  emailSources: SourceRow[];
  now: Date;
}): { lines: AttentionLine[]; count: number };

/** `num` is rendered inside `<Num>`, so the figures keep the mono face the design uses. */
export interface HeadingPart { num?: string; text: string }
export function sourcesHeading(input: {
  feeds: SourceRow[];
  emailSources: SourceRow[];
  attentionCount: number;
  isLoading: boolean;
}): { title: string; subtitle: HeadingPart[] };
```

The page joins `subtitle` parts with a middot. The module returns parts rather than a finished
string because the figures in that line are `<Num>` today and stay `<Num>`, so a plain string
would quietly drop the mono numerals.

`sourceAttention` takes `now` as an argument, and the page takes it once per load of the
sources rather than once per render. That is the same reasoning as the eslint-disabled
`useMemo` at `email-source-manager.tsx:182-185`: the clock a screen measures staleness against
should not move underneath it between renders.

`splitSources` keeps the existing rule: `type === "EMAIL"` is an email source, anything else
is a feed. `/api/rss-sources` returns both in one payload and that does not change.

### The heading's wording, and why

- Loading: `Sources`.
- Something flagged: `438 sources, 14 need attention`, singular `1 needs attention`.
- Nothing flagged: `438 sources, nothing flagged`.

Never "all healthy". `app/dashboard/sources/page.tsx:45-47` records why the two counts were
split in the first place: an email source has no feed URL and never reports a fetch error, so
vouching for its health asserts something nothing measured. "Nothing flagged" claims only
that no rule fired, which is true of both kinds. Fixes **D2**.

`attentionCount` is failing feeds plus email sources whose own cadence rule fired, each
judged by its own measure. A source with no `expectedCadenceDays` never counts as flagged and
is never described as healthy: `healthWarning` in `lib/inbound/health.ts` is the authority for
which email sources are in trouble, and this spec adds no second opinion.

Subtitle: `434 feeds`, `4 email`, and `last collected 4h ago` when any active feed has a
`lastFetchedAt`. Singular forms where the count is 1.

### The data layer

`useSourceCollections()` owns both page-level fetches and returns:

```ts
{
  feeds, emailSources, isLoading, error, reload,           // /api/rss-sources
  unknown, unknownState, unknownMessage, unknownTruncated, // /api/inbound/unknown-senders
  reloadUnknown,
  reloadAll,
}
```

One `/api/rss-sources` call per load, against three today. Fixes **D7**. Both managers become
prop-driven and call the shared `reload` after a mutation instead of refetching for
themselves. Their mutation handlers keep their current optimistic behaviour, including the
parse-mode rollback.

`unknown` is fetched at page level because its count is in the tab row.

### The promote flow

The page owns `emailDraft: NewSourceDraft | null`. Promote in the Unmatched tab fills it and
opens `EmailSourceDialog`; on success the page calls `reloadAll` and switches to the Email
tab. This retires the `scrollIntoView` call at `email-source-manager.tsx:271` and the layout
problem it compensated for. The requeue-held-emails call after creation keeps its current
behaviour. Fixes **D4** and **D5**.

### Filter bar

`SourceFilterBar` lays out a search box, any number of selects, a sort control and a clear
button, and owns none of that state: each tab passes its own values and handlers. One
vocabulary throughout, radar sentence case, so "Every category" and "Name, A to Z" replace
"All Categories" and "Name (A-Z)". Fixes **D3**.

Used by Feeds, Email and Received. The Received panel's own filter state stays inside
`ReceivedEmails`; only its markup changes.

### Feeds pagination

50 rows per page over the filtered, sorted list, using `Pagination` from
`components/radar/controls.tsx`. The page resets to 1 whenever a filter or the sort changes.
Sorting and filtering stay in the browser, which `lib/list-sort.ts` permits for a route that
returns the complete set with no `take`.

Select-all reads "Select all 50 on this page" and selects exactly those rows, so the count on
the control stays the count the bulk bar acts on. Category cards group whatever the current
page contains, so page 1 may hold three categories and page 2 the rest of the third. Fixes
**D8**.

## States

| State | Behaviour |
|---|---|
| Loading | Skeleton counts in the tab row, `SkeletonRows` in the panel, `h1` reads "Sources" |
| `/api/rss-sources` fails | `LoadError` above the tab row; the tab row still renders |
| Unknown senders 403 | The tab stays, without a count; the panel shows the existing restricted note. A tab that explains itself beats a tab row that changes shape after load |
| Unknown senders empty | Count 0, panel says nothing is unclaimed |
| Filter matches nothing | Today's copy, inside the panel, with the control that widens it still rendered |
| No sources at all | Today's empty state, inside the Feeds panel |
| Narrow | Tab row scrolls horizontally, filter bar wraps, buttons full width below `sm` |

## Accessibility

`ChipGroup` already renders `role="tablist"`. This change passes `idBase="sources"` so every
tab's `aria-controls` resolves, and each panel takes `role="tabpanel"`, an id, `tabIndex={0}`
and `aria-labelledby`.

`ChipGroup` also gains roving tabindex and Left/Right arrow navigation, because it has
claimed the tablist pattern on ten screens without supporting its keyboard contract. That is
a shared primitive, so the change is additive and its own commit: only one tab is in the tab
order, arrows move selection and focus together, Home and End jump to the ends.

## Testing

- `tests/unit/sources-summary.test.ts`: the split; heading wording across loading, zero,
  singular and plural; attention aggregation and ordering; a no-cadence source counting as
  neither flagged nor healthy.
- `tests/unit/sources-tabs.test.tsx`: `resolveTab` over a good value, an unknown value, null;
  the rendered tab row's aria wiring; arrow-key navigation.
- Existing suites must stay green, `inbound-health` in particular, since its rules are reused.
- `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, in that order, as CI runs them.

Run vitest from this worktree only. `vitest.config.ts` excludes `node_modules` and `.next`
and nothing else, so a run that sees a second checkout reports its tests too.

## Verification

Rendered, in the preview harness at `/radar-preview?screen=sources`, on a port this worktree
picks rather than 3111:

1. Feeds tab under 3 viewports at 1440 by 900 with the 434-feed stub, against 50.6 today.
2. All four tabs at 1440 and at 390.
3. `/api/rss-sources` requested once per load, confirmed in the network log.
4. `node <impeccable>/scripts/detect.mjs --json --scope layout` over the changed files, with
   no unexplained findings.

## Follow-ups, deliberately out of scope

- Row anatomy still differs between a feed and an email source. Converging them is a separate
  pass, and worth doing.
- The category `Card` wrappers are heavier than the content needs. Flattening them to sticky
  group headers belongs with that same pass.
- `PRODUCT.md` does not exist, so this change treats the incumbent code as design authority.
  `/impeccable init` afterwards would fix that.
- On completion, `CLAUDE.md`'s decision table takes a row: everything a source screen shows is
  a tab, and the heading never vouches for health nothing measured.
