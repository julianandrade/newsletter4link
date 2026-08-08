/**
 * Records that an aside actually went out.
 *
 * Called where the sent snapshot is frozen, not where the aside is chosen, so browsing the
 * picker never changes the ordering. `asidePickerQuery` orders on `lastUsedAt`, and if a
 * preview burned it the list would reshuffle under an editor who had picked nothing.
 *
 * An increment rather than a read followed by a write, so two sends of two editions
 * carrying the same aside cannot lose a count between them.
 *
 * It swallows its own failure on purpose. By the time this runs the mail has already
 * reached Resend, and a rejected promise here would surface to the editor as a failed send
 * that in fact succeeded. The error is logged, so it is not silent.
 */

import type { TenantClient } from "@/lib/db/tenant";

export async function markAsideUsed(
  db: TenantClient,
  asideId: string | null | undefined
): Promise<void> {
  if (!asideId) return;

  try {
    await db.aside.update({
      where: { id: asideId },
      data: { lastUsedAt: new Date(), useCount: { increment: 1 } },
    });
  } catch (error) {
    console.error("Failed to mark aside as used", { asideId, error });
  }
}
