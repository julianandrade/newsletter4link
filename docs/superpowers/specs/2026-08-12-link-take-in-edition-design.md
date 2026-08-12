# Link Take in the edition

Design, 12 August 2026.

## Why

`lib/rewrite/` produces an original 150 to 250 word editorial piece per approved article, in
Portuguese, and then mechanically verifies it: longest-shared-run detection against the source,
digit-token verification, fail-closed with one retry, evidence and full version history persisted on
`ArticleRewrite`. It is the most defensible thing in this codebase.

It reaches no reader. `grep -rn "rewrite\|linkTake" lib/email/` returns nothing. The email sends
`Article.summary`, and the Link Take is visible on exactly one screen,
`app/dashboard/articles/[id]/page.tsx`.

This is not a new feature. It is **surface 3 of RQ-006**, specified and never built. From
`.claude/docs/requirements/RQ-006-link-take/PLAN.md`:

> **Newsletter**: edition builder gains a per-article toggle "usar análise Link" that swaps the
> summary for the rewrite title and body in the email template. Anything using the rewrite in an
> edition goes through the existing human review flow: no rewrite reaches the newsletter unreviewed.

Surfaces 1 (portal detail) and 2 (feed list, unchanged) exist. This builds surface 3.

Background: `docs/BRAINSTORM-2026-08-11-saas-teardown.md` §4, which ranks this the highest-value
change available and the reason is that it needs no new model call and no new cost.

## Rules inherited from RQ-006

These are copyright and trust rules, marked "do not relax" in the plan. Two bind this work:

- **Rule 5.** Source attribution always rendered, publication name plus original URL, visually
  prominent, "both in the portal detail view **and in any newsletter usage**".
- **Rule 7.** The label "Análise gerada por AI a partir da fonte original", or the org-language
  equivalent. `aiLabelFor(language)` in `lib/rewrite/view.ts` already returns it, keyed on the
  rewrite's own `language` rather than the app's, and is reused here rather than duplicated.

Rule 6, never reproduce or hotlink images from the source, is satisfied mechanically here: see §3.

## Decisions

| Question | Decision |
|---|---|
| What the email shows | The take's own headline plus the full body, replacing both the publisher headline and the one-sentence summary. RQ-006's literal wording. |
| How a story is flagged | Per article, per edition, off by default, toggled on the row in the edition builder. |
| Missing or unusable take at send time | Send Readiness blocks, and the send route refuses. No silent fallback to the summary. |
| Where it renders | `lib/email/edition-blocks.ts`, which both render paths already share. |

The third is the one worth defending. A silent fallback would let an editor believe they shipped a
Link Take when they shipped a sentence, and leave nothing in the sent edition recording the
difference. It is the same reasoning as the model-refusal decision in `CLAUDE.md`: a substitution
nobody asked for is worse than a stop.

## 1. Data model

One column:

```prisma
model EditionArticle {
  // ...
  /**
   * Whether this edition renders the article's Link Take instead of its summary.
   *
   * On the join row rather than on Article: the choice is editorial and belongs to this
   * edition. Default false, so every edition that predates this renders unchanged.
   */
  useLinkTake Boolean @default(false)
}
```

Nothing on `Article` or `ArticleRewrite` changes.

**The trap.** `PATCH /api/editions/:id` deletes every join row and recreates what it is given
(recorded in `CLAUDE.md`). The flag needs the treatment `order` already gets in
`lib/editions/add-to-edition.ts`, which reads the current rows and carries them through. A caller
that sends only ids would silently clear every flag. This is a named test, not a note.

## 2. Selecting the take

A take is **usable** when all of:

- `supersededAt` is null
- `status` is `GENERATED`
- `checksPassed` is true
- it is not stale

`readCurrentRewrite` in `lib/rewrite/store.ts` already returns the current row and computes
staleness, so this is a predicate over an existing function, not a new query.

**Where the loading happens.** The predicate lives in one new exported function, and every caller
uses it. There are four places that assemble articles for rendering, and all four must agree or the
preview will disagree with the send:

- `lib/email/sender.ts` and the send route (`app/api/email/send-all`)
- `app/api/email/preview` and `app/api/email/send-test`
- `lib/editions/sent-snapshot.ts` (see §5)
- `app/editions/[id]/page.tsx`, which reads the snapshot and therefore needs no live load

Loaded only for flagged articles, so an edition with nothing flagged issues no extra query.

`SourceArticle` in `lib/email/edition-data.ts` gains:

```ts
linkTake?: { title: string; body: string; language: string } | null;
```

`toEmailArticle` passes it to `EmailArticle`. Absent means today's behaviour, which is what keeps
every existing edition byte-identical.

## 3. Rendering

Two new pieces and one branch in each of two existing functions, reaching the render paths through
the fragments they already share.

**One correction to that claim, found during implementation.** `{{sections}}` does resolve through
`sectionBlock` at `merge-tags.ts:252`, so it inherits the branch for free. `{{articles}}` does not:
`editionMergeValues` never produces it, and it is built instead by `renderArticlesHtml`
(`lib/email/content-renderer.ts:64`) and `renderArticles` (`lib/email/template-renderer.ts:88`),
each from its own local `Article` interface. Those two interfaces have to carry `linkTake`
explicitly or a template built on `{{articles}}` renders the summary for a flagged story, silently.
Both are threaded in §2's wiring, and both merge tags are pinned by tests.

