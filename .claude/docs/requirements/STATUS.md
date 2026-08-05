# Where we are, and how to pick this up

Written 5 August 2026 at commit `a647a81`. Everything is committed and pushed;
production is deployed and verified. Nothing is in flight and no process is left
running.

Read this file, then [ROADMAP.md](ROADMAP.md) for the longer view and
[DECISIONS-2026-08-05.md](DECISIONS-2026-08-05.md) for the calls made without you.

---

## To resume, say this

> Continua o RQ-007 passo 3 (UI de fontes com tipo EMAIL e painel de remetentes
> desconhecidos), e depois o RQ-006 _03 e _04.

That is the whole of what is left in flight. The detail is below if you want to
change the order.

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
| Inbound email webhook recording arrivals | Production: GET 200, unsigned POST 401 |
| Inbound extraction, unwrapping, ingestion job | 598 unit tests in total |

**598 unit tests, `tsc` clean, `next build` clean.** All four schedules are in
`vercel.json`: daily collection 09:00, weekly proposal 09:30, radar 06:00, email
ingest every four hours at :15.

---

## What is left, in the order I would do it

### 1. RQ-007 step 3: the sources UI

- EMAIL source creation on the sources screen: name, sender address, inbound tag,
  parse mode, expected cadence. For an EMAIL source the `url` column holds the
  sender address, which is what makes the existing unique index work.
- Health: last received, and a warning when a source has been silent for three
  times its expected cadence.
- Unknown senders panel: distinct senders among `IGNORED_UNKNOWN_SENDER` rows with
  subject samples and counts, and a promote action that pre-fills the source and
  reprocesses that sender's held emails.
- **The panel is OWNER only.** `InboundEmail` has no organization, deliberately,
  because an email arriving at a shared address does not belong to a tenant until a
  source claims it. That makes any view over those rows platform-wide, and
  restricting it is the honest way to say so rather than pretending to an isolation
  the shared address cannot provide.

### 2. RQ-006 _03 and _04

- `_03`: the article detail view. The API is done and always returns the
  attribution block, precisely so no surface can render the prose without the
  source. What is missing is the screen.
- `_04`: using a Link Take in the newsletter. An organization-level default with a
  per-article override, so the toggle exists for the person who wants it and costs
  nothing for the person who just wants to approve the edition.

### 3. Loose ends, each small

- The 45-feed OPML in `docs/reference/ai-feeds-verified.opml` is still not
  imported. Read its header first: four arXiv feeds carry 100 to 710 items a day
  each, and the collector now takes 60 per feed.
- `NEXT_PUBLIC_APP_URL` locally points at port 3000 while the dev server runs on
  3111, so links in locally generated emails point at the wrong port.
- RQ-002 Q7: whether `CurationJob` gets a model column. The log entry already
  records the effective model, so this is tidiness.
- 428 sources sit in one category called Security. Correctly labelled, and one
  bucket that size is useless for filtering.

---

## What needs you, and nothing moves without it

**A real email.** Subscribe a newsletter to `radar+<tag>@julianandrade.net`, then
once the sources UI exists, create the EMAIL source for it. I can then verify the
whole path with real data. Everything up to that point is tested against fixtures
and against the live APIs, but no actual newsletter has been through it.

**The Resend webhook.** The endpoint is live and the secret is configured. If the
`email.received` webhook on Resend's side is not yet pointing at
`/api/webhooks/resend-inbound`, it needs to be. Until then Resend still stores every
inbound email and supports replay, so nothing is lost either way.

**The publisher allowlist stays empty**, which is my recommendation and yours as
agreed: with the collector's 2000-character truncation removed, 44% of collected
items already have enough text for a Link Take without fetching anybody's page.
Nothing fetches a third-party article page today.

**Email tracking should start working now.** The send-events webhook has never run,
because the middleware redirected it to the login page for 192 days. It is
reachable as of this commit, so opens and clicks should begin appearing. Worth
checking the analytics screen in a few days: if it is still empty, the webhook on
Resend's side needs its URL confirmed.

---

## Things worth knowing before you change any of this

Four defects found in code nobody was looking at, each of which had shipped:

- **The row checkbox never showed a tick** in any of the five lists. A single click
  selected the row and left the box empty. `preventDefault` on the click let the
  browser's revert land after React had rendered.
- **Four article routes had no authentication and no organization filter**, so any
  authenticated member of any organization could approve, reject or rewrite the
  summary of any article by id, and `/api/articles/approved` returned every
  organization's approved articles to whoever asked.
- **Webhook signature verification never ran.** The header was split on the comma
  and then searched for an element starting with `"v1,"`, which cannot match, so
  the check sat inside a condition that was never true.
- **`content[0].type === "text"` was in twenty-one places** and returns the empty
  string when a reply opens with a thinking block. Silent: an article scored from an
  empty reply is not an error anybody sees, it is an article that scored badly.

The pattern in all four is the same, and it is worth carrying into the remaining
work: none of them failed loudly, and three of them were only found by looking at
the thing rather than at the code that was supposed to do it.
