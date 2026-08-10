# Where we are, and how to pick this up

Written 6 August 2026, updated 10 August. Production is deployed and healthy and
nothing is left running, but **the 10 August work below is uncommitted and needs one
manual step from Julian** before it does anything.

---

## The scheduled jobs, and the closing slot's tab

**10 August 2026. Uncommitted. `tsc` clean, 1345 unit tests passing.**

### The crons were running the whole time

Julian asked why the curation jobs were not running twice a day. They were running,
once a day, which is the most this account can do. The evidence, from the production
database rather than from logs:

- `radar-collect` fired every day: 05:19, 05:27, 05:43, 05:29 UTC on 6 to 9 August.
- `daily-collection` stamped all 15 active RSS sources at **9 August 08:47 UTC** and
  produced 45 articles that day.

**Do not use Vercel runtime logs to answer this question.** Hobby retains them for one
hour, so a query over three days returns nothing and reads exactly like a job that never
fired. It is not evidence of anything. Use `RSSSource.lastFetchedAt` and
`SignalPoint.collectedAt`, which are real per-run heartbeats.

**Do not use `CurationJob` to answer it either, before this change.** The cron called
`runCurationPipeline`, which never wrote a row; only the dashboard's streaming path did.
That is the whole reason this looked broken: `/dashboard/curation` had shown nothing since
7 August while the job worked every morning.

### What changed

**1. `daily-collection` now writes a `CurationJob` row per organization**, opened before
the work and closed after it, with the trigger recorded in the job's own log. Errors go on
the job as log entries, not only to the platform log that is gone within the hour.

Deliberately **not** guarded by `getCurrentJob()`: that lock is global rather than
per-organization, so a manual run left mid-flight would make the scheduled run skip every
organization silently, which is the exact failure this is fixing. Running twice only
inflates the duplicate count.

**2. `.github/workflows/curation.yml` adds the second daily firing**, because a
sub-daily expression in `vercel.json` fails the build on Hobby. Vercel keeps the morning
(05:30 ingest, 09:00 collection), the workflow takes the evening (17:07 ingest, 21:07
collection). Offset rather than doubled up, so a failure in one half of the day leaves the
other half to catch the work. It has a `workflow_dispatch` button, so "is this actually
working" is answerable in thirty seconds without holding the secret locally.

**3. The closing block is now a third tab** beside `Articles (n)` and `Projects (n)` in
the edition builder, rather than a panel above the readiness checklist. Same
icon-label-count shape. Its count is 0 or 1, because the edition points at one row or
none. It is still absent from Send Readiness on purpose: an edition with no closing block
is a complete edition and sends without one.

Consequence worth knowing: like the other two tabs, it is not reachable in Unlayer
**Edit Layout** mode. That is the existing behaviour of this screen, not a new limitation,
but the closing block is a merge tag and does render in a template built there.

### The one step nobody else can take

**Add `CRON_SECRET` as a GitHub Actions secret** on `julianandrade/newsletter4link`,
under Settings > Secrets and variables > Actions, with the same value the Vercel project
holds. The workflow fails loudly with a named error if it is missing rather than running
unauthenticated. Until that exists and the branch is pushed, the evening firings do not
happen and nothing else changes.

Scheduled workflows only run on the default branch, so this needs to reach `master`.

### Not verified end to end

The job-row lifecycle was exercised against the real schema and confirmed to land at the
top of the dashboard's list query, but **the full cron route has not run with the new code
in production** — that costs a real curation pass and model credits, and it needs the
deploy first. The GitHub Actions workflow has never fired, for the same reason. The curl
invocation it uses was tested against the production alias and correctly reported `401`
with the body intact on a bad secret.

---

## The closing slot is done and closed

**Done 8 August 2026, deployed as `aa53808` and verified READY on the production alias**
rather than assumed. 12 commits. **1345 unit tests, `tsc` clean, `next build` clean.**

