import * as Sentry from "@sentry/nextjs";

// Server-side Sentry init. No-op unless SENTRY_DSN is configured, so local
// and CI runs are unaffected.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Sample 10% of transactions in production, all in development
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // This app handles subscriber emails/PII - never send it to Sentry
    sendDefaultPii: false,
  });
}
