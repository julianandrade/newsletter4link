# Review of the email ingestion plan

Reviewed against the repository at commit `1bd4cec`. The plan is unusually complete:
the infrastructure is already deployed, the two parse modes are the right split, the
idempotency key is chosen correctly, and the acceptance criteria are testable as
written. The build order is also right, and for the reason it gives.

Seven findings. The first two are why nothing in this plan could have worked as
written, and both were live defects in the code it says to follow.

---

## F1. The webhook is unreachable, and always has been

`middleware.ts` lets three path prefixes through without a session:
`/unsubscribe`, `/api/unsubscribe`, `/api/cron`. `/api/webhooks` is not among them,
so every request to a webhook route is redirected to the login page.

Measured against production:

```
GET  /api/webhooks/resend   307
POST /api/webhooks/resend   307
```

A webhook caller has no session and never will, so Resend has never delivered a
single event to this application. The existing send-events webhook was written,
deployed, configured on Resend's side with a secret 192 days ago, and has never
run. That is what is behind "Email Tracking: Partial" in the project notes: the
71 `EmailEvent` rows were written by the send path itself, not by the webhook.

**Fixed here**, because the new requirement cannot work without it.

## F2. The signature verification the plan says to mirror does not verify anything

`app/api/webhooks/resend/route.ts` did this:

```ts
const signatureParts = signature.split(",");
const v1Signature = signatureParts.find((p) => p.startsWith("v1,"))?.replace("v1,", "");
if (v1Signature) { /* verify, 401 on mismatch */ }
```

The header is `v1,<base64> v1,<base64>`, space separated. Splitting on the comma
consumes the delimiter, so no element can start with `"v1,"`, so `v1Signature` is
always undefined, so the block never runs and the request is accepted. Two further
errors sat inside it: the HMAC was compared as hex where Svix uses base64, and the
`whsec_` secret was used as raw text rather than base64 decoded, so even when
reached it could never match.

The plan says the new endpoint should mirror this implementation. Doing that, plus
F1's fix to make it reachable, would have published an unauthenticated write
endpoint into the database.

**Fixed here, and in this order**, which matters: making the routes public before
repairing the verification would have opened exactly that hole for as long as the
two changes were apart. `lib/webhooks/verify.ts` now uses the official `svix`
library, fails closed when no secret is configured, and is tested against the exact
header shape the old code accepted.

Using the library rather than repairing the arithmetic buys two properties worth
having: the timestamp tolerance that stops a captured payload being replayed, and
multiple valid signatures during a secret rotation.

## F3. Following redirects out of an untrusted email is an SSRF

Step 3 resolves tracking wrappers by following up to five redirects. The URLs come
from an email, which is attacker-supplied input by definition: anyone who can get a
message to `radar+anything@julianandrade.net` chooses them.

A redirect chain can end at `http://169.254.169.254/`, at `http://localhost:3000/`,
or at a private address inside whatever network the function runs in. Nothing in the
plan restricts where a hop may go.

**What the requirement needs**, and none of it is expensive:

- Only `http` and `https`, checked at every hop rather than only the first.
- Reject a hop resolving to loopback, private, link-local or unique-local address
  space, which means resolving the hostname rather than pattern matching the string.
- No credentials in the URL, no ports other than 80 and 443.
- The response body is never read. Only the final URL is wanted, so a hop that
  starts streaming a gigabyte should be abandoned.

## F4. Fetch the content in the job, not in the webhook

The plan fetches from the Receiving API inside the webhook handler, then falls back
to `CONTENT_PENDING` when that fails.

Make `CONTENT_PENDING` the state every row starts in. The webhook then does one
write and returns, which is what a webhook should do: it is on someone else's
timeout, and the plan already builds the retry loop that would recover the fetch
anyway. Fetching inline adds a second network dependency to the only part of this
system that must not be slow, in exchange for content arriving a few minutes
earlier than a job would bring it.

## F5. Temperature is rejected by the current models

The plan sets temperature 0.2 for extraction. Measured yesterday against the real
API: `claude-sonnet-5` answers `temperature is deprecated for this model` with a
400. Whether Haiku 4.5 still accepts it is worth one call to find out rather than
discovering it when the first digest arrives.

RQ-006 hit this and now sends no temperature at all.

## F6. InboundEmail has no organization, and the unknown senders panel exposes that

Every other table in this schema carries an `organizationId`. `InboundEmail` does
not, which is defensible while a row is unmatched: an email arriving at a shared
address does not belong to a tenant until a source claims it.

The consequence is in section 5. The unknown senders panel lists senders from
`IGNORED_UNKNOWN_SENDER` rows, so both organizations see the same list, including
subjects. One organization can read what the other subscribed to, and can promote a
sender whose emails were meant for the other.

Two ways out. Either the panel is restricted to OWNER and documented as
platform-wide, which is honest and cheap, or a matched email records which
organization claimed it and the panel shows only unmatched ones plus that
organization's own. I would take the first: with one real tenant it costs nothing,
and it does not pretend to an isolation the shared address cannot provide.

## F7. RSSSource.url is required and unique per organization

An email source has no feed URL. `url` is `String`, not optional, and
`@@unique([url, organizationId])` means whatever is put there must be unique.

Cleanest resolution: store the sender address in `url` for EMAIL sources. It is
naturally unique per organization, it makes the existing unique index do useful
work, and it keeps the column meaning "where this source comes from". The
alternative, making `url` optional, weakens a constraint that is doing its job for
the RSS case.

---

## What the plan gets right, and should not be second-guessed

- `resendEmailId` as the idempotency key, with an upsert. Replay is a first-class
  case rather than an afterthought.
- Two parse modes. A digest and an essay are genuinely different documents and one
  prompt for both would do neither well.
- Canonicalization declared mandatory. URL dedup does break without it, and saying
  so in the plan is what stops it being skipped under time pressure.
- Retaining `IGNORED_UNKNOWN_SENDER` rows rather than dropping them. That is what
  makes the promote action possible.
- Digest items store title, snippet and link, never the newsletter's HTML. A free
  subscription is not a republication licence, and the plan says so.

---

## Added 7 August 2026: `InboundEmail.claimedAt`, and what it means for a new consumer

The ingest can now run in more than one invocation at a time, so a row carries a lease.

**If you write anything new that reads `InboundEmail`, a row whose `claimedAt` is recent
belongs to somebody.** Do not act on it. The lease is ten minutes, deliberately longer than
the 300-second function ceiling: a lease that expires while its owner is still working is
worse than no lease, because it produces exactly the double processing it exists to prevent.
`claimCutoff()` in `lib/inbound/claim.ts` is the one place that decides what counts as
stale, and every reader should go through it rather than computing its own window.

Taking a row is a compare and swap, not a read followed by a write:

```ts
updateMany({ where: { id, status: "RECEIVED", OR: [{ claimedAt: null }, { claimedAt: { lte: cutoff } }] }, ... })
```

The returned count is the answer. A read then a write would leave a gap between them exactly
wide enough for a second run to pass the same check.

**A lease rather than a `PROCESSING` status**, for two reasons worth keeping. A status
strands rows for ever when a run is killed mid flight, which is precisely what the function
ceiling does, whereas a timestamp expires by itself. And `processedAt` already means
something else: conflating two meanings in one column is the defect this requirement spent
6 August 2026 removing from the extractor, and it was not going to be reintroduced one file
away.

Every terminal write, `PROCESSED`, `FAILED` and `IGNORED_UNKNOWN_SENDER`, clears the lease
in the same statement that sets the status. Verified in production: zero terminal rows
holding a claim after a full chained drain.