Every edition can now close on a joke, a signed editor's note, or an internal spotlight,
with an optional image or GIF. Spec in
[docs/superpowers/specs/2026-08-08-one-more-thing-design.md](../../../docs/superpowers/specs/2026-08-08-one-more-thing-design.md),
plan in [docs/superpowers/plans/2026-08-08-one-more-thing.md](../../../docs/superpowers/plans/2026-08-08-one-more-thing.md),
and every decision taken without Julian in
[docs/DECISIONS-2026-08-08-one-more-thing.md](../../../docs/DECISIONS-2026-08-08-one-more-thing.md).
This supersedes §4 of `docs/IDEAS-2026-08-07-what-to-build-next.md`, which recommended text
only and against images. Julian reversed that, and the upload hardening below is the price.

**The library holds 24 approved lines**, 12 per organization, approved in bulk on
9 August by `scripts/approve-asides.ts --apply`. They were written by a model and carry
`source: MODEL` permanently. Approving makes them offerable; it sends nothing, because an
editor still picks one per edition and sends by hand.

### Three defects found in shipped code on the way through

**1. The media upload trusted the client's MIME type, on a public bucket.**
`app/api/media/upload/route.ts` validated `file.type`, which comes from the browser's
multipart header, and then handed that same string to Supabase as the stored object's
content type. `evil.svg` renamed to `meme.png` and declared `image/png` passed both checks
and came back as script from a domain the product owns. `lib/media/sniff.ts` reads magic
bytes now; PNG, JPEG and GIF only. SVG carries script, and Outlook on Windows does not
render WebP.

**2. `RenderContext` in `template-renderer.ts` dropped the new field.** A send uses the
active stored template when there is one, and two are seeded and editable, so the block
would have rendered in the built-in edition and in nothing an editor had actually built.
Every test would have stayed green. The typechecker caught it, not the suite.

**3. The tenant contract test skips a model it cannot find.** Adding `"aside"` to `MODELS`
and forgetting the wrapper added zero tests and the suite still reported green. There is now
an assertion per model that it is wrapped at all.

### Two things with no end-to-end evidence

- **`/api/asides/suggest` has never been called against the real model.** Typechecked,
  built, prompt and parser unit tested, round trip unproven.
- **No test send carried an image**, because the library has no image in it. The image path
  is unit tested and rendered in a browser, not confirmed in Outlook. Send yourself a test
  before an edition carries a meme.

Two real emails were delivered and accepted by Resend, to
`julian.andrade@linkconsulting.com` and `jgrandrade@gmail.com`.
`scripts/send-aside-test.test.ts` repeats that on demand; it skips unless
`SEND_REAL_EMAIL=1`, so the suite never mails anybody.

Read this file, then
[DECISIONS-2026-08-06.md](DECISIONS-2026-08-06.md) for the calls made overnight without
you, and [ROADMAP.md](ROADMAP.md) for the longer view.

---

## The edition template is editable, and here is what is still open

**Done 7 August 2026, overnight.** 25 commits, deployed as `25ac54f`, production verified as
serving the new build. 1080 unit tests, `tsc` clean, `next build` clean.

Full record in [docs/DECISIONS-2026-08-07-editable-template.md](../../../docs/DECISIONS-2026-08-07-editable-template.md),
the plan in [docs/superpowers/plans/2026-08-06-editable-radar-template.md](../../../docs/superpowers/plans/2026-08-06-editable-radar-template.md),
and what to build next in [docs/IDEAS-2026-08-07-what-to-build-next.md](../../../docs/IDEAS-2026-08-07-what-to-build-next.md).

**What shipped.** Two editable copies of the built-in edition, seeded for both organizations:
`AI Radar Weekly - editable frame` and `- Unlayer`. The masthead prints the year once and carries
the week's date range. A named edition no longer breaks it at 320px. Six merge-tag lists became
one table. The two-column top story renders for the first time, from the image the feed already
sent. A signed per-subscriber archive at `/editions`. Nine real emails to
julian.andrade@linkconsulting.com, all delivered, all three templates, Outlook and the Unlayer
editor both checked by Julian.

