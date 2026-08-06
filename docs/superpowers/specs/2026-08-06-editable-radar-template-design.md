# An editable AI Radar Weekly, and a masthead that tells the truth

> Design, 6 August 2026. Supersedes nothing. Follows the RQ-008 edition identity work.

## Why

Three things arrived at once and they turn out to be the same piece of work.

**The built-in template cannot be edited.** `AI Radar Weekly` is code, `renderEditionEmail`
in `lib/email/edition-template.ts`. RQ-003 gave it a real row in the Templates screen with
real active/default semantics, but the screen still tells the reader
"Ships with the app. Adapts to the content, so it cannot be edited visually."
(`app/dashboard/templates/page.tsx:245`). Every other template has an Edit button and this
one does not.

**The masthead prints the year twice.** `lib/email/edition-data.ts:230-231` reads

```ts
editionLabel: input.label ?? `Week ${input.week}`,
dateLabel:    input.dateLabel ?? String(input.year),
```

Callers pass `label: editionLabel(edition)`, which for an unnamed edition returns
`weekLabel(week, year)` = `"Week 31 · 2026"` (`lib/radar/week.ts:77`). No caller anywhere
passes `dateLabel`, so it always falls back to `String(year)`. The masthead
(`edition-template.ts:447-449`) concatenates the two:

> `WEEK 31 · 2026 · 2026`

The plain-text part repeats it (`edition-template.ts:522`).

**The masthead also breaks on a named edition.** Rendered at 320px with the title
`"AI Act special edition"`, the label wraps to two lines, grows the masthead and knocks the
`AI RADAR.` wordmark out of alignment. A named edition is exactly what RQ-008 just made
possible, and the masthead is the first thing that gives.

Both masthead problems are that one pair of lines. The editability question is what decides
where the fix has to live, because the fix has to hold in three renderers instead of one.

## What ships

Three templates coexist in the list. The current one is not replaced.

| | Name in the UI | Renders via | The editor controls |
|---|---|---|---|
| v1 | `AI Radar Weekly` | code, `renderEditionEmail` | nothing; it is the reference |
| v2 | `AI Radar Weekly - editable frame` | designJson, coarse merge tags | masthead, copy, CTA, footer, block order |
| v3 | `AI Radar Weekly - Unlayer` | designJson throughout, plus hardening | everything except what repeats |

v2 and v3 are rows in `EmailTemplate` with `designJson`, seeded the way the six existing
templates already are. v1 stays the derived entry `builtin-template.ts` produces. No schema
change, and the `isActive` / `isDefault` derivation keeps working untouched.

v1 is not frozen. The masthead fixes and the four UI/UX items land in the shared code it
renders from, and reach v2 and v3 through the merge tags. "The current one is not replaced"
means it keeps rendering from code, not that it keeps its bugs.

v2's frame is hand-built and hands Unlayer four coarse tags: `{{top_story}}`, `{{sections}}`,
`{{trend_radar}}` and `{{internal}}`. v3 uses the same four, plus the frame itself becomes
rows, so `{{tldr}}`, `{{edition_label}}` and `{{date_range}}` land in text blocks the editor
owns.

## The floor nobody can move

Unlayer's design JSON has no repeat construct. Anything that appears N times cannot be a
row, in v2 or in v3:

- articles inside a topic section
- the topic sections themselves, which come from `article.category` at runtime, so not even
  a row per known topic can be pre-seeded
- the rows of the trend radar

Those stay merge tags in both. v2 and v3 therefore differ in **granularity, not in kind**:
v2 hands Unlayer a hand-built frame with four coarse tags, v3 reconstructs every visual
element of that frame as rows and leaves only the repeating lists as tags.

Saying this plainly up front matters, because "full conversion to designJson" sounds like it
removes merge tags and it does not.

## Units

Five files, each with one job, each testable alone.

### 1. `lib/email/merge-tags.ts` (new)

The single tag table. Client-safe: no Prisma, no `crypto`, because
`content-renderer.ts` is imported by client components and this inherits that constraint.

```
RADAR_MERGE_TAGS          the table: name, human label, how to sample it
renderMergeTags(html, values)     one regex, built from the table
unlayerMergeTagOptions(values)    the shape options.mergeTags wants
```

This exists because two renderers have already drifted:

| | `content-renderer.ts:94` (browser) | `template-renderer.ts:188` (server, this is what sends) |
|---|---|---|
| accepts | `articles projects week year unsubscribe_url` | `articles projects week year articleCount projectCount unsubscribe_url` |

`{{articleCount}}` works in a real send and renders as literal text in the browser preview.
That is today, with five tags. v2 and v3 need eight more, so two hand-maintained lists stop
being a risk and become a certainty. Both renderers and both editor components
(`template-editor.tsx:45`, `edition-unlayer-editor.tsx:94`, which each hardcode their own
`mergeTags` object) import from here instead.

