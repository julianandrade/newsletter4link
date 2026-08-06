# Where we are, and how to pick this up

Written 6 August 2026, updated late morning. Everything is committed and pushed,
production is deployed and healthy, and nothing is left running.

Read this file, then
[DECISIONS-2026-08-06.md](DECISIONS-2026-08-06.md) for the calls made overnight without
you, and [ROADMAP.md](ROADMAP.md) for the longer view.

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
