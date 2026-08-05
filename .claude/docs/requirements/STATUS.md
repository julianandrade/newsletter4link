# Where we are, and how to pick this up

Written 5 August 2026, evening, at commit `56b6243`. Everything is committed and
pushed, and **production is deployed and healthy again** after eleven hours in
which it was not. Nothing is in flight and no process is left running.

Read this file, then [ROADMAP.md](ROADMAP.md) for the longer view and
[DECISIONS-2026-08-05.md](DECISIONS-2026-08-05.md) for the calls made without you.

---

## Read this first: one thing blocks everything

**The production `RESEND_API_KEY` cannot read inbound email.** Resend answers
`401` to every content fetch. All 39 inbound emails are sitting at
`CONTENT_PENDING` with their bodies unread, and no article can be created from
any of them until this is fixed.

The diagnosis is confident. A `401` is an authenticated request being refused,
not a wrong path, which returns `404`. The same key sends newsletters from
production successfully, so it works, it is simply scoped to sending. Resend
issues keys as **sending access** or **full access**, and reading an inbound
email's body needs full access.

**What to do, and it is the whole fix:**

1. In Resend, create an API key with **full access**, or upgrade the existing one.
2. Set `RESEND_API_KEY` to it in the Vercel project settings, production scope.
3. Redeploy, or just wait: the 05:30 cron picks it up on its next run.

**There is a deadline, and it is about two days.** `maxContentAttempts` is 3, and
every email is now at `retryCount: 1`. The cron is daily, so two more runs mark
all 39 `FAILED` and they stop being retried. Nothing is destroyed when that
happens: Resend keeps its own copy of every inbound email and supports replay,
and a `FAILED` row can be reset to `CONTENT_PENDING` by hand. It is just tidier
to fix the key first.

---

## What went wrong today, and why nothing in the logs said so

**RQ-007 step 2 was never deployed.** The status note written this morning said
the ingestion job was done, with 598 tests and a clean build, and all of that was
true locally. It had never reached production.

One line in `vercel.json` did it: the cron `15 */4 * * *`. This project's Vercel
plan does not accept a sub-daily cron schedule, and it **refuses at build time**.
Three daily crons deployed fine; adding a fourth on a four-hourly schedule failed
the whole build. So every deployment from `a647a81` onwards failed, and the last
successful production deploy was `2705d8a`, RQ-007 step 1, at 09:40.

No application log could have shown this, because the application was never
reached. What found it was comparing routes: the other three cron endpoints
answer `401` in production, `email-ingest` answered `404` with an HTML page,
which means the route does not exist in the deployed build.

The 39 emails at `CONTENT_PENDING` with `retryCount: 0` looked exactly like a job
that had run and found nothing to do. They were a job that had never existed.

**Fixed.** The schedule is now `30 5 * * *`, daily, ahead of the 06:00 radar and
the 09:00 collection. If the Vercel plan is ever upgraded, a shorter schedule is
one line. Worth carrying forward: a green local build says nothing about whether
the deploy landed, and this repository now has an eleven-hour precedent for it.

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
| Inbound email webhook recording arrivals | **39 real emails recorded from 31 senders** |
| Inbound extraction, unwrapping, ingestion job | 598 unit tests, but see the blocker: never yet run against a real body |
| RQ-007 step 3, sources UI and unknown senders | 38 new tests, preview harness, one fixture per health state |
| The ingest job runs in production at all | Triggered manually: HTTP 200 in 7.4s, reached Resend, got 401 |

**635 unit tests, `tsc` clean, `next build` clean, production deploy green.**
All four schedules are in `vercel.json`: daily collection 09:00, weekly proposal
09:30, radar 06:00, **email ingest 05:30**.

---

## What was done this session

**RQ-007 step 3, the sources UI.** The last blocker this file named. Creating an
EMAIL source was impossible before, because `POST /api/rss-sources` validated
every url with `new URL()` and an address is not a URL.

- EMAIL source creation. The sender address goes in `url`, so the existing
  `@@unique([url, organizationId])` keeps earning its place.
- Health by silence, judged against the source's own declared cadence, at three
  times over. A source that has never received gets a grace period from
  `createdAt` rather than a red flag the second it is saved.
