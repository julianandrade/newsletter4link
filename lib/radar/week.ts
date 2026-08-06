/**
 * RQ-005 AC-1.8: one answer to "which week is it", for the whole product.
 *
 * Eight copies of a `getWeekNumber` existed across the email, generation and query
 * modules, and every one of them returned the week number alone. The caller then
 * paired it with `date.getFullYear()`, which is where editions get filed under the
 * wrong year: ISO 8601 puts 31 December 2026 and 1 January 2027 in the same week,
 * week 53 of week-year 2026. Around a new year two routes disagree about which
 * edition they are looking at, and the disagreement is silent. One of those callers
 * decides which edition a send targets.
 *
 * The week and the year are therefore returned together and never computed apart.
 *
 * All arithmetic is UTC. A week boundary read in local time drifts by a day for
 * anyone east or west of the server, and this value ends up in a unique key.
 */

const MS_PER_DAY = 86_400_000;

export interface IsoWeek {
  /** ISO 8601 week number, 1 to 53. */
  week: number;
  /** ISO week-year, which is not always the calendar year of `date`. */
  year: number;
}

/** ISO weekday, Monday 1 through Sunday 7, rather than JavaScript's Sunday 0. */
function isoWeekday(date: Date): number {
  return date.getUTCDay() || 7;
}

/**
 * The ISO week and week-year containing `date`, defaulting to now.
 *
 * ISO 8601 assigns a week to the year containing its Thursday, so the algorithm
 * shifts to that Thursday first and reads the year from there.
 */
export function isoWeekAndYear(date: Date = new Date()): IsoWeek {
  const thursday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

  thursday.setUTCDate(thursday.getUTCDate() + 4 - isoWeekday(thursday));

  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - jan1) / MS_PER_DAY + 1) / 7);

  return { week, year };
}

/**
 * Monday 00:00:00.000 UTC of the given ISO week.
 *
 * Anchored on 4 January, which ISO 8601 guarantees falls in week 1 of its own
 * week-year. Counting back to that week's Monday can land in December of the
 * previous calendar year, which is correct and is why the anchor is not 1 January.
 *
 * A week outside 1 to 53 is not rejected: the arithmetic stays consistent and
 * rolls into the neighbouring year, which is more useful than throwing at a
 * caller that computed the week from a real date.
 */
export function isoWeekStart(week: number, year: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week1Monday = jan4.getTime() - (isoWeekday(jan4) - 1) * MS_PER_DAY;

  return new Date(week1Monday + (week - 1) * 7 * MS_PER_DAY);
}

/** Sunday 23:59:59.999 UTC of the given ISO week, for a range's exclusive end. */
export function isoWeekEnd(week: number, year: number): Date {
  return new Date(isoWeekStart(week, year).getTime() + 7 * MS_PER_DAY - 1);
}

/** Display form, as in "Week 32 · 2026". */
export function weekLabel(week: number, year: number): string {
  return `Week ${week} · ${year}`;
}

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * The week's date range, as in "3-9 Aug 2026".
 *
 * The email masthead used to read "WEEK 31 · 2026 · 2026", because the edition label already
 * carried the year and the date label carried it again. The year belongs to the date and now
 * appears once, which is what this produces.
 *
 * The trailing year is the year the range *ends* in, not the ISO week-year: week 1 of 2026
 * starts on 29 December 2025, and a reader looking at that line wants to see 2026.
 *
 * All arithmetic stays UTC, because `isoWeekStart` is UTC and reading it back through a
 * local-time getter shifts the day for anyone east or west of the server.
 */
export function weekRangeLabel(week: number, year: number): string {
  const start = isoWeekStart(week, year);
  const end = isoWeekEnd(week, year);

  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startMonth = MONTH_ABBREVIATIONS[start.getUTCMonth()];
  const endMonth = MONTH_ABBREVIATIONS[end.getUTCMonth()];
  const endYear = end.getUTCFullYear();

  if (startMonth === endMonth && start.getUTCFullYear() === endYear) {
    return `${startDay}-${endDay} ${startMonth} ${endYear}`;
  }

  return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${endYear}`;
}