### Open, in the order I would take them

**1. The tracking webhook does not arrive.** Resend reports all nine sends delivered and clicked.
`EmailEvent` holds only the nine `SENT` rows written by the send itself: no `DELIVERED`, `OPENED`
or `CLICKED`. So the pipeline works up to the point where Resend calls us and stops there. Check
the webhook URL configured on Resend's side and whether `RESEND_WEBHOOK_SECRET` matches, because
`lib/webhooks/verify.ts` fails closed. Until this is fixed every engagement number on the
Analytics screen is unmeasurable, which makes it the thing blocking the most.

**2. `List-Unsubscribe-Post` is missing.** The unsubscribe page now asks before acting, which it
did not before, so the frictionless path has to come from the header that mail clients turn into
their own native button. It also helps deliverability. This went from an improvement to a gap the
moment the page started asking.

**3. Mail scanners click every link.** All nine sends came back "clicked" within seconds, none of
it human. Whenever click tracking starts working its numbers will be inflated by Linkroad's own
security appliance unless something filters them, or the Analytics screen will report a scanner as
engagement.

**4. `Subscriber` has no `unsubscribedAt`.** Nothing records when somebody left. It made the
unsubscribe investigation harder and would make a real incident impossible to reconstruct.

**5. The send route itself is unexercised.** The nine sends went through everything below it,
using the same library functions, but the route needs a session with MFA and was never called.
What is untested is its assembly of `emailData` from an edition's own articles. Related: every send
had a single-element recipient list on purpose, so the batching and the delay between batches have
never run against Resend more than once.

**6. Four dashboard screens log a React hydration mismatch** (projects, sources, analytics,
settings). Pre-existing, harmless today, the kind of thing that becomes a real bug later.

### Two things that are not defects but will look like them

**The archive cannot be verified from a laptop.** `/editions` links are signed with
`UNSUBSCRIBE_SECRET`, and production holds a value this machine does not. A token minted locally
answers 404 there, correctly. Production is internally consistent: it signs and verifies with its
own secret, so the archive works for anything sent from the dashboard. The nine emails sent from
local carry links production will refuse, which is also why the scanner's clicks on them were
harmless twice over.

**Local sending needs `node --use-system-ca`.** Node's fetch cannot reach api.resend.com from
Windows while PowerShell can: corporate TLS inspection, Windows trusts the company root CA and
Node ships its own bundle. Same cause as `npx playwright install` being unable to download
browsers here, which is why the project's Playwright config has no browsers installed.

---

## The audit's remaining findings are closed

**Done 6 August 2026, evening.** Everything else on
[FINDINGS-2026-08-06-flexibility-and-provenance.md](FINDINGS-2026-08-06-flexibility-and-provenance.md),
plus a production search failure Julian reported.

**The search.** "The search did not finish: unsupported Unicode escape sequence", and the
search had in fact finished: only the write of its result failed. Tavily returns whole
scraped pages, scraped text carries NUL bytes, and a NUL inside a jsonb value is refused by
Postgres. What jsonb accepts was measured against the database: NUL and lone surrogates
refused, valid surrogate pairs and other C0 controls accepted. So `lib/pg-safe-text.ts`
removes exactly two things, because stripping the surrogate range would delete emoji and
stripping all controls would eat newlines, both silently.

**The tenant hole was larger than the audit found.** `PATCH /api/articles/:id` had no auth
at all, but fixing it exposed that the tenant client's `update` and `delete` passed the
caller's where through untouched on **all thirteen models**, while findMany, findFirst,
count and updateMany scoped correctly. Every caller trusting the wrapper was performing a
cross-tenant write. 24 methods fixed, 41 tests assert the contract per model.

**Dates.** `publishedAt` is nullable and `capturedAt` is new. 38 of 4456 rows carried their
ingestion time as a publication date and were cleared; their source hosts say what they
were: beehiiv, twitter.com, facebook.com. Nine ordering clauses needed `nulls: "last"`.

