import * as Sentry from "@sentry/nextjs";

// Edge runtime Sentry init (middleware, edge routes). No-op unless
// SENTRY_DSN is configured.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
  });
}
