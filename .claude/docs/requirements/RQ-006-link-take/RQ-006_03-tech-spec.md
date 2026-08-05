# Req ID: RQ-006_03, the article detail view, technical specification

> The third of the four requirements the Link Take plan was split into, per the
> split table in [`PLAN-REVIEW.md`](PLAN-REVIEW.md). `_01` (data model, generation
> path, mechanical checks) and `_02` (input pipeline, robots, wall detection) are
> built and in production. This spec covers only the screen.
>
> Sources, all binding: [`PLAN.md`](PLAN.md) sections "Hard rules" and "Surfaces",
> [`PLAN-REVIEW.md`](PLAN-REVIEW.md) findings F1, F5, F6 and recorded decision 1,
> `CLAUDE.md`, `docs/AIDLC.md`.
>
> Written 6 August 2026 against the working tree at commit `d5da507`. Every file
> path, field name and signature named below was read in the code, not inferred.
>
> Stack: Next.js 16 App Router, React 19, TypeScript, Prisma 7 against Supabase
> Postgres. Any instruction from a shared agent that assumes .NET or Angular does
> not apply here.

---

## 1. The gate, and what it forces

From the split table: **"Source name and URL present on every rendering."**

That single sentence decides the architecture. Rule 5 of the plan says the
attribution block is always rendered, and the API was already built so that no
surface *can* render the prose without it: `attribution` is a mandatory field of
every successful response, never optional, with a comment saying why. The screen
has to be built the same way, which means the attribution cannot be markup
sprinkled inside a large component where a future edit can drop it. It is its own
component, and it is rendered by the one code path every state passes through.

The test that proves the gate is therefore not a visual inspection. It is: for
each of the four payload states, render the view and assert the publication name
and the source URL are in the output.

## 2. What exists already, so this spec does not restate it

| | Where | Relevant fact |
|---|---|---|
| Read the Link Take | `GET /api/articles/[id]/rewrite` | Returns `attribution`, `rewrite` or `null`, `unavailableReason`, `stale`, `summary`. Generates when absent unless `?generate=false`. Any org member. |
| Generate on demand | same route, `?generate=true` | `rewriteArticle(db, id, "on-open")`, unforced. Any org member. Counted against `ON_OPEN_DAILY_CAP`. |
| Regenerate | `POST /api/articles/[id]/rewrite` | Forced, supersedes, `requireRole(ctx, "EDITOR")`. |
| History | `PATCH /api/articles/[id]/rewrite` | Every version with status, `checkSummary`, `longestSharedRun`, `wordCount`, `inputMode`, `model`, `generatedAt`, `error`. EDITOR+. |
| Role in the browser | `components/radar/use-role.ts` | `useOrgRole().atLeast("EDITOR")`, false while loading and after failure. |
| Attribution rendering | `components/radar/primitives.tsx` | `SourceStamp` already renders brand square, publication name and age. |
| Verification without a session | `app/radar-preview/` | Imports page components, stubs `fetch` by URL substring, dev-only (404 in production). |

**`rewrite` is only ever a piece that passed its checks.** A `FAILED` row is
never returned as readable content. This is `_01`'s fail-closed posture and the
screen does not get to soften it.

## 3. One API change, and why the alternative was rejected

The payload cannot currently distinguish *never attempted* from *attempted and
refused*. Both arrive as `rewrite: null`, and the only difference is that
`unavailableReason` carries either the stored error or the literal fallback string
`"No Link Take has been written for this article yet."`.

A screen that told those two apart by comparing an English sentence would break
the first time somebody rewords the sentence, and it would break silently, showing
a "write one" button for an article whose generation had been refused.

**Add one boolean to the GET payload:**

```ts
/** Whether anything has ever been attempted for this article, passing or not. */
attempted: boolean,   // current.rewrite !== null
```

Nothing else changes in the route. `lastAttempt` details are deliberately not
added: the history endpoint already returns all of them, and adding a second way
to read the same rows would create two answers to one question.

## 4. The four states

`lib/rewrite/view.ts`, pure, no React, no network. One function turns the payload
into a discriminated union, so the component holds a `switch` rather than a
thicket of `&&`.

```ts
export type LinkTakeState =
  | { kind: "ready";   rewrite: ViewRewrite }
  | { kind: "stale";   rewrite: ViewRewrite }
  | { kind: "absent" }
  | { kind: "refused"; reason: string }
```

| Kind | Payload shape | Screen |
|---|---|---|
| `ready` | `rewrite` non-null, `stale` false | Prose is the body. Summary secondary, collapsed. |
| `stale` | `rewrite` non-null, `stale` true | Same, plus a warning Callout and, for EDITOR+, regenerate beside it. |
| `absent` | `rewrite` null, `attempted` false | Summary is the body. A button to write one. |
| `refused` | `rewrite` null, `attempted` true | Summary is the body. The reason, stated. Retry only for EDITOR+. |

