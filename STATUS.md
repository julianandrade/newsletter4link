# Status

> Last updated: 20 August 2026, after the first deploy through the workflow reached production.
> Read this first when picking the project up after a break.

## Where things stand

**The migration to GCP is complete.** The product runs entirely on Google Cloud.

| Layer | Was | Now |
|---|---|---|
| Hosting | Vercel | Cloud Run, `newsletter4link`, region `europe-southwest1` |
| Database | Supabase Postgres | Cloud SQL Postgres 17, `newsletter4link-pg`, ENTERPRISE / db-g1-small |
| Media | Supabase Storage | GCS, `newsletter-link-ai-radar-media`, public read |
| Identity | Supabase Auth | Identity Platform, Microsoft sign-in only |
| Scheduling | Vercel crons + a GitHub Actions workaround | Cloud Scheduler, 4 jobs, region `europe-west1` |
| Egress | Vercel's ranges | Reserved static IP `34.175.168.176` via Cloud NAT |

Project `newsletter-link-ai-radar` (number 113920832028). App URL:
`https://newsletter4link-rtbko5uyza-no.a.run.app`.

Running cost is roughly **40 to 65 EUR a month**, dominated by Cloud SQL. The NAT and the
reserved address are about 5 to 8 of that.

**Rollback is no longer one click.** Both old projects were **paused** on 18 August, before the
22 August date the original week-long overlap was aiming at. They are archived rather than
deleted, so the data and the configuration stay readable, but neither serves traffic: reaching
the old stack now means un-pausing it first. Supabase still holds every row it held on
14 August, and Tag `pre-gcp-migration` at `48a53d2` is still the pre-migration commit, so the
path exists. It is just no longer instant, and it gets colder the further Cloud SQL diverges.

## Unfinished

### 1. Deployments are manual, and the workflow now has one successful run behind it

`.github/workflows/deploy.yml` is still `workflow_dispatch` only, deliberately. What changed on
16 August is that pressing "Run workflow" is now safe: it passes the four `NEXT_PUBLIC_GCIP_*`
build arguments, and a preflight step refuses the build outright when any build-time variable
is unset. Before this, a CI build produced an image whose browser bundle fell back to Supabase
auth and could not sign anyone in, while reporting a successful deploy.

All nine repo variables are set (`GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`, and the seven
`NEXT_PUBLIC_*`), taken from the running Cloud Run service so a CI build reproduces the image
that currently works. WIF was already applied by `infra/terraform/wif.tf`, so nothing else is
needed to authenticate.

**It has now run.** On 20 August, against master `08664a4`, on Julian's explicit go-ahead:
every step green, WIF authenticating on its first ever use, image tagged with the commit sha,
and revision `newsletter4link-00012-gbg` taking 100% of traffic. Production was then probed
rather than assumed: `/login` answered 200, the `/_next/static/chunks/*.js` hashes had all
changed, and `AIzaSy` was still inlined in one of them, which is the only evidence sign-in can
work. `/api/health` answers 307 and did so before the deploy too.

So the preflight and the build arguments are no longer a claim about what should happen. What
remains is the policy question, not the plumbing: **should master deploy on push?** Everything
needed for it works. The question is whether every merge should reach production without a
person choosing the moment, and on a service this small with no staging environment and one
Cloud SQL instance behind it, that is a real trade rather than an obvious yes. Until it is
answered the dispatch stays manual, which costs one click and buys the choice of when.

### 2. Terraform state lives in GCS, and the local copies are still on the laptop

Done on 18 August. `terraform init -migrate-state` ran from
`C:\Users\julian.andrade\prj\n4l-gcp-b\infra\terraform`, and the state is now in
`gs://newsletter-link-ai-radar-tfstate` under prefix `newsletter4link`, on a bucket with
versioning, uniform access and public access prevention enforced.

Verified rather than assumed: the object's `lineage` matches the local file exactly, `serial`
went 114 to 115 (the migration write bumps it by one), the byte size is identical, and
`terraform state list` returns all 74 resources reading from the backend.

**What is left is deleting the local copies**, which is the half that actually closes the risk.
Three files in that directory still hold the generated database password in plaintext:
`terraform.tfstate`, `terraform.tfstate.backup`, and `pre-migrate-20260818.tfstate`, taken as a
safety net before the migration. They are gitignored, so this is about the disk, not the repo.
Deleting them is deliberately still a person's call, because until someone has run one
successful `apply` against the GCS backend they are the only offline copy of that state.