### `linkTakeBodyHtml()` in `lib/email/edition-blocks.ts` (new)

Turns the `Block[]` that `lib/markdown/blocks.ts` already parses into email-safe HTML: paragraphs,
the relevance heading, bullets, `strong` and `em`.

Consuming `lib/markdown/blocks.ts` rather than reimplementing it, because that module is
deliberately renderer-agnostic and the dashboard already renders the same blocks as React.

**In `edition-blocks.ts` rather than a new `markdown-html.ts`.** The first draft of this spec put
it in its own file; that creates a circular import, because the emitter needs `escapeHtml` and the
`SANS`/`SERIF`/`INK` constants, all of which live in `edition-blocks.ts`, which would then import
the emitter back. Breaking the cycle would mean extracting the helpers into a third file to no
benefit. This is a fragment renderer, and `CLAUDE.md` puts fragments here.

**This is where rule 6 is enforced mechanically.** `parseBlocks` does not handle links or images
and leaves an unrecognised construct as literal text, so no anchor and no `img` can be emitted from
model output whatever the prose contains. A prompt asking for no images is a request; this is a
property. A future change that teaches `parseBlocks` about links would silently undo it, so the
test for that case names the reason.

### `linkTakeBlock()` in `lib/email/edition-blocks.ts` (new)

Emits, in order: the take's headline, the body, the attribution block (publication name plus
original URL, rule 5), and `aiLabelFor(language)` (rule 7). Uses the file's existing `SANS`,
`SERIF`, `INK`, `escapeHtml`, `link` and `safeUrl`, so it inherits the Outlook fidelity and
dark-mode rules the rest of the file already carries.

The file is 483 lines and lands around 570 with both additions. If it passes ~600, split the
long-form fragments and their style constants out together rather than letting it grow.

### `topicItem` branch

`item.linkTake` present renders the long form; absent renders today's row unchanged.

### `topStoryBlock` branch

When flagged, drop to the **single-column layout and omit the image**. 200 words in a 380px column
beside a 152px thumbnail is unreadable on a phone, and single-column is what every send produced
before the image feature existed. The `coverage` badge and the "Read the analysis" link stay.

## 4. Refusing to send

Two gates. A UI-only gate is not a gate.

**Send Readiness card**, in the existing grid in `app/dashboard/send/[id]/page.tsx`, titled "Link
Take", reading e.g. *"3 flagged, 1 has none"*. `Blocked` when any flagged story has no usable take,
`Ready` otherwise, including when nothing is flagged. It joins the existing `canSend` and
`sendBlockReason` gating. The card links to the offending story.

**The toggle itself goes in the `renderItem` callback** the send page passes to
`EditionOrderList`, not inside that component. `EditionOrderList` is generic over `{ id: string }`
and its header states that position is the only thing it owns; it never fetches and never decides
what may be added. A flag is not position. The page already renders each row's content through
`renderItem` and already owns persistence through `handleArticleSelectionChange`, so the toggle
has a home that costs the component nothing.

**The send route** recomputes the same predicate server-side and refuses with **409**, naming the
articles. The request is well-formed and nothing broke on our side; the edition is in a state that
forbids sending, which is what 409 says. This mirrors the reasoning behind the 422 chosen for a
refused model.

## 5. The snapshot

`SentSnapshotArticle` in `lib/editions/sent-snapshot.ts` gains the take's title and body.

Without it, `app/editions/[id]` would re-render from the live `ArticleRewrite`, so regenerating a
take after a send would rewrite what subscribers already received. That is the exact defect the
snapshot exists to prevent, and the file's own header comment says so about summaries.

## 6. Testing

Unit, all pure, in `tests/unit/`:

- **`linkTakeBodyHtml`**: paragraphs, heading, bullets, `strong`/`em`; escaping of `<`, `&`,
  quotes; and that an unrecognised construct (a link, an image, a table) survives as literal text
  rather than markup, which is rule 6 as a property.
- **`topicItem`**: both branches, and that the summary branch output is unchanged.
- **`topStoryBlock`**: single-column and no `<img>` when flagged; unchanged when not.
- **Usable-take predicate**: missing, `FAILED`, superseded, stale and usable, one case each.
- **Readiness counting**: none flagged, all usable, one unusable.
- **Carry-through**: a `PATCH` that preserves `order` also preserves `useLinkTake`.

The existing merge-tag parity test extends to assert a flagged article renders its take in **both**
renderers, which is what stops the two paths drifting.

No integration or DB tests: this project has none, and every item above is reachable as a pure
function.

## Out of scope

Deliberately not in this work:

- Any change to when or how takes are generated.
- A per-edition or org-level default, or a bulk "flag all".
- Translating the English chrome. The chrome stays English and the prose stays in
  `OrgSettings.rewriteLanguage`, which is the established split.
- The `coverage` badge. `EmailArticle.coverage` exists and `edition-blocks.ts:367` already renders
  "Covered by N sources", and nothing populates it. That is a separate item, noted in
  `BRAINSTORM-2026-08-11-saas-teardown.md` §3.1A.
