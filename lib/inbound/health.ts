/**
 * RQ-007 step 3: is an EMAIL source still arriving?
 *
 * A feed announces its own failure: the fetch returns an error and `lastError` carries it.
 * An email source cannot. Nobody tells you that a subscription lapsed, that the sender
 * changed its From address, or that a filter started eating the mail. The only signal is
 * silence, and silence looks exactly like a newsletter that has not published this week.
 *
 * So the warning is relative to what the source itself claims. Three times the expected
 * cadence is late enough that a weekly newsletter has missed three issues, which is no
 * longer a quiet fortnight.
 */

/** How silent a source is allowed to be before it is worth looking at. */
export const SILENCE_CADENCE_MULTIPLIER = 3;

export type SourceHealth =
  /** Arriving as expected, or too new to judge. */
  | { state: "ok"; daysSince: number | null }
  /** Configured but nothing has ever arrived. */
  | { state: "never"; daysSince: null }
  /** Silent for longer than the cadence allows. */
  | { state: "silent"; daysSince: number; expectedWithinDays: number }
  /** Receiving, but no cadence was declared, so silence cannot be judged. */
  | { state: "unknown-cadence"; daysSince: number };

export interface HealthInput {
  lastReceivedAt: Date | string | null;
  expectedCadenceDays: number | null;
  createdAt?: Date | string | null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * The health of one EMAIL source.
 *
 * A source that has never received is only reported as `never` once it has had a fair
 * chance. Judging it from `createdAt` rather than immediately matters because creating the
 * source is the *first* step: the subscription is confirmed afterwards, and a source flagged
 * red the second it is saved trains people to ignore the flag.
 */
export function sourceHealth(source: HealthInput, now: Date = new Date()): SourceHealth {
  const lastReceivedAt = toDate(source.lastReceivedAt);
  const cadence =
    typeof source.expectedCadenceDays === "number" && source.expectedCadenceDays > 0
      ? source.expectedCadenceDays
      : null;

  if (!lastReceivedAt) {
    const createdAt = toDate(source.createdAt);
    const grace = (cadence ?? 7) * SILENCE_CADENCE_MULTIPLIER;

    if (createdAt && wholeDaysBetween(createdAt, now) < grace) {
      return { state: "ok", daysSince: null };
    }

    return { state: "never", daysSince: null };
  }

  const daysSince = Math.max(0, wholeDaysBetween(lastReceivedAt, now));

  if (cadence === null) return { state: "unknown-cadence", daysSince };

  const expectedWithinDays = cadence * SILENCE_CADENCE_MULTIPLIER;

  if (daysSince > expectedWithinDays) {
    return { state: "silent", daysSince, expectedWithinDays };
  }

  return { state: "ok", daysSince };
}

/** One line a person can act on, or null when there is nothing to say. */
export function healthWarning(health: SourceHealth, sourceName: string): string | null {
  switch (health.state) {
    case "never":
      return `${sourceName} has never received an email. Check the subscription was confirmed and that the sender address matches exactly.`;
    case "silent":
      return `${sourceName} has been silent for ${health.daysSince} days, past the ${health.expectedWithinDays} its cadence allows.`;
    case "unknown-cadence":
    case "ok":
      return null;
  }
}
