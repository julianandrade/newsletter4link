import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook - runs once when the server starts.
 * Validates required environment variables so misconfiguration fails
 * loudly at boot instead of surfacing as runtime errors mid-request,
 * and initializes Sentry for the active runtime.
 */
export async function register() {
  // Skip validation during `next build` (env vars live in the deployment runtime)
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { validateConfig } = await import("@/lib/config");
    validateConfig();
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture errors thrown in nested React Server Components / route handlers
export const onRequestError = Sentry.captureRequestError;
