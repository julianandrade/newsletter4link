# Decisions taken while you slept

Night of 5 to 6 August 2026. You picked RQ-006_03, the article detail view, said to
decide alone and write it down for you to review. This is that list.

The design conversation before you went to bed settled five things, and those are
recorded first as decisions you made, not ones I made. Everything after §6 is mine.

Every item says what I chose, why, and what to do if you disagree. Nothing here is
expensive to reverse.

The spec is at
[RQ-006-link-take/RQ-006_03-tech-spec.md](RQ-006-link-take/RQ-006_03-tech-spec.md).

---

## What you decided, before sleeping

1. **One screen, two readings.** A reading page that gains controls and evidence for
   EDITOR and above, rather than a separate editorial console.
2. **Generation only on request.** The screen reads with `?generate=false` and offers a
   button. Nobody spends the day's budget by navigating.
3. **The article title is the way in**, from the queue and the proposal cards.
4. **Evidence always, history for EDITOR+.**
5. **A stale Link Take is shown with a warning**, not hidden.
6. **Client page plus a pure presentational component**, so the screen stays verifiable
   in the preview harness without a Supabase session.

---

## 7. The UI is in English, and the AI label is not

**Chosen:** every control and every sentence of chrome in English, matching the rest of
the dashboard. The one exception is the AI-generated label, which follows the language
of the **prose** it labels: `aiLabelFor(rewrite.language)` returns
"Análise gerada por AI a partir da fonte original" for a pt-\* rewrite and an English
equivalent otherwise.

**Why:** I checked before choosing. Accented Portuguese appears in exactly four files in
the repository and in all four it is sample data, never chrome: every screen says
"Kept", "Found", "Show the full summary", "Back to the run history". The plan's rule 7
gives the Portuguese wording for the label, and also says "or org-language equivalent",
so the two are reconcilable: the label is not chrome, it labels a piece of Portuguese
prose sitting directly under it, and `OrgSettings.rewriteLanguage` defaults to `pt-PT`.

**To change it:** `aiLabelFor` in `lib/rewrite/view.ts` is four lines. If the whole
dashboard ever goes Portuguese, that is a separate job and this label already speaks it.

## 8. One field added to the `_01` API rather than string-matching in the UI

**Chosen:** `attempted: boolean` on the `GET /api/articles/[id]/rewrite` payload.

**Why:** the payload could not tell "nothing was ever written" from "something was
written and the checks refused it". Both arrive as `rewrite: null`, and the only thing
separating them was whether `unavailableReason` happened to equal the literal sentence
"No Link Take has been written for this article yet.". A screen that branched on that
would have broken the first time anybody reworded the sentence, and broken silently, by
offering a viewer a "write one" button for a piece that had already been refused. There
is a test that fails if the resolution ever starts reading the reason.

**Cost:** a field on a response `_01` owns. Nothing else in that route changed. I did
**not** add `lastAttempt` details, because the history endpoint already returns all of
them and two ways to read the same rows is two answers to one question.

## 9. No markdown library, and no `dangerouslySetInnerHTML`

**Chosen:** a block parser in `lib/rewrite/view.ts` that turns the rewrite body into
data (`heading`, `paragraph`, `bullet`, with `strong`/`emphasis` spans), rendered as
React elements.

**Why:** two reasons, and the second is the real one. `react-markdown` plus its plugin
chain is a large dependency and a supply-chain surface (CLAUDE.md A03) for a body whose
whole grammar is "a lede, a heading, two to four sentences". And the alternative,
handing model output to `dangerouslySetInnerHTML`, is exactly the path A05 and LLM05
exist to close. The parser never produces markup, so there is nothing to sanitize and no
sanitizer to forget: every character leaves as the text of a span. There is a test that
feeds it `<script>`, an `onerror` attribute and a `javascript:` link and asserts they
come out as literal text.

**Limits, stated so nobody assumes otherwise:** links, images, tables, code and
blockquotes are not rendered. The generator does not produce them, and rule 6 forbids
reproducing images at all. An unrecognised construct stays visible as literal text,
which is the safe failure: an unrendered `##` is ugly, an executed one is a hole.

**To change it:** if the prose ever needs links, the parser gains one block kind and one
test. That is still cheaper than the dependency.

## 10. The publication name became the link to the publication

**Chosen:** the article title now opens `/dashboard/articles/[id]`, and the **source
stamp** on every card opens the publisher. One shared pair of components,
`ArticleTitleLink` and `SourceStampLink`, used by the cards, the rows, the table and the
proposal.

**Why:** the title was already a link, to the publisher. Repointing it without a
replacement would have removed the one-click route to the source from four screens,
which is a loss and not one you asked for. Splitting the two destinations costs no new
element and no clutter: the headline goes to our page about the story, the publication
name goes to the story. In the table view, the "Source" column became the link for the
same reason.

**Reverse it by:** pointing `ArticleTitleLink` at `sourceUrl`. It is one file.

## 11. The daily-cap counter does not do what its comment says, and I left it alone

**Not a decision so much as a finding, recorded because it is a real defect and it is
not mine to fix in `_03`.**

`withinDailyCap` in `lib/rewrite/store.ts` claims the two triggers are "counted
separately and against different caps". They are not. The count is
`db.articleRewrite.count({ where: { generatedAt: { gte: since } } })` with no filter on
trigger, because `ArticleRewrite` has no column recording which trigger produced a row.
So there is one shared counter of every rewrite written today, compared against 8 for
approvals and 40 for reads. A busy approval day eats the reading budget, and eight
approvals plus thirty-three reads locks out the thirty-fourth reader.

