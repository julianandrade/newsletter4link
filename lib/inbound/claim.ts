import { prisma } from "@/lib/db";

/**
 * RQ-007: one run's exclusive hold on one email, and the clock that ends a run.
 *
 * A run and a manual trigger can overlap, and a chained run can start while a stale
 * invocation is still finishing. Without a claim they would both extract the same
 * newsletter, pay twice for it, and race to write its row.
 */

/**
 * How long a claim is honoured before another run may take the row.
 *
 * Longer than the 300-second function ceiling on purpose: a lease that expires while its
 * owner is still working is worse than no lease, because it produces the double
 * processing it exists to prevent.
 */
export const CLAIM_LEASE_MS = 600_000;

/** Claims at or before this instant are stale and may be taken. */
export function claimCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - CLAIM_LEASE_MS);
}

/**
 * Whether a run is out of time.
 *
 * True at the deadline rather than past it: starting an email costs 20 to 25 seconds of
 * extraction before anything is written, so the last moment to start is well before the
 * last moment available.
 *
 * No deadline means no stopping, which is the manual case: a person triggering this by
 * hand wants the work done, and their own client timeout is the only limit that applies.
 */
export function shouldStop(deadline: number | undefined, now: number = Date.now()): boolean {
  if (deadline === undefined) return false;
  return now >= deadline;
}

/**
 * Take one email, or find that somebody else already has it.
 *
 * A compare and swap, not a read then write: `updateMany` with the expected status and an
 * absent or expired claim in the `where` is atomic in Postgres, and the returned count is
 * the answer. A read followed by a write would leave a window between them exactly wide
 * enough for the second run to pass the same check.
 */
export async function claimEmail(id: string, now: Date = new Date()): Promise<boolean> {
  const claimed = await prisma.inboundEmail.updateMany({
    where: {
      id,
      status: "RECEIVED",
      OR: [{ claimedAt: null }, { claimedAt: { lte: claimCutoff(now) } }],
    },
    data: { claimedAt: now },
  });

  return claimed.count === 1;
}
