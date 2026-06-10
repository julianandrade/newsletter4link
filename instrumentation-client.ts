import * as Sentry from "@sentry/nextjs";

// Client-side Sentry init. No-op unless NEXT_PUBLIC_SENTRY_DSN is configured.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
    // Session Replay is opt-in; leave disabled by default
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}

// Capture client-side navigation for tracing (App Router)
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
