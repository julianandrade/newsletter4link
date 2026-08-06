import { isoWeekAndYear, weekLabel } from "@/lib/radar/week";

/**
 * RQ-008: what identifies an edition, in one place.
 *
 * An edition used to be identified by `week` and `year`, with a unique index over the
 * pair, and that made two things impossible: a second edition inside one week, and an
 * edition with a name of its own. Both were asked for on 6 August 2026.
 *
 * `publishDate` is the identity now. `week` and `year` survive as a derived cache so the
 * forty-odd screens and routes that read `edition.week` keep working, and they are
 * written here and nowhere else: a caller that sets them by hand is how the cache and
 * the date drift apart.
 *
 * `weeklySlot` carries the uniqueness the index used to. A weekly edition holds
 * "2026-W32"; a special holds null. Postgres treats nulls in a unique index as distinct,
 * so one week has exactly one weekly and as many specials as anyone wants, with no
 * partial index and no application-level lock.
 */

export type EditionKind = "WEEKLY" | "SPECIAL";

/**
 * The slot string for an ISO week, zero padded so slots sort lexically.
 *
 * Padded on purpose: "2026-W9" sorts after "2026-W10" as a string, and this value ends
 * up in ORDER BY clauses and in log lines where that would read as a bug.
 */
export function weeklySlotFor(week: number, year: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** The week and year in a slot, or null when the string is not one. */
export function parseWeeklySlot(slot: string): { week: number; year: number } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(slot);
  if (!match) return null;

  const year = Number(match[1]);
  const week = Number(match[2]);

  // 1 to 53, because ISO years have 52 or 53 weeks and never a week 0.
  if (week < 1 || week > 53) return null;

  return { week, year };
}

export interface EditionWriteFields {
  publishDate: Date;
  /** Derived. Never set by a caller. */
  week: number;
  /** The ISO week-year, derived. Not always the calendar year of publishDate. */
  year: number;
  /** The slot on a weekly edition, null on anything else. */
  weeklySlot: string | null;
  kind: EditionKind;
}

/**
 * Every column an edition write has to set, from the two facts a caller actually has.
 *
 * The week comes from `isoWeekAndYear`, which returns the week and the ISO week-year
 * together and never apart: 1 January 2027 belongs to week 53 of week-year 2026, and
 * pairing a week number with `getFullYear()` is the bug that helper exists to prevent.
 */
export function editionWriteFields(input: {
  publishDate: Date;
  kind: EditionKind;
}): EditionWriteFields {
  const { week, year } = isoWeekAndYear(input.publishDate);

  return {
    publishDate: input.publishDate,
    week,
    year,
    weeklySlot: input.kind === "WEEKLY" ? weeklySlotFor(week, year) : null,
    kind: input.kind,
  };
}

/**
 * What a screen calls this edition.
 *
 * The title when it has one, and the week label when it does not, so nothing had to be
 * named during the backfill and a weekly edition keeps reading the way it always did.
 */
export function editionLabel(edition: {
  title: string | null;
  week: number;
  year: number;
}): string {
  const trimmed = edition.title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : weekLabel(edition.week, edition.year);
}

/**
 * What the email calls this edition.
 *
 * Deliberately not `editionLabel`. That one returns "Week 32 · 2026" and forty-odd screens
 * read it, but the email masthead concatenates the label with a date, so a label carrying the
 * year printed it twice: "WEEK 31 · 2026 · 2026". The year belongs to the date, so this drops
 * it and `weekRangeLabel` supplies it once.
 *
 * Two functions rather than one changed function, because changing `editionLabel` would mean
 * auditing every screen that reads it to find which ones also print a date.
 */
export function editionEmailLabel(edition: {
  title: string | null;
  week: number;
}): string {
  const trimmed = edition.title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : `Week ${edition.week}`;
}
