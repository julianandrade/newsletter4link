import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// Only apply the Sentry build plugin when a DSN is configured, so builds
// without Sentry (local, CI) behave exactly as before.
export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      // Suppress build-time logs except in CI
      silent: !process.env.CI,
      widenClientFileUpload: true,
      // Only upload source maps when an auth token is available
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
    })
  : nextConfig;
