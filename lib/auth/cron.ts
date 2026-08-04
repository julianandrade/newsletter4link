import { config } from "@/lib/config";

/**
 * Authorization for scheduled routes, failing closed.
 *
 * Every cron route in this repository carried the same shape:
 *
 *     if (config.cron.secret) {
 *       if (authHeader !== `Bearer ${config.cron.secret}`) return 401;
 *     }
 *
 * The guard only existed when the secret existed. CRON_SECRET is not set in
 * production, so the check was skipped and every scheduled route was publicly
 * callable. One of them finalized an edition and sent the newsletter to every
 * subscriber, which made an unauthenticated send-to-all reachable by anyone who
 * knew the path.
 *
 * A missing secret is now a refusal, not a bypass. The cost is that a scheduled
 * route stops running until CRON_SECRET is configured, which is the correct
 * failure: a job that does not run is visible, a job anyone can trigger is not.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on its own cron invocations
 * when the variable is set on the project, so configuring it is the whole setup.
 */
export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

export function authorizeCron(request: Request): CronAuthResult {
  const secret = config.cron.secret;

  if (!secret) {
    // Not 401: the caller did nothing wrong and no credential would help. The
    // service is misconfigured, and saying so is what gets it fixed.
    return {
      ok: false,
      status: 503,
      error:
        "Scheduled routes are disabled: CRON_SECRET is not configured for this deployment",
    };
  }

  const header = request.headers.get("authorization");

  if (header !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  return { ok: true };
}