**Provenance.** `Article.sourceId` and `Article.inboundEmailId`, written by both ingest
paths, and a Received view on the Sources screen: one row per email, expandable to the
articles with each one's real publisher. No backfill: 31 existing articles fall inside some
email's window and only 19 match exactly one, so attributing the rest would invent data.

**901 unit tests, `tsc` clean, `next build` clean.**

**The 390px fix is verified.** The collection band's text block measured about sixty pixels
wide at 390px, with its title over five lines; it is 286px and one line now, the chip and
button wrap to their own row, and at 1440px the flex basis returns to `auto` with the chip
back on the same row, so the desktop layout is unchanged. It also fixed a second finding
recorded separately as a minor observation: "last topped up 1h ago" was being cut to "1h"
by the same squeeze.

---

## The edition is no longer a week

**Done 6 August 2026, afternoon.** Julian's four complaints about rigidity were audited
into [FINDINGS-2026-08-06-flexibility-and-provenance.md](FINDINGS-2026-08-06-flexibility-and-provenance.md),
23 findings, and the edition-model half of them is closed. Plan:
[docs/superpowers/plans/2026-08-06-edition-identity.md](../../../docs/superpowers/plans/2026-08-06-edition-identity.md),
seven tasks, seven commits.

**An edition is identified by a publication date and a name.** `week` and `year` survive
as a cache derived from `publishDate` and written only by `lib/editions/identity.ts`, so
the forty-odd sites reading `edition.week` still work. The unique index moved from
`[week, year, organizationId]` to `[weeklySlot, organizationId]`: a weekly edition holds
`"2026-W32"`, a special holds null, and Postgres treats nulls in a unique index as
distinct. **Verified against the database, not assumed:** two specials in week 32 insert
alongside the weekly, and a second weekly for week 32 is refused.

| Closed | Was |
|---|---|
| A1, A2, A6 | An edition could only be a week, and only one could be open |
| A3 | `publishDate` replaces the never-written `scheduledDate` |
| A5 | The subject line derived from the week; a named edition gets its name |
| D4 | An unwrap that failed stored the newsletter's wrapper in silence |

**835 unit tests, `tsc` clean, `next build` clean.** Not yet deployed.

**Three P0s from the audit are deliberately still open**, each needing its own change:
the missing tenant scope and role check on `PATCH /api/articles/[id]`;
`publishedAt: new Date()` in `curateArticle`, which dates every email-sourced article to
its ingestion; and the absent `Article` relations to `RSSSource` and `InboundEmail`, plus
the fact that no screen shows the 44 emails received.

---

## What is mid-flight right now

**Nothing is half-done in the code.** Every commit from this session is pushed and each one
deployed green. The throughput plan is fully executed, all five tasks, verified in
production. The working tree carries only two untracked files another session left behind, a
`FINDINGS-2026-08-06-...` note and an `.impeccable/` critique, both untouched.

**Two things waiting on Julian, neither blocking:**

- **[DECISIONS-2026-08-06.md](DECISIONS-2026-08-06.md) is unreviewed.** Fourteen entries.
  §11 is the one worth reading first: it is not a decision but a defect found in passing,
  where `withinDailyCap` says it counts the two triggers separately and does not.
- **The `.env` `RESEND_API_KEY` value ends with a literal `\n` escape, inside the quotes.**
  The key itself is fine and has full access: with the escape stripped, `GET /domains` and
  `GET /emails/receiving` both answer 200. The application never noticed, because dotenv
  expands `\n` inside a double-quoted value and header serialisation trims the trailing
  whitespace that results. Anything reading the line by hand does notice, and gets
  `400 "API key is invalid"` from Resend with no hint that the key is not the problem.

  Worth removing from the file, and worth checking whether the value stored in the Vercel
  dashboard carries the same trailing escape. This cost an hour of misdiagnosis on
  6 August 2026, described in the local-environment section below.