### 3. A plain `terraform apply` from that directory would destroy sign-in

Found on 18 August while verifying the migration, and it is the sharpest edge in the stack.

`terraform plan` with no extra inputs reports **1 to change, 1 to destroy**, and both are
Identity Platform:

- `google_identity_platform_default_supported_idp_config.microsoft[0]` destroyed, because its
  `count` is `var.azure_client_id != "" && var.azure_client_secret != "" ? 1 : 0`
- the four Identity Platform env vars stripped from the Cloud Run service, because
  `plain_env` drops any value that is `""` and all four are gated on `var.gcip_enabled`:
  `NEXT_PUBLIC_GCIP_API_KEY`, `NEXT_PUBLIC_GCIP_PROJECT_ID`, `NEXT_PUBLIC_GCIP_AUTH_DOMAIN`,
  `NEXT_PUBLIC_ENTRA_TENANT_ID`

**This is not drift.** The other 72 of the 74 resources match live infrastructure exactly.
It is missing inputs: `gcip_enabled` defaults to `false`, `azure_client_id` and
`azure_client_secret` default to `""`, and **none of the three is in `terraform.tfvars`**. They
were passed at apply time on 15 August and persisted nowhere. The `azure-client-secret` secret
in Secret Manager exists as a container with **no versions**, so the value is not recoverable
from GCP either; it survives only in Terraform state and in Entra.

So the stack as checked out today describes a product with Supabase Auth, while the running
service is on Identity Platform. Whoever applies next, without knowing to pass three variables,
takes Microsoft sign-in down and ships a service whose logs look healthy and lets nobody in.
That is the same failure shape as the `NEXT_PUBLIC_*` build-argument bug, and the third time it
has appeared in this migration.

Worth fixing properly rather than remembering: flip `gcip_enabled` to default `true` now that
Identity Platform *is* the auth system, put `azure_client_id` in `terraform.tfvars` since it is
not a secret, and give `azure_client_secret` a version in the Secret Manager secret that is
already sitting there empty waiting for it.

### 4. Media: 33 of 39 objects restored from the repository, 6 remain

Supabase restricted the project, so nothing could be copied out of its Storage: the API and
even the public object URLs answer **402**. The way through was not to wait for it. The 76
stored references resolve to **39 distinct objects**, and 33 of those are meme files still
present in `public/images/memes/` in the main checkout, under the same base name minus the
millisecond prefix and the extension.

Those 33 were uploaded to GCS under their **original object names**, so the database rewrite
was a pure change of host, and with the content type sniffed from the bytes rather than taken
from the name, because several are called `.jpg` and are really PNGs. Verified by fetching one
anonymously: 200, `image/png`.

`MediaAsset` and `Aside` now hold 33 GCS URLs each.

**Six objects remain on Supabase and are unrecoverable from the repository:**

- `1785843829973-v-color-dark.png`, which is `OrgSettings.logoUrl`
- `1769283812713-02___Link_LRPlayer___Cor.png` and `1769283822514-Cover_LinkedIN_1.png`
- three memes with descriptive names, `meme-tuxedo-winnie-the-pooh`,
  `meme-a-train-hitting-a-school-bus`, `meme-inhaling-seagull`

Their rows deliberately keep the Supabase URL. That URL is broken either way, and leaving it is
more honest than pointing at a GCS object that does not exist: one is a known gap, the other is
a 404 that looks like a bug in the bucket. They come back either by lifting the Supabase quota,
or by re-uploading the originals if anyone still has them.

`scripts/migrate-media-to-gcs.ts` remains the tool for the general case, and still needs the
quota lifted.

### 5. Two of three members are not relinked

Identity Platform issues different subject ids than Supabase. Only
`julian.andrade@linkconsulting.com` has been repointed. `pedro.samorrinha@linkconsulting.com`
and `test@example.com` still hold Supabase ids, so Pedro lands in onboarding on first sign-in.

