# Status

> Last updated: 15 August 2026, end of the GCP migration.
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

**Rollback** is still free: Supabase is untouched and holds every row, and the Vercel project
is still deployable. Tag `pre-gcp-migration` at `48a53d2` is the pre-migration commit. The
intent was to keep both alive for a week, so until **22 August**.

## Unfinished

### 1. Deployments are manual. This is tomorrow's job, see below.

`.github/workflows/deploy.yml` is `workflow_dispatch` only, and **it is currently a trap**: it
does not pass the four `NEXT_PUBLIC_GCIP_*` build arguments, so a build from CI would produce
an image whose browser bundle falls back to Supabase auth and cannot sign anyone in. Do not
press "Run workflow" before fixing that. Every deployment so far has been a `docker build` from
a laptop.

### 2. Terraform state lives on one laptop, and it holds the database password

`infra/terraform/terraform.tfstate` is local and gitignored. If that machine dies, the state is
gone and the project has to be imported resource by resource. `versions.tf` carries a
commented-out GCS backend for exactly this. **This is the highest-value small task after
deployments**, and it is about twenty minutes.

### 3. Media: 33 of 39 objects restored from the repository, 6 remain

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

### 4. Two of three members are not relinked

Identity Platform issues different subject ids than Supabase. Only
`julian.andrade@linkconsulting.com` has been repointed. `pedro.samorrinha@linkconsulting.com`
and `test@example.com` still hold Supabase ids, so Pedro lands in onboarding on first sign-in.

Fix: have him sign in once, then run `npx tsx scripts/relink-identities.ts`. It matches on the
email **local part**, deliberately, because the company is moving from `linkconsulting.com` to
`linkroad.com` and Identity Platform already returns the new domain while `OrgUser` holds the
old one. Point `DATABASE_URL` at Cloud SQL first.

### 5. No custom domain

The app lives on its `run.app` URL. Mapping a domain is a Cloud Run domain mapping plus a DNS
record, and it also means adding the new origin to Identity Platform's authorized domains and
to the browser API key's referrer list. Both are in `infra/terraform/identity.tf`.

### 6. The Supabase project is still needed, for now

It holds the media objects and is the rollback. Once those are copied and the week is up, it
can be downgraded or deleted, which also ends whatever the egress restriction is costing.

## Ideas for improvement, roughly by value

**Nothing watches anything.** There is no alerting. If Cloud Run starts erroring, or a
Scheduler job fails every night, the first sign will be a person noticing. Cloud Monitoring
alerts on Cloud Run 5xx rate and on Scheduler job failures are cheap and would close the
biggest gap in operability. Sentry was on the parallel track and is still not a dependency.

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

## Tomorrow: make deployments automatic

Goal: pushing to master builds, pushes and deploys to Cloud Run, with no laptop involved.

The infrastructure for this already exists and is applied. Workload Identity Federation, the
deployer service account and Artifact Registry were created in Phase B and have never been
used, because every deploy so far was manual. So tomorrow is mostly wiring and proving, not
building.

### Step 1: fix the workflow's build arguments, first and before anything else

`deploy.yml` passes three build arguments and needs seven. Add:

```
--build-arg NEXT_PUBLIC_GCIP_API_KEY="${{ vars.NEXT_PUBLIC_GCIP_API_KEY }}"
--build-arg NEXT_PUBLIC_GCIP_PROJECT_ID="${{ vars.NEXT_PUBLIC_GCIP_PROJECT_ID }}"
--build-arg NEXT_PUBLIC_GCIP_AUTH_DOMAIN="${{ vars.NEXT_PUBLIC_GCIP_AUTH_DOMAIN }}"
--build-arg NEXT_PUBLIC_ENTRA_TENANT_ID="${{ vars.NEXT_PUBLIC_ENTRA_TENANT_ID }}"
```

Without these the image builds and deploys happily and nobody can sign in, which is the worst
shape a bug can have.

### Step 2: set the GitHub repository variables

Settings, Secrets and variables, Actions, Variables. All seven are public values; none is a
secret.

| Variable | Where to get it |
|---|---|
| `GCP_WIF_PROVIDER` | `terraform output wif_provider` |
| `GCP_DEPLOYER_SA` | `terraform output deployer_sa` |
| `NEXT_PUBLIC_SUPABASE_URL` | current Vercel production value |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | current Vercel production value |
| `NEXT_PUBLIC_APP_URL` | `https://newsletter4link-rtbko5uyza-no.a.run.app` |
| `NEXT_PUBLIC_GCIP_API_KEY` | `terraform output gcip_api_key` |
| `NEXT_PUBLIC_GCIP_PROJECT_ID` | `newsletter-link-ai-radar` |
| `NEXT_PUBLIC_GCIP_AUTH_DOMAIN` | `newsletter-link-ai-radar.firebaseapp.com` |
| `NEXT_PUBLIC_ENTRA_TENANT_ID` | `7df72313-91ad-497c-aff0-6786830b8734` |

### Step 3: prove Workload Identity Federation works, manually

Run the workflow with `workflow_dispatch` while it is still manual-only. This is the step that
either works or fails in an interesting way, since WIF has never authenticated once. Expect the
auth step to be where a problem shows.

### Step 4: verify the deployed image, do not assume it

Two checks, both of which caught real bugs today:

1. Fetch `/login` on the deployed service and grep the JavaScript chunks for `AIzaSy`. If the
   key is absent, the build arguments did not arrive and sign-in is broken.
2. Sign in, in a browser. `/login` returning 200 proves nothing about whether anyone can get in.

### Step 5: only then, add the push trigger

Add `push: branches: [master]` back to `deploy.yml`. It was removed deliberately in Phase B,
because a workflow that deploys on every merge before it can succeed teaches people to ignore
a failing check.

### Step 6: consider a smoke check after deploy

A step that curls `/login` and fails the job on anything but 200 would have caught two of
today's problems before a human did.

### Then, if there is time

Migrate Terraform state to GCS, which is item 2 above and about twenty minutes:

```
gcloud storage buckets create gs://newsletter-link-ai-radar-tfstate \
  --project=newsletter-link-ai-radar --location=europe-southwest1 \
  --uniform-bucket-level-access
# uncomment the backend block in versions.tf
terraform init -migrate-state
```

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