Loading and request failure are **not** states of this union. They belong to the
route component, which handles them the way `app/dashboard/curation/[id]/page.tsx`
already does: `SkeletonRows` while loading, `EmptyState` when the article is not
found, `LoadError` when the request fails. Keeping them out of `view.ts` is what
lets `view.ts` be a pure function of the payload with nothing mocked.

### 4.1 Why `stale` shows the prose

F6 built the staleness mechanism on purpose, so ignoring it is waste, and hiding
a piece that passed its checks is a loss for no gain: it was verified against the
text it was written from, which is the only text it ever claimed to describe. The
warning says the article changed afterwards. That is the honest statement, and it
is more informative than an absence.

## 5. Files, and who owns what

The rule from RQ-005's spec holds: nothing that knows about the network knows how
to draw, and nothing that knows how to draw knows about the network.

| File | New | Purpose |
|---|---|---|
| `lib/rewrite/view.ts` | yes | `resolveLinkTakeState(payload)`, `formatInputMode`, `aiLabelFor`. Pure. |
| `lib/markdown/blocks.ts` | yes | The markdown subset, parsed to data. Pure, and knows nothing about rewrites. |
| `components/article/attribution-block.tsx` | yes | Rule 5, alone. Publication, source URL, published date, original title. |
| `components/article/link-take-evidence.tsx` | yes | The evidence line, and the history panel for EDITOR+. |
| `components/article/link-take-view.tsx` | yes | The screen. Props in, markup out, no `fetch`. |
| `components/article/article-title-link.tsx` | yes | The headline as a link to our page. Knows an app route, so it stays out of `radar/`. |
| `app/dashboard/articles/[id]/page.tsx` | yes | The route. Fetches, holds state, passes callbacks. `"use client"`. |
| `components/radar/primitives.tsx` | no | Gains `ExternalLink`; `SourceStamp` gains an optional `href`. |
| `components/radar/controls.tsx` | no | Gains `RadarDisclosure`. |
| `lib/radar/source.ts` | no | Gains `shortDate`. |
| `app/api/articles/[id]/rewrite/route.ts` | no | One field added, per section 3. |
| `components/proposal/queue-view.tsx` | no | Title links here; the source stamp and the source column link out. |
| `components/proposal/proposal-view.tsx` | no | Same, for the proposal list. |
| `app/radar-preview/harness.tsx` | no | Four screen entries, fetch stubs, one fixture per state. |

### 5.0 What went into the shared vocabulary, and why

Three things this screen needed did not belong to this screen. A review round after
the first working version moved them, and the rule applied was the one
`components/radar/controls.tsx` states about itself: a pattern is promoted once it
repeats.

- **`RadarDisclosure`**: the `<details>` shell appeared twice in this change alone, with
  its class strings copy-pasted between two files. It takes an optional `onFirstOpen`,
  which is what a panel whose content costs a request needs.
- **`ExternalLink`**: `rel="noopener noreferrer"` is a security attribute (reverse
  tabnabbing, A02) and it was being hand-typed in four places in this change. One owner
  now.
- **`SourceStamp` gains `href`** rather than a second component wrapping it. The
  precedent is `radarButtonClass`, exported so a link can wear the button skin without
  nesting an anchor in a button: one widget, one name, clickable or not.

`shortDate` went to `lib/radar/source.ts` beside `relativeTime` and `dayLabel`. Eight
other files still carry their own copy of the same options object; those are out of this
requirement's scope, and this is the place they can converge on.

### 5.1 Markdown, without a markdown library

The rewrite body is markdown: a lede, then a section heading taken from
`OrgSettings.relevanceHeading`, then two to four sentences. The prompt asks for
exactly that and nothing richer.

No markdown renderer is added. `react-markdown` plus its plugin chain is a
substantial dependency and a supply-chain surface (`CLAUDE.md` A03) for a subset
this small, and `dangerouslySetInnerHTML` over model output is precisely the
injection path A05 and LLM05 exist to prevent.

Instead `lib/markdown/blocks.ts` exports a parser that turns the body into data. It
lives there rather than under `lib/rewrite/` because it has no dependency on the rewrite
domain at all: it takes a string. The next feature that has to show model-authored prose
safely should import it rather than write a second one.

```ts
export type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "bullet"; spans: Span[] }
export type Span = { text: string; strong?: boolean; emphasis?: boolean }
```

The component renders those as `<h2>`, `<p>`, `<li>`, `<strong>`, `<em>`. **No
HTML string is ever produced**, so there is nothing to sanitize and no path from
model output to markup. Anything the parser does not recognise stays literal
text, which is the safe failure: an unrendered `##` is ugly, an executed one is a
vulnerability.

Handled: ATX headings `#` to `###`, `-` and `*` bullets, `**strong**`, `*em*`,
`_em_`, blank-line-separated paragraphs. Not handled, and deliberately: links,
images, tables, code, blockquotes, nested lists. The generator does not produce
them, and rule 6 forbids reproducing images at all.

## 6. The screen

`RadarMain` at 780px, narrower than the 980px of the run detail, because this one
is prose and a measure that wide is unreadable. Order down the page:

1. `AppHeader`, then `PageHeading` with eyebrow "Article", the **Link Take title**
   when one exists and the **original title** when it does not, and a back link to
   `/dashboard`.
2. **`AttributionBlock`**, immediately under the heading. Plan rule 5 says
   "directly under the title", and this is that, before any prose.
3. The AI label, when prose is shown: "Análise gerada por AI a partir da fonte
   original", from `OrgSettings` language, as a `Tag`.
4. The warning `Callout`, in `stale` and `refused`.
5. The body: parsed blocks in `ready` and `stale`, the summary in `absent` and
   `refused`.
6. `LinkTakeEvidence`: one quiet line always, the history panel for EDITOR+.
7. The original summary, collapsed behind a disclosure, in `ready` and `stale`
   only, per the plan's "raw summary remains available".

### 6.1 Controls

| Control | Shown when | Calls | Role |
|---|---|---|---|
| "Ver artigo original" | always | link to `attribution.url`, `rel="noopener noreferrer"` | any |
| "Escrever a Análise Link" | `absent` | `GET ?generate=true` | any member |
| "Regenerar" | `ready`, `stale` | `POST` | EDITOR+ |
| "Tentar outra vez" | `refused` | `POST` | EDITOR+ |
| "Histórico" disclosure | always | `PATCH`, lazily on first open | EDITOR+ |

Generation is never automatic on open. The route calls `?generate=false`, so
opening a screen costs nothing and returns immediately. This is the decision
recorded in [`DECISIONS-2026-08-06.md`](../DECISIONS-2026-08-06.md) §2: with the
title now a link from every card, an automatic generate-on-open would let idle
navigation spend the day's budget, and a 120-second wait on a page open is not a
reading experience.

`use-role.ts` returns false while loading, so an editor's controls appear a beat
late rather than flashing for a viewer. The server refuses a request from a role
too low regardless, so nothing here is the only guard.

## 7. Error handling

| Failure | Behaviour |
|---|---|
| 404 from GET | `EmptyState`, "That article is not here", back link. |
| 401 or 403 from GET | `LoadError` naming the refusal. No retry loop. |
| Any other GET failure | `LoadError` with the status, and a retry button. |
| Generate or regenerate returns `success: false` | The reason in a `Callout`, tone `warn`. The screen keeps whatever it already had. |
| Generate returns `generated: false` | Not an error. The `reason` is shown, tone `info`: the checks refused it, and retrying is not the answer. |
| History `PATCH` fails | The disclosure shows the error inline. The rest of the screen is unaffected. |
| Two clicks on a generate button | Disabled while in flight. |

`POST` returning `409` (`status: "skipped"`, cap reached or a prior refusal) is
shown verbatim, because the reason is written for a person: "8 rewrites already
generated today, and the cap for approvals is 8".

## 8. Tests

`tests/unit/rewrite-view.test.ts`, pure, no DOM:

- `resolveLinkTakeState` for every payload combination, including
  `attempted: true` with `rewrite: null` yielding `refused` and not `absent`.
- One test asserting the resolution does **not** read `unavailableReason` to decide, so
  rewording that sentence cannot change the state.

`tests/unit/markdown-blocks.test.ts`, pure, no DOM:

- Heading levels, bullets with either marker, strong and emphasis, a blank-line
  paragraph split, wrapped lines joined, and that an unclosed marker survives as
  literal text rather than being guessed at.
- Given a body containing `<script>`, `<img src=x onerror=...>` and a `javascript:`
  link, the parser produces spans whose text is those characters and no block of any
  other kind. This is the security property stated as a test.

`tests/unit/link-take-view.test.tsx`, with the DOM:

- **The gate**: for each of the four states, the publication name and the source
  URL are present. This is the acceptance test of `_03`.
- `ready` renders the prose and not the summary as the body.
- `absent` renders the summary and offers to write one.
- `refused` renders the reason and does not offer to write one to a viewer.
- `stale` renders the prose and the warning together.
- The regenerate control is absent for a viewer and present for an editor.
- The AI label is present whenever prose is shown, and absent when it is not.

## 9. Traceability

Tags follow the existing convention, `RQ-006_03`, on each new module's header
comment and on the state resolution and the attribution component specifically,
since those are the two the gate rests on.

## 10. Acceptance

1. Opening an article with a passing Link Take shows the prose, the publication
   name, the source URL and the AI label, and spends nothing.
2. Opening an article with no Link Take shows the summary with attribution and a
   button; pressing it generates one and the screen updates without a reload.
3. An article whose generation was refused says so, and does not offer a viewer a
   button that would be refused again.
4. A stale Link Take is readable, is marked as stale, and an editor can regenerate
   it from that warning.
5. No state of the screen renders prose or summary without the publication name
   and the source URL. Proven by test, not by looking.
6. A viewer sees no regenerate control and no history panel.
7. `npx tsc --noEmit` clean, `npx vitest run` green, `npm run build` clean.