Fix: have him sign in once, then run `npx tsx scripts/relink-identities.ts`. It matches on the
email **local part**, deliberately, because the company is moving from `linkconsulting.com` to
`linkroad.com` and Identity Platform already returns the new domain while `OrgUser` holds the
old one. Point `DATABASE_URL` at Cloud SQL first.

### 6. No custom domain

The app lives on its `run.app` URL. Mapping a domain is a Cloud Run domain mapping plus a DNS
record, and it also means adding the new origin to Identity Platform's authorized domains and
to the browser API key's referrer list. Both are in `infra/terraform/identity.tf`.

### 7. Supabase is paused, and six media objects are inside it

Paused on 18 August, as archived-but-accessible rather than deleted. Two things are still in
there and nowhere else: the six media objects from item 4, and the rollback copy of the data.

Being paused does not resolve the egress restriction, it just stops anything reaching the
quota. So the six objects are now behind two doors rather than one: un-pause the project, then
get the quota lifted. If nobody wants them badly enough to do that, they are gone, and the
honest move then is to say so in the rows rather than leave a Supabase URL that will never
answer again.

## Ideas for improvement, roughly by value

**Something watches daily now, but nothing watches continuously.**
`.github/workflows/bug-hunt.yml` sweeps every morning at 06:17 UTC and opens an issue per
finding: typecheck, unit tests, a critical `npm audit` advisory, a high advisory that
`.github/audit-allowlist` does not already accept, `/login` answering 200, and the Identity
Platform key actually being present in the deployed client bundle.

Its first real run, 16 August, is worth knowing about because it failed in the way this
project keeps failing. Every check ran correctly and the audit legitimately found 24 high and
1 critical advisory, and then the reporting step died: it called
`gh issue create --label "bug-hunt"` against a repository where that label did not exist, so
`gh` refused, `set -euo pipefail` killed the job, and the finding was never filed. A watchdog
whose only symptom of failure is a red tick on a workflow nobody watches is indistinguishable
from one finding nothing. The label exists now.

The audit check was then re-scoped on 20 August, because it could not go green and so said
nothing. It ran `npm audit --audit-level=high`, which exits non-zero on any high advisory, and
25 high plus 1 critical stood across 1,487 dependencies. #55 cleared the critical and nine of
the high; #56 was closed as a subset of it. That left 21 distinct high advisories with no
reachable non-breaking fix at all, since `npm audit fix` reports "up to date" and `--force`
changes nothing, and the two headline bumps in #55 do not clear their own advisories: 16.2.11
is still inside `next`'s vulnerable range and 7.9.1 inside `prisma`'s, and both are flagged
transitively anyway, `next` via `postcss` and `sharp`, `prisma` via `@prisma/config`.

So #48 was a standing-debt ticket wearing a bug's clothes, commented on for three consecutive
days with nothing actionable changing, which is precisely how a repository learns to stop
reading its own watchdog. The gate is two checks now. A critical fails unconditionally at any
depth, including dev tooling, because this workflow holds `issues: write` and the one critical
the sweep ever found was in the test runner. A high fails only when its GHSA id is absent from
`.github/audit-allowlist`, so the sweep reports what is **new** and stays quiet about what is
merely still true. The list is a set rather than a count deliberately: a count has a stale
window where it falls to 10, nobody lowers the 21, and five new advisories arrive unnoticed
under the old ceiling. Accepting an advisory is a line in a reviewed diff; pruning one is free,
and the workflow says which entries have gone stale without failing on the good news.

What it still does not do is notice anything **between** runs. If Cloud Run starts erroring at
09:00 the first sign is a person, or tomorrow's sweep. Cloud Monitoring alerts on Cloud Run 5xx
rate and on Scheduler job failures remain the cheap fix, and are now the actual biggest gap in
operability. Sentry was on the parallel track and is still not a dependency.

**The durable job queue.** `archive/claude-project-launch-recommendations` holds a Postgres
job queue (`lib/jobs/queue.ts`, `worker.ts`, handlers, with tests) written to fix
`/api/curation/collect` timing out, which is **still an open known issue** in `CLAUDE.md`.
Self-contained and high value.

**Cloud SQL is a single zone.** `availability_type = "ZONAL"`. A zone outage takes the product
down until Google restores it. `REGIONAL` roughly doubles the instance cost and is a decision
rather than an oversight.

