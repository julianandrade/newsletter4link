# Cloud Scheduler, replacing both of today's schedulers.
#
# The ported version of this file named three jobs, `daily-collection`,
# `weekly-finalize` and `weekly-send`. Only the first still exists. It was written
# against a `vercel.json` from June, and pointing Scheduler at the other two would have
# produced two jobs firing into 404s on a schedule, reported as healthy by Scheduler
# because a job's success is measured by getting a response.
#
# So this is rewritten from the two places that hold the truth today:
#
#   vercel.json                      daily-collection 08:00, weekly-proposal 09:30,
#                                    radar-collect 06:00, email-ingest 05:30
#   .github/workflows/curation.yml   daily-collection 09:07 and 21:07,
#                                    email-ingest 17:07
#
# Two schedulers exist only because Vercel Hobby caps a cron at once per day and a
# sub-daily expression fails the *build* rather than the run. Cloud Scheduler has no such
# cap, so the workaround workflow can be deleted in Phase E and both halves collapse into
# the map below. That also retires the `:07` offsets, which were dodging GitHub's
# contended top-of-hour queue, and the 09:07 firing that existed because Vercel's own
# 09:00 slot had never once landed.
#
# What this map deliberately does NOT do is take the opportunity to run things more
# often. `15 */4 * * *` on email-ingest is in this repo's history, so every four hours
# was once the intent, and Scheduler could now honour it. But daily-collection scores
# every article it finds through Anthropic, so cadence is spend, and tripling it is a
# decision with an invoice attached rather than a migration detail. Today's effective
# cadence is preserved exactly; raising it is a one-line change once someone chooses to.
#
# The jobs are LIVE as of Phase E, 15 August 2026. They were created paused, because an
# unpaused job would have started firing at Cloud Run the moment it existed, while Vercel was
# still the live site, which is two schedulers driving two databases.
#
# Unpausing was the second half of the cutover. The first half removed the Vercel crons and
# the GitHub Actions workflow, in that order, so the old schedulers stopped writing to Supabase
# before these started writing to Cloud SQL.

locals {
  # One job per route, with the hour list carrying what used to need two schedulers.
  # Times are the same wall-clock moments that fire today, in UTC.
  cron_jobs = {
    # 08:00 from Vercel, 21:00 from the workflow's evening firing. The workflow's
    # 09:07 is dropped rather than kept: it existed because the 08:00 slot was being
    # swallowed above the application, and Scheduler is not that platform.
    daily-collection = "0 8,21 * * *"

    # 05:30 from Vercel, 17:00 from the workflow's evening firing.
    email-ingest = "30 5,17 * * *"

    # Daily despite the name, and it does land today.
    weekly-proposal = "30 9 * * *"

    radar-collect = "0 6 * * *"
  }
}

resource "google_cloud_scheduler_job" "cron" {
  for_each = local.cron_jobs

  name = "${var.app_name}-${each.key}"

  project = var.project_id

  # Not var.region. Cloud Scheduler is limited to the older App Engine region set and Madrid
  # is not in it, which the first apply found the hard way. See var.scheduler_region.
  region = var.scheduler_region

  schedule  = each.value
  time_zone = "Etc/UTC"

  # Live. Set to true to stop every job without destroying it, which is the fastest way to
  # halt scheduled work if something is wrong: it leaves the definitions and the history alone.
  paused = false

  attempt_deadline = "320s" # routes set maxDuration 300s; give headroom

  retry_config {
    retry_count = 1
  }

  http_target {
    http_method = "GET"

    # `?trigger=` is read by daily-collection and written into its `CurationJob` log
    # line, and ignored harmlessly by the rest. It is what makes Phase E's audit
    # possible: CLAUDE.md records that a registered cron is not evidence it ran, that
    # Hobby keeps logs for an hour, and that a job nobody can see is indistinguishable
    # from one that never ran. A row saying `Started by cloud-scheduler` is the only
    # durable proof this scheduler works, and it costs one query parameter.
    uri = "${local.effective_app_url}/api/cron/${each.key}?trigger=cloud-scheduler"

    # The shared secret travels in the header because Scheduler cannot read Secret
    # Manager for header values; its supported mechanism is OIDC/OAuth against a Google
    # audience, which is not this app's scheme. Hence the duplicated `cron_secret`
    # variable, which must equal the `cron-secret` secret's value byte for byte.
    headers = {
      "Authorization" = "Bearer ${var.cron_secret}"
    }
  }

  depends_on = [google_project_service.apis]
}
