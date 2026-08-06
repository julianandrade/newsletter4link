/**
 * RQ-007: which of this deployment's addresses a run may call to hand work over.
 *
 * A pure function with the environment passed in, because the choice is a contract worth
 * testing rather than a preference buried in a route: getting it wrong produces a handover
 * that never arrives and says nothing about it.
 *
 * **`VERCEL_URL` is deliberately not used.** It is the deployment's own hostname, which
 * looked like the right target because the child would then run the same build as its
 * parent. It cannot work: deployment URLs sit behind Vercel's deployment protection, and a
 * request to one answers **302** to an SSO page rather than reaching the route. Measured on
 * 7 August 2026, which is why the first handover fired into nothing.
 *
 * The production alias is the right target and costs nothing in practice: it points at the
 * current deployment, which is the parent's own build in every case that matters.
 */
export function selfOrigin(env: Record<string, string | undefined>): string | null {
  // Vercel's own production domain, which is not protected.
  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  // The application's configured public address, set on this project.
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  return null;
}

/**
 * Whether a handover response means the child accepted the work.
 *
 * A separate function because the failure it catches was invisible: the first version
 * awaited the fetch inside a try and logged only thrown errors, so a 302 to an SSO page
 * counted as success and the chain died silently. A response arriving is not the same as a
 * child accepting.
 */
export function handoverAccepted(status: number): boolean {
  return status >= 200 && status < 300;
}