Vocabulary after this change: the seven above plus `edition_label`, `date_range`, `tldr`,
`top_story`, `sections`, `trend_radar`, `internal`, `archive_url` (the permalink for this
edition) and `portal_url` (the index, which is what the accent CTA promises).

`archive_url`, `portal_url` and `unsubscribe_url` are **per recipient**: their values carry a
signature bound to one subscriber. The table marks them as such, because the substitution
step has to know which values may be computed once for a send and which may not. See
"Per-recipient substitution" below, which is where that currently goes wrong.

### 2. `lib/email/edition-blocks.ts` (new)

The fragment renderers currently private inside `edition-template.ts` become exported:
`bulletRow`, `topicItem`, `sectionBlock`, `trendRow`, `trendBlock`, `topStoryBlock`,
`internalBlock`.

This is what makes `{{trend_radar}}` produce byte-for-byte the HTML v1 produces. Without it
v2 and v3 look like a different product, which is precisely the failure the header comment
on `content-renderer.ts` says that module exists to prevent. It also takes
`edition-template.ts` from 631 lines to roughly 400, against the ~500 LOC guidance in
`CLAUDE.md`.

The extraction must not change v1's output. A snapshot test taken before it and asserted
after it is the proof.

### 3. `lib/email/harden-export.ts` (new)

The post-export pass. A pure string function, no DOM, no dependencies. Three transforms and
one entry point that runs them in order:

- `injectDarkMode(html)` inserts the `<style>` block, the
  `@media (prefers-color-scheme: dark)` rules and the `[data-ogsc]` mirror for Outlook.com,
  before `</head>`. Idempotent, guarded on a marker comment.
- `wrapMsoLogo(html)` wraps the `<img>` carrying `logo-dark` in
  `<!--[if !mso]><!-->` … `<!--<![endif]-->`. Unlayer will not emit a conditional comment,
  but the class is ours, seeded through `_meta.htmlClassNames`, so the match is
  deterministic.
- `dropEmptyOptionalRows(html)` removes any element carrying `radar-optional` whose
  content, after substitution, is empty.

`hardenExportedHtml(html)` runs the three. It runs **after** merge-tag substitution, because
the third needs to know what came out empty.

Called from both paths: server-side in `template-renderer.ts` (`renderTemplate`, which is
what `send-all/route.ts:417` reaches through `renderTemplateById`) and client-side in
`content-renderer.ts` (the in-browser preview). The same function in both, so the preview
cannot disagree with the send. Idempotence means running it twice is safe.

**This is the risky file and the risk should be named.** `dropEmptyOptionalRows` operates on
raw HTML, and an Unlayer row is nested tables. A regex will not do it; it needs a small
scanner that finds the element carrying the class and counts opens against closes until it
balances. It is not much code, but it is the one piece here whose bug leaves by email and
cannot be recalled. It gets the most tests, and they run against markup Unlayer actually
exported, not against hand-written toy HTML.

The dark-mode class hooks the injected CSS needs (`card`, `tint`, `t-body`, `t-strong`,
`t-muted`, `rule`, `badge`, `trend-figure`, `link-strong`, `logo-light`, `logo-dark`,
`body-bg`, `px`, `stack`, `thumb`, `h1`, `h2`, `cta`) are seeded onto rows, columns and
content blocks through `_meta.htmlClassNames`, which the existing seed script already writes
(`scripts/create-unlayer-templates.ts:88`). A row the editor adds later carries no hook and
simply gets no dark-mode treatment. That is degradation, not breakage, and it is the correct
trade for letting the editor add rows at all.

### 4. `lib/radar/week.ts` (existing, one function added)

```
weekRangeLabel(week, year)
```

Built on `isoWeekStart` and `isoWeekEnd`, which are already there
(`lib/radar/week.ts:63-73`) and already UTC. Output:

- `4-10 Aug` inside one month
- `29 Sep - 5 Oct` across a month
- `29 Dec - 4 Jan 2027` across a year, where the trailing year is the one the range ends in

### 5. `scripts/templates/radar-frame.ts` and `scripts/templates/radar-unlayer.ts` (new)

The two designJson builders, imported by `create-unlayer-templates.ts`, which follows its
existing update-if-exists / create-if-absent branch per organization. They are separate
files because that script is already 1700 lines.

## The masthead

The duplicated year has two exits. This design takes the second.

```
today   WEEK 31 · 2026 · 2026
(a)     WEEK 31 · 2026 · 4-10 AUG     label keeps the year, range is appended
(b)     WEEK 31 · 4-10 AUG 2026       the year belongs to the date, not the name
```

**(b).** A named edition then reads `AI ACT SPECIAL EDITION · 4-10 AUG 2026`, which is what
anyone would want to read. It needs a new `editionEmailLabel(edition)` returning the title,
or `Week N` with no year, and leaves `editionLabel(edition)` alone for the forty-odd screens
and routes that depend on its current shape.