---

## The inbound email blocker is gone

**Fixed 6 August 2026.** A full-access `RESEND_API_KEY` went into the Vercel production
scope and the deployment that carries it is live. Every inbound email has been read:

| | |
|---|---|
| Bodies fetched | **44 of 44**, html on all of them |
| `CONTENT_PENDING` left | **0** |
| `FAILED` | **0** |
| Final status | 42 `PROCESSED`, 2 `IGNORED_UNKNOWN_SENDER` |

Nothing was lost. The 39 emails reached `retryCount: 2` of 3 before this was fixed, so
they came within one failed run of `FAILED`.

Two things learned while fixing it, both now recorded further down: **a Vercel env change
does nothing until the next deployment**, and **checking a Resend key from WSL costs
nothing** and does not need a run against real email.

### The extractor was broken too, in three separate ways, and all three are fixed

Fixing the key exposed five newsletters that produced nothing. Final state after the fixes:
**43 `PROCESSED`, 2 `IGNORED_UNKNOWN_SENDER`, zero rows carrying an error, 45 bodies read,
and 8 articles above the threshold sitting in `PENDING_REVIEW`.** Those eight are the first
real articles this product has ever taken from an email rather than a feed.

**One: a failure and an empty email were the same value.** `ExtractResult` used one `NONE`
variant for "nothing to extract", "the call died" and "the reply never had the shape". The
caller could not tell them apart, so it marked all three `PROCESSED` with a null `error`:
invisible in the data, never retried. `FAILED` is now its own variant and the reason lands
on the row.

**Two: the essay prompt asked for output that could not fit.** It asked the model to return
the whole piece. Measured on the two real emails: 4354 and 4654 output tokens of body
against a budget of 4000 that thinking also drew on. It could never have parsed on any
attempt. The body is in the email, so the prompt stopped asking for it.

**Three: the prompt budget was allocated backwards.** The link block was assembled first
and given whatever it wanted, with the email's text taking the remainder. Tracking URLs run
400 to 1200 characters, so `news@daily.therundown.ai` was sent **80 characters** of its own
text. Eighty. The extractor was being asked which articles a newsletter described while
being shown almost none of it. The text is served first now.

**And then a fourth, which raising the budget could not fix.** Two emails still died with
`the model returned no text (thinking, stop reason max_tokens)` at 4000 tokens and again at
8000, because thinking scales to fill whatever it is given. The cause is documented model
behaviour: the 5-family models think when the request omits the `thinking` field, and
`max_tokens` caps thinking and reply together. Extraction is not a reasoning task, so it now
says so. Gated per model, because `output_config.effort` is a 400 on Haiku 4.5, which this
product offers as the cheap option.

**A fifth defect fell out of the fix, in code nobody was looking at.** The successful run's
notes carried five refused links: `techcrunch.com`, `variety.com`, `deadline.com`,
`hollywoodreporter.com`, all reported as not public addresses. `isBlockedIpv4` blocked all
of `192.0.0.0/16`, `198.51.0.0/16` and `203.0.0.0/16`, where the reservations are `/24`s.
Each check covered 256 times the space it meant to, and those four publishers live in
`192.0.66.0/24`, ordinary public space. Every newsletter linking to them had been silently
losing items. Corrected, and reprocessing Morning Brew went from five refusals to zero.

### The 300-second ceiling is gone

**Fixed 7 August 2026**, following
[RQ-007-throughput-plan.md](RQ-007-email-ingestion/RQ-007-throughput-plan.md). The job used
to be bounded to two emails a run, and two runs were killed mid-flight at 8 emails and at
42.

**The job was never slow because the work was heavy.** Both phases looped strictly
sequentially over work that is almost entirely waiting: a DNS lookup and a HEAD per redirect
hop, an embedding call, a scoring call. Measured before the change: a 20 to 25 second
extraction call per email plus 3 to 7 seconds per item, one item at a time. Morning Brew 16
items in 71s, theresanaiforthat about 20 items in 129s, therundown 3 items in 46s.

