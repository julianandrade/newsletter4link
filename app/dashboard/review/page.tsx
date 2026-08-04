import { redirect } from "next/navigation";

/**
 * RQ-005 action 4, AC-4.1 and AC-4.3: the review queue is no longer a screen.
 *
 * It showed the same list of articles as the Feed, from the same
 * pending-articles query, so working one silently emptied the other (BR-012).
 * The queue is now a view of the proposal screen. This route survives so an old
 * bookmark still works and lands with the queue filter applied.
 *
 * The screen itself moved to `components/proposal/queue-view.tsx` intact: every
 * capability it had is still there (AC-4.6).
 */
export default function ReviewQueueRedirect(): never {
  redirect("/dashboard?view=queue");
}