**Why I left it:** fixing it means a schema change and a migration on a table `_01`
owns, and the effect today is small: `EAGER_DAILY_CAP` is 8, so approvals can consume at
most 8 of the 40. Worth doing, worth doing deliberately.

**To fix it:** add `trigger` to `ArticleRewrite`, write it in `saveRewrite`, filter on it
in `withinDailyCap`. Existing rows get a default and the counter is honest from then on.

## 12. Two things I changed because the screenshots showed them

Both found by looking, not by testing, which is the argument for the harness.

- **A button's label no longer changes while it works.** I had "Write the Link Take"
  become "Writing" on click, which swaps the accessible name of a control mid-action and
  loses it for anyone navigating by name. The label is now stable, with `aria-busy` and
  `disabled` carrying the state.
- **The refusal reason is its own paragraph.** I had appended a sentence to it, and the
  stored reasons do not all end in punctuation, so the screen read "not in the source:
  27, 2028 The summary below is what the feed published."

## 13. A review round after it worked, and what it moved

The project's flow mandates `/simplify` on changed code before the commit, so I ran it:
four independent reviewers over the diff, one each for reuse, simplification, efficiency
and depth. Eight findings applied, four declined. All 684 tests still pass and the
screens are pixel-identical, which is what a refactor should look like.

**Applied, and the three worth knowing:**

- **Three things went into the shared vocabulary**, because they were not mine to keep
  local. `RadarDisclosure` in `controls.tsx` (the `<details>` shell was already
  copy-pasted twice inside this one change), `ExternalLink` in `primitives.tsx` (so
  `rel="noopener noreferrer"`, a security attribute, has one owner instead of being
  hand-typed in four places), and `SourceStamp` now takes an optional `href` instead of
  my wrapping it in a second component. That last one matters: two names for one widget
  would have meant every future screen guessing which to reach for.
- **The markdown parser moved out of `lib/rewrite/`** to `lib/markdown/blocks.ts`. It
  takes a string and has no dependency on the rewrite domain, so filing it under one
  feature would have sent the next feature that needs it either to a misleading import
  path or to writing a second copy. Its tests moved with it.
- **`shortDate` went to `lib/radar/source.ts`** beside `relativeTime`. Worth knowing why
  it is only half a fix: eight other files carry their own copy of the same
  `{ day, month, year }` options object. Converging them is a real cleanup and it is not
  this requirement's job, but there is now one place for them to converge on.

Smaller: the regenerate button had three near-identical definitions and now has one with
a label parameter; the three loading/missing/failed branches in the route shared a frame
that is now one `Shell`; the bullet accumulator was typed as the whole block union, which
forced a narrowing check whose false branch could never run; and the two requests after a
regeneration now run together rather than one after the other, since neither depends on
the other's answer.

**Declined, with the reason:**

- **`useMemo` around the body parse.** The reviewer that raised it also measured it: a
  300-word body, a single linear pass, and re-renders driven by clicks rather than
  keystrokes. The dependency-array bookkeeping would cost about what the parse costs.
- **A `lastIndex` reset on the shared regex.** I had written one defensively. The
  reviewer checked the actual semantics: `matchAll` clones the regex and advances the
  clone, so the reset was dead code. Removed, and replaced with a comment saying why it
  is safe and what would break the guarantee.
- **Consolidating a link class string with `app/dashboard/search/panels.tsx`.** The
  string matches character for character, but that screen links search results, which
  are not necessarily `Article` records, so sharing the component would be sharing a
  coincidence.
- **Rewriting the eight pre-existing `shortDate` copies.** Outside this diff.

## 14. No guard on a missing route param

**Chosen:** `app/dashboard/articles/[id]/page.tsx` does not check whether `params.id`
exists before fetching.

**Why:** in an App Router `[id]` route the param is always there, so the guard protects
against nothing, and it broke the preview harness outright: the harness renders page
components at `/radar-preview`, which has no route params, so an early return left the
screen loading forever. `send/[id]` already does the same thing for the same reason. I
found this by opening the screen, which is the point of opening the screen.

---

## What is verified, and how

| | |
|---|---|
| The gate: publication and source URL in all four states, for both roles | 8 assertions in `tests/unit/link-take-view.test.tsx` |
| `absent` never mistaken for `refused` | 7 tests on `resolveLinkTakeState` |
| The parser produces no markup from hostile input | 2 tests, `<script>`, `onerror`, `javascript:` |
| Every state on screen | Harness fixtures at `?screen=article`, `article-stale`, `article-absent`, `article-refused` |
| The history path, end to end | Clicked in the browser: `PATCH` fired once, both versions rendered, the refused one with its reason |
| The queue, the proposal and the table after the shared-vocabulary change | All seven table rows: the story column goes to `/dashboard/articles/<id>`, the source column to the publisher |
| Nothing regressed | **684 unit tests**, up from 635. `tsc --noEmit` clean, `next build` clean, screens pixel-identical before and after the refactor |

## What I did not do

- **RQ-006_04**, the newsletter usage. Untouched. It is the next one, and the review's
  reconciliation with RQ-005 (an organization-level default plus a per-article override)
  is still the right shape.
- **The Resend key.** Still 401, still yours: create a full-access key in Resend and set
  `RESEND_API_KEY` in the Vercel production scope. When I checked at the start of the
  night there were **42** inbound emails, not 39: three arrived since your note and sit
  at `retryCount: 0`. The other 39 are at 1, so two more daily runs mark them `FAILED`.
- **The `trigger` column** from §11.