**The seam to watch.** `edition-data.ts:171-177` decides the subject line by comparing
`label === "Week ${week} · ${year}"`. Change the email label's shape without changing that
comparison and an unnamed edition's subject silently becomes `AI Radar - Week 31` instead of
`AI Radar Weekly - Week 31, 2026`. It is the kind of boundary the RQ-005 loop notes warn
about, so it gets a test of its own rather than a careful read.

**Long names.** Inside `@media only screen and (max-width: 620px)` the masthead's right cell
becomes `display:block; width:100%; text-align:left`, so the logo and the label stack beneath
the wordmark rather than competing for 130px with it.

## Per-recipient substitution, which does not currently happen

Found while checking whether a signed archive link could even reach a subscriber. It cannot,
and neither does the signed unsubscribe link on most paths.

`sendNewsletterWithTemplate` (`app/api/email/send-all/route.ts:613-627`) sends the **same
`templateHtml` string to every subscriber**. There is no per-recipient substitution anywhere
in that loop. And `renderTemplateById` is called once, at line 417, with the `emailData`
assembled at lines 322-388, which has no `subscriberId`. So `renderTemplate`
(`template-renderer.ts:182`) evaluates `buildUnsubscribeUrl(undefined)` and yields the
generic `/unsubscribe` page.

The built-in path does the same thing whenever it is not the plain case: line 723 calls
`renderNewsletterEmail(data as any)` with no `subscriberId` and hands the result to the same
sender. Only `sendNewsletterToAll` at line 719, reached when there is no subscriber filter
and no provider override, renders per subscriber.

So on three of the four send paths every recipient receives the generic unsubscribe link
rather than their own signed one. The HMAC machinery in `unsubscribe-token.ts` is correct and
is being bypassed.

This is a prerequisite rather than a discovery to file away, because the archive link is
per-recipient in exactly the same way. The fix is one change in one place: the per-recipient
values are substituted **inside** the batch loop, against a template rendered once for
everything that is shared. Concretely:

1. `renderTemplateById` / `renderNewsletterEmail` produce the HTML with the shared tags
   resolved and the per-recipient tags left standing as `{{unsubscribe_url}}`,
   `{{archive_url}}`, `{{portal_url}}`.
2. Inside the loop, per subscriber, those three are substituted and then
   `hardenExportedHtml` runs.
3. `sendNewsletterWithTemplate` stops taking a finished string and starts taking the
   partially-resolved one plus the subscriber, which is the only signature change needed.

Ordering note: `hardenExportedHtml` must run after step 2, not before, or
`dropEmptyOptionalRows` will judge emptiness against markup that still contains unresolved
tags.

This also fixes the unsubscribe link on the three broken paths as a side effect, which is
worth stating out loud so it does not look like an unrelated change riding along.

## The public archive, and the CTA that needed it

`portalUrl` is `${appUrl}/dashboard`, and `middleware.ts:93-104` protects `/dashboard` with
a Supabase session, then a domain allowlist, then MFA. The email's only accent CTA,
"Read the full feed", sends every reader into a login wall with a second factor. For a
subscriber who reads the newsletter and does not administer the app it is a dead end.

### Not public: signed per subscriber

The project already signs unsubscribe links with HMAC
(`lib/email/unsubscribe-token.ts`). The same mechanism gives a signed archive link. The page
is then not public at all, it is reachable by whoever received the email, which for an
internal newsletter citing paid sources is the right level of trust. No login, no MFA, no
decision about what to cut, nothing to index.

Two routes:

```
/editions            the index of editions this subscriber received
/editions/<id>       one edition, complete, internal projects included
```

Both added to the `publicPaths` allowlist in `middleware.ts:27-32`, with a comment in the
voice that file already uses: being listed there means the signature is the whole
authorization.

### Purpose-scoped tokens, and why the existing one cannot simply be reused

`generateUnsubscribeToken` signs the bare `subscriberId`. Reusing that same token for the
archive would mean an unsubscribe link opens the archive and an archive link unsubscribes,
which is token confusion: a link leaked in one context grants the other.

So `unsubscribe-token.ts` generalizes into a purpose-scoped signer, with one hard constraint:

- the `unsubscribe` purpose keeps signing the bare `subscriberId`, forever. Emails already
  delivered carry tokens of that shape, and an unsubscribe link that stops working is a
  compliance problem, not a bug.
- new purposes sign `${purpose}:${subscriberId}`.

`archive` is the first new purpose.

### What the page checks

A valid signature identifies a subscriber. The page then verifies that this subscriber
actually received this edition:

```
emailEvent.findFirst({ where: { subscriberId, editionId, eventType: "SENT" } })
```