| | before | after |
|---|---|---|
| Morning Brew, the same 16-item issue | **71s** | **31s** |
| Eight small newsletters, from a standing start | two runs at best | **10 seconds**, in one handover |

Two changes, and they fix different halves:

- **Bounded concurrency**, four emails at a time and four items within each, so sixteen
  outbound calls at the worst moment. The product is what reaches a provider, so it is the
  product the test asserts: Anthropic and OpenAI are both rate limited per organization and
  a 429 here costs an article rather than a retry.
- **A wall-clock budget with a handover.** A run stops at 240 seconds and asks a fresh
  invocation to continue, up to a chain of 12. The cron stays daily, so `vercel.json` is
  untouched and the build-time rejection that cost eleven hours cannot recur.

**A `claimedAt` lease, not a `PROCESSING` status.** Two runs can overlap: a chained
invocation, or a manual trigger, which is what the section below tells you to do. Taking a
row is a compare and swap, so the loser simply skips it. A lease rather than a status
because a status strands rows for ever when a run is killed mid flight, which is exactly
what the ceiling does, and because `processedAt` already means something else.

**Two knobs on the route, both for testing.** `?limit=` bounds how many emails a run
touches, which is what made verifying the Resend key cost one email instead of risking 39.
`?budgetMs=` shortens the budget so a handover happens in seconds; it can only make a run
stop sooner, never later.

**The handover was wrong twice before it worked, and both failures were silent.** It first
targeted `VERCEL_URL`, the deployment's own hostname, so the child would run the parent's
exact build. Deployment URLs sit behind Vercel's deployment protection: that hostname
answers **302** to an SSO page while the production alias answers 401 from our own cron
guard. And the fetch was awaited inside a `try` that logged only thrown errors, so the 302
counted as success. Eight emails sat untouched for four minutes with nothing logged. Both
are fixed, the status is now checked and a refusal is logged at error level, and
`lib/inbound/handover.ts` has a test that says in words that `VERCEL_URL` must never be
used.

Verified in production rather than by the suite, because the chain is the one part no test
can reach: four rows held at once mid-flight, matching the concurrency limit; zero terminal
rows left holding a lease; zero duplicated `sourceUrl` among the articles produced.

---

## What was done overnight: RQ-006_03, the article detail view

The last requirement this file named as next. The API was already done and already
returned the attribution block on every response; what was missing was the screen, and
there was no article detail route in the application at all.

`/dashboard/articles/[id]` now exists. Four states, each verifiable:

| State | Screen |
|---|---|
| A Link Take exists and is current | The prose is the body, with the AI label, the check evidence, and the feed summary kept behind a disclosure |
| It exists but the article changed since | The prose, plus a warning, plus regeneration for an editor |
| Nothing was ever attempted | The summary with its attribution, and a button to write one |
| An attempt was refused by the checks | The summary, and the reason stated rather than silence |

**Nothing is generated by opening the screen.** The read passes `generate=false`. With
the article title now linking here from every card, generate-on-open would have let idle
navigation spend the day's budget, and a page open would have waited up to two minutes
on a model.

**The article title is the way in**, from the queue, the proposal and the table. The
title used to link to the publisher; it now opens our page about the story, and the
**source stamp** on each card opens the publisher, so the one-click route to the source
is not lost.

**The evidence is on the screen, not only in a column.** Input mode, word count, longest
run shared with the source, model, date. For an editor, a history panel showing every
version and every refusal with its reason. That is the recorded consequence of open
question 1 in `PLAN-REVIEW.md`: with no guaranteed human read before a piece reaches a
subscriber, the mechanical checks are the only control, so every piece has to carry its
check result.

Six decisions I took alone are in
[DECISIONS-2026-08-06.md](DECISIONS-2026-08-06.md), including two worth knowing before
you touch this: the UI is English but the AI label follows the language of the prose,
and there is no markdown library because nothing in the rendering path ever produces
markup.

