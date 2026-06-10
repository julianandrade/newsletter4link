import * as Sentry from "@sentry/nextjs";

/**
 * Report a caught error to Sentry (no-op if Sentry isn't configured) and
 * log it locally. Use in catch blocks for unattended/critical paths
 * (cron jobs, email sends) where a thrown error is swallowed by a 500
 * response and would otherwise go unnoticed.
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  console.error("[reportError]", error, context ?? "");
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
