/**
 * Next.js instrumentation hook - runs once when the server starts.
 * Validates required environment variables so misconfiguration fails
 * loudly at boot instead of surfacing as runtime errors mid-request.
 */
export async function register() {
  // Skip during `next build` (env vars live in the deployment runtime)
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { validateConfig } = await import("@/lib/config");
    validateConfig();
  }
}