That record is real, not hoped for: the Resend webhook already looks one up by messageId
(`app/api/webhooks/resend/route.ts:103-109`). A missing or invalid signature, or an edition
this subscriber never received, answers 404 with no distinction between the two, so the
response leaks nothing about which editions exist.

`robots: noindex` on both routes. There is nothing to index and saying so costs one line.

### Where the email points

- `View in browser` at the top, linking the permalink for this edition. A standard
  affordance the template does not currently have.
- the accent CTA at the end, linking the index, which is what "Read the full feed" promises.

Each link then does what its text says.

## The rest of the UI/UX pass

**TL;DR bullets.** `edition-data.ts:217` sets `anchor: article.sourceUrl`. The field is
called `anchor`, the anchors (`#top-story`, `topic-*`) exist, and nothing uses them. The
value is right and the name is wrong: in-email anchors are unreliable, Gmail strips `id`, so
pointing at the article is the correct behaviour. Rename the field to `url` and stop the
interface from claiming otherwise. No jump nav; that stays unbuilt until someone confirms
client support.

**The top story image.** `edition-template.ts:262` has a two-column branch with a thumbnail
and `buildEditionEmail` never sets `topStoryImage`, so the strongest layout in the design has
never appeared in a real send. `Article` has no image column at all
(`prisma/schema.prisma:248-288`; `Project` has one at line 308, `Article` does not).

Scraping `og:image` during collection is the wrong answer while
`/api/curation/collect` already times out on Vercel. The right one is cheaper: RSS items
usually carry the image themselves, in `<media:content>` or `<enclosure>`, so a new
`Article.imageUrl` can be populated from data the feed already delivered, with no extra HTTP
request. This lands as the last task, isolated, so it can be dropped without blocking
anything else.

## Testing

Vitest. Almost everything here is a pure function, so this is coverable without touching
Supabase.

- `weekRangeLabel`: within a month, across a month, across a year, week 1, week 53
- `renderMergeTags`: an unknown tag stays literal; content containing `{{projects}}` is not
  re-substituted (`content-renderer.ts:82-83` guarantees this today and the test has to
  preserve it)
- **the two tag lists cannot diverge**: one test asserting server and browser accept the same
  set, derived from the table rather than restated
- `hardenExportedHtml`: idempotent under a second run; `dropEmptyOptionalRows` against real
  Unlayer export with nested rows
- `isWeekLabel` against the new label shape: an unnamed edition's subject does not change
- v1 snapshot before and after the fragment extraction, byte for byte
- archive tokens: an `unsubscribe` token does not open the archive, an `archive` token does
  not unsubscribe, a legacy unsubscribe token signed over the bare id still verifies
- archive page: valid signature plus no `SENT` record answers 404, same as an invalid
  signature
- per-recipient substitution: two subscribers in one batch receive HTML differing in their
  unsubscribe and archive links and in nothing else. This is the test that would have caught
  the current bug, so it is written to fail against today's code first.

`tests/unit/edition-email.test.ts` is already 500 lines and its assertions on `editionLabel`
and `dateLabel` (lines 434-502) have to change. That is the design landing, not a regression.

## Risks

1. **`dropEmptyOptionalRows` on nested markup.** Mitigated by a balanced scanner rather than
   a regex, and by testing against real export. Highest-consequence unit here.
2. **v3 fidelity is partly unknown.** Building the designJson will reveal one or two things
   in the design that do not express as Unlayer rows: the 64px accent rule, the inline
   badges. Those become `html` blocks inside a row, editable as HTML but without the visual
   controls. The list gets written down when it is known, rather than promised now.
3. **`Article.imageUrl` is a migration.** Isolated to the last task for exactly that reason.
4. **The send loop gets touched.** Per-recipient substitution changes the hottest path in the
   product, the one that talks to Resend in batches. It was not in the original ask; it is
   here because the archive link cannot work without it and because the unsubscribe link is
   already wrong. It is the second-highest-consequence unit after
   `dropEmptyOptionalRows`, and it is the reason the two-subscribers-differ test is written
   to fail first.
5. **Another session is active** in `app/api/articles/[id]/route.ts`, `lib/db/tenant.ts` and
   `tests/unit/tenant-scoping.test.ts`. None are touched here. Noted in passing:
   `send-all/route.ts:406` and `template-renderer.ts:198` both do
   `findFirst({ where: { isActive: true } })` with no `organizationId`, which looks like
   their lane, not this one.

## Out of scope

- The trend radar's `delta > 0` filter (`edition-data.ts:154`), which means the radar only
  ever reports what rose. A topic that fell 40% is arguably news. Left alone deliberately:
  changing what the radar counts is an editorial decision, not a template one.
- Reading time or story count in the masthead. Cheap, but nobody asked and the masthead is
  already the crowded part of this design.
- Any change to how curation scores or groups articles.