---

## What is live and verified

| | Verified how |
|---|---|
| Editions in one decision, all four bulk actions, archive filter | Preview harness, four selection paths |
| Collection status band has data | 16 unit tests on the module |
| Radar collecting daily, 23 entities, 38 validated queries | 38 counts written for 3 August in 89s, re-run skips all 38 |
| Categoriser constrained to its taxonomy | 48 stored category values reduced to 16, all valid |
| Link Take checks and generation path | A real rewrite generated: 204 words, longest shared run 1 word |
| Link Take input pipeline, allowlist empty | 30 tests, gate proven both ways |
| Generation on approval, after the response | 15 tests on the order of refusals |
| Webhook signatures actually verified | Production: forged signature answers 401, was 307 |
| Inbound email webhook recording arrivals | **44 real emails recorded** |
| Inbound content fetch, end to end in production | **44 of 44 bodies read, 0 pending, 0 failed** |
| Inbound extraction against real bodies | Ran: 38 emails extracted, **4 failed on large html**, 10 articles created and all 10 correctly auto-rejected below the threshold |
| RQ-007 step 3, sources UI and unknown senders | 38 tests, preview harness, one fixture per health state |
| The ingest job runs in production at all | Triggered manually: HTTP 200 in 7.4s, reached Resend, got 401 |
| **RQ-006_03, source name and URL on every rendering** | **8 assertions across all four states and both roles** |
| **The rewrite body cannot inject markup** | **Parser fed `<script>`, an `onerror` attribute and a `javascript:` link; all three come out as literal text** |
| **Every state of the new screen** | **Harness fixtures, screenshotted; the history path clicked through in the browser** |

**766 unit tests, `tsc` clean, `next build` clean, production deploy green.**
All four schedules are in `vercel.json`: daily collection 09:00, weekly proposal 09:30,
radar 06:00, email ingest 05:30.

---

## What is left, in the order I would do it

### 1. The extractor on a large newsletter

The blocker at the top is fixed, and it exposed the next thing. Four of the biggest
emails produced nothing, and the job recorded that only in a log line: the row says
`PROCESSED` with a null error. Two fixes, both small, in this order:

1. **Record the failure on the row.** A silent `PROCESSED` that produced nothing is
   indistinguishable from a newsletter that legitimately had nothing to extract. Write
   the reason to `error`, and use a status that can be retried.
2. **Raise `max_tokens` for the extraction call, and check the stop reason.** One of the
   four died with `stop reason max_tokens` having emitted only thinking. That is the same
   family as the `content[0].type === "text"` bug this repository already fixed in
   twenty-one places: a reply whose text is empty for a structural reason, not a content
   one.

Then relate `Article` to the `InboundEmail` it came from. Without it, "what did this
newsletter actually produce" is not answerable after the fact, which is why open 2 above
is still open.

### 2. RQ-006_04, using a Link Take in the newsletter

The last part of RQ-006. The review's reconciliation with RQ-005 is still the right
shape: an organization-level default (use the Link Take when one exists, fall back to
the summary) with a per-article override, so the toggle exists for whoever needs it and
costs nothing for whoever just wants to approve the edition.

Now that the detail view exists, an editor can actually read a piece before deciding it
goes out, which was not true yesterday.

### 3. Loose ends, each small

- **The daily-cap counter does not do what its comment says.** `withinDailyCap` claims
  the two triggers are counted separately; they share one counter compared against two
  limits, because `ArticleRewrite` has no column recording the trigger. Details and the
  fix are in DECISIONS-2026-08-06.md §11. Small effect today, worth doing deliberately.
- The 45-feed OPML in `docs/reference/ai-feeds-verified.opml` is still not imported.
  Read its header first: four arXiv feeds carry 100 to 710 items a day each, and the
  collector takes 60 per feed.
- `NEXT_PUBLIC_APP_URL` locally points at port 3000 while the dev server runs on 3111,
  so links in locally generated emails point at the wrong port.