- The unknown senders panel, OWNER only and saying why, with promote and requeue.

**29 EMAIL sources created** in `link-consulting`, 15 DIGEST and 14 ESSAY, with
estimated cadences. The test email from your Gmail and the Cloudflare
verification were excluded. Parse modes are a judgement call per newsletter and
each is correctable in the UI in one click.

**The AIDLC config was synced** from `common-ai-configs`
`feature/hollow-development` at `84ebab1`, two generations forward. The
requirement/transaction rename, the artefact catalog, `hollow-development` and
`phased-development`. See [docs/AIDLC.md](../../../docs/AIDLC.md) for the five
places this project deliberately diverges. RQ-002 through RQ-007 keep their ids
and their location, and all 239 code tags are untouched.

---

## Something you should know before judging the output

**36 of the 39 emails are welcome and confirmation mail, not newsletter issues.**
Only three are real editions:

- `frontend@cooperpress.com`, "The new CSS feature devs love most but can't rely on yet"
- `bytebytego@substack.com`, "How Big Models Teach Small Models to Be Smart"
- `superintel@mail.beehiiv.com`, "The Website Nobody Meant to Hack"

So when the ingest finally runs with a working key, it will look like it did very
little, and that will be correct. Judge it on those three. The other 36 are
"Thanks for subscribing", and a DIGEST extraction over one of those may well
produce a link to a Twitter profile. Watch for that: if junk articles appear, the
lever is the relevance threshold, not the extractor.

The real test is the next few days of actual issues, now that 29 sources exist to
claim them.

---

## What is left, in the order I would do it

### 1. Fix the Resend key, then watch one real run

Covered at the top. After it, check that `contentFetched` is 39 rather than 0,
and read what the three real editions produced.

### 2. RQ-006 _03 and _04

- `_03`: the article detail view. The API is done and always returns the
  attribution block, precisely so no surface can render the prose without the
  source. What is missing is the screen.
- `_04`: using a Link Take in the newsletter. An organization-level default with
  a per-article override.

### 3. Loose ends, each small

- The 45-feed OPML in `docs/reference/ai-feeds-verified.opml` is still not
  imported. Read its header first: four arXiv feeds carry 100 to 710 items a day
  each, and the collector now takes 60 per feed.
- `NEXT_PUBLIC_APP_URL` locally points at port 3000 while the dev server runs on
  3111, so links in locally generated emails point at the wrong port.
- RQ-002 Q7: whether `CurationJob` gets a model column.
- 428 sources sit in one category called Security. Correctly labelled, and one
  bucket that size is useless for filtering.
- The inbound address is `radar@kroniiquau.resend.app`, Resend's generated
  domain, and no mail arrives with a `+tag`. Matching runs on sender address
  alone, which works, and every source was created with `inboundTag: null`. If
  you move to `radar+tag@julianandrade.net` later, the tag becomes a useful
  fallback for a sender that changes its From address.

---

## Local environment, one gotcha

**Kaspersky intercepts `api.resend.com` on this machine** and its root CA is not
in `~/corporate-ca-bundle.pem`, so any local call to Resend fails with
`SELF_SIGNED_CERT_IN_CHAIN`. Anthropic, OpenAI and GitHub all pass; only Resend
fails. `context7` fails the same way.

This is why the content fetch could not be verified locally and had to be tested
by triggering the production cron. If you want local verification, appending the
Kaspersky root CA to that bundle fixes it. The file is outside the repository and
was left alone.

The database is reachable locally, so querying `InboundEmail` and creating
sources from a script both work fine.

---

## Things worth knowing before you change any of this

Four defects found in code nobody was looking at, each of which had shipped:

- **The row checkbox never showed a tick** in any of the five lists.
- **Four article routes had no authentication and no organization filter.**
- **Webhook signature verification never ran**, because the header was split on
  the comma and then searched for an element starting with `"v1,"`.
- **`content[0].type === "text"` was in twenty-one places** and returns the empty
  string when a reply opens with a thinking block.

Today adds a fifth, and it is the same shape one level out: **a deploy that
failed for eleven hours while every local signal was green.** None of these
failed loudly. The lesson holds and now extends past the application boundary:
check the thing itself, not the code that was supposed to do it, and not the
build that was supposed to ship it.