**`emailVerified` is false** on the Identity Platform account, because Entra does not assert
it. Harmless today since Microsoft is the only sign-in method, but worth knowing before anyone
adds a second one.

**Old newsletters' unsubscribe and archive links are dead.** `UNSUBSCRIBE_SECRET` was
regenerated because Vercel would not return the original, a decision taken knowingly on the
grounds that the editions so far are test data. If a real send has gone out, that is worth
revisiting.

**Rate limiting, send idempotency and Zod on write routes** are all still absent, and all were
on the parallel track.

## Deployments: done, minus one decision

Goal was: pushing to master builds, pushes and deploys to Cloud Run with no laptop involved.
Steps 1 to 4 below are **done**, proven by a real deploy on 20 August. Step 5 is a decision
rather than a task. Step 6 is still open and now costs almost nothing.

### Steps 1 to 4: done, 16 to 20 August

**Step 1, the build arguments.** `deploy.yml` passed three and needed seven. All seven are
passed now, and a preflight step refuses the build outright when any is unset. Without this the
image builds and deploys happily and nobody can sign in, which is the worst shape a bug has.

**Step 2, the repository variables.** All nine are set: `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA`
and the seven `NEXT_PUBLIC_*`. Every one is a public value; none is a secret, because each is
inlined into a bundle any visitor can download. The browser key is restricted by HTTP referrer
in `infra/terraform/identity.tf`, which is what actually protects it.

**Step 3, Workload Identity Federation.** Authenticated on its first ever use, 20 August. This
was expected to be where a problem showed, and it was not.

**Step 4, verify rather than assume.** Checked on the 20 August deploy: `/login` answered 200,
the `/_next/static/chunks/*.js` hashes had all changed from before the deploy, and `AIzaSy` was
still inlined in one of them. The whole daily bug hunt was then re-run against the new image and
came back green.

One part of step 4 was **not** done: nobody signed in through a browser. `/login` answering 200
and the key being present prove the build is capable of sign-in, not that the round trip to
Microsoft and back works on this revision. That is the one remaining unknown about the 20 August
deploy, and it takes a person about thirty seconds.

### Step 5: the push trigger, which is a decision

Adding `push: branches: [master]` to `deploy.yml` is now purely a policy call, since everything
it depends on works. It was removed deliberately in Phase B because a workflow that deploys on
every merge before it can succeed teaches people to ignore a failing check. That reason has
expired.

The reason to still say no is different: there is no staging environment and one Cloud SQL
instance, so a merge would reach the only database the product has without a person choosing the
moment. Manual dispatch costs one click and buys the choice of when. Worth revisiting once
either a staging service or the smoke check in step 6 exists, because a bad automatic deploy that
is detected in ninety seconds is a very different risk from one nobody notices.

### Step 6: a smoke check inside the deploy, still open

The daily sweep already curls `/login` at 06:17, but nothing checks the service immediately
**after** a deploy. A step at the end of `deploy.yml` that fetches `/login`, fails on anything
but 200, and greps a chunk for `AIzaSy` would close the window between shipping a broken image
and the next morning. It is the same two probes the bug hunt already runs, so the logic exists
and only needs to run in the other place. This is the cheapest remaining item on this page, and
it is the prerequisite that would make step 5 defensible.

### Then, if there is time

Terraform state is already in GCS as of 18 August, so that job is off this list. What replaced
it is item 3 above, and it is bigger: the stack cannot be applied at all right now without
taking sign-in down. Closing that is the prerequisite for any further infrastructure work.

## Things worth knowing before touching any of this

- **The gcloud CLI credential expires roughly hourly** on this account and cannot be renewed
  non-interactively. ADC keeps working much longer. `gcloud auth application-default
  print-access-token` is the fallback, and `CLOUDSDK_AUTH_ACCESS_TOKEN` makes gcloud itself use
  it.
- **`NEXT_PUBLIC_*` is a build-time value.** Setting it on Cloud Run reaches the server and
  never the browser. This caused two separate bugs today.
- **A registered cron is not evidence it ran.** Check the `CurationJob` row and its
  `Started by ...` log line. Every Cloud Scheduler job sends `?trigger=cloud-scheduler` for
  exactly this.
- **Supabase and Cloud SQL have diverged and no longer sync.** Cloud SQL is the live database.