- RQ-002 Q7: whether `CurationJob` gets a model column.
- 428 sources sit in one category called Security. Correctly labelled, and one bucket
  that size is useless for filtering.
- The inbound address is `radar@kroniiquau.resend.app`, Resend's generated domain, and
  no mail arrives with a `+tag`. Matching runs on sender address alone, which works.

---

## Local environment, two gotchas

**Kaspersky intercepts `api.resend.com` from Windows** and its root CA is not in
`~/corporate-ca-bundle.pem`, so a local Node call to Resend fails with
`SELF_SIGNED_CERT_IN_CHAIN`. Anthropic, OpenAI and GitHub all pass; only Resend fails,
and `context7` fails the same way. Appending the Kaspersky root CA to that bundle fixes
it; the file is outside the repository and was left alone.

**But WSL is not intercepted, and that is the cheap way to check a Resend key.**
Found 6 August 2026. `wsl bash -c 'curl ... https://api.resend.com/domains'` completes
its TLS handshake normally. This matters because it separates two questions that used to
be answerable only by spending a retry on 42 real emails:

- **Does the key have full access?** `GET /domains` and `GET /api-keys` answer **200**
  for a full-access key and **401** for a sending-scoped one. Neither touches an inbound
  email, so the check is free.
- **Does it still send?** `POST /emails` with `{}` answers **400** on a validation error,
  which is a key that works.

Pass the key through `WSLENV` rather than on the command line, so it stays out of shell
history and process listings.

**Read the value out of `.env` carefully, or the check lies to you.** This cost an hour on
6 August 2026 and produced a confident, wrong conclusion that the key had been revoked. The
line is `RESEND_API_KEY="re_..._...\n"`: double quoted, ending in a literal `\n` escape, on
a CRLF line. Three traps, and each one alone yields the same `400 "API key is invalid"` from
Resend, which reads exactly like a dead key:

- `.Trim('"').Trim()` in that order leaves the closing quote behind, because the last
  character is the carriage return rather than the quote. Trim whitespace **first**, quotes
  second.
- The literal `\n` survives every trim and has to be removed on purpose:
  `-replace '\\[nr]$', ''`.
- Verify the result before trusting a verdict: a valid key matches
  `^re_[A-Za-z0-9_]+$` and is 36 characters. If the shape check fails, the next 400 is
  about your string.

The lesson generalises past this key: when a credential check fails, prove the credential
you sent is the credential you have before concluding anything about the credential itself.

**Changing `RESEND_API_KEY` in Vercel does nothing until the next deployment.** The
functions already running hold the value they were deployed with.

**The preview harness is how screens get verified**, at `/radar-preview?screen=...`,
dev-only. The new screen has four entries: `article`, `article-stale`, `article-absent`,
`article-refused`. Note that a `fullPage` Playwright screenshot renders the sticky
header at its scroll position, which looks like the title being clipped; it is an
artefact of the capture, not the layout. Take viewport screenshots to judge layout.

The database is reachable locally, so querying it from a script works fine.

---

## Things worth knowing before you change any of this

Five defects have been found in code nobody was looking at, each of which had shipped:

- The row checkbox never showed a tick, in any of the five lists.
- Four article routes had no authentication and no organization filter.
- Webhook signature verification never ran, because the header was split on the comma
  and then searched for an element starting with `"v1,"`.
- `content[0].type === "text"` was in twenty-one places, and returns the empty string
  when a reply opens with a thinking block.
- A deploy that failed for eleven hours while every local signal was green, because one
  cron schedule was sub-daily and the plan refuses that at build time.

None of them failed loudly. The lesson holds: check the thing itself, not the code that
was supposed to do it, and not the build that was supposed to ship it.

Two smaller ones from last night, both found by looking at a screenshot rather than by a
test passing: a button that renamed itself while working, and a refusal reason
concatenated into a following sentence without punctuation between them. Tests were
green through both.
