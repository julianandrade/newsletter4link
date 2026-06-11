/**
 * Newsletter subject line builder.
 *
 * The subject used to be a fixed "Link AI Newsletter - Week N, YYYY" every
 * week, which gives subscribers no reason to open. Lead with the top story
 * instead, falling back to the generic form when there are no articles.
 */

interface SubjectData {
  week: number;
  year: number;
  articles: Array<{ title: string }>;
}

const MAX_SUBJECT_LENGTH = 78;

export function buildNewsletterSubject(data: SubjectData): string {
  const fallback = `Link AI Newsletter — Week ${data.week}, ${data.year}`;
  const topTitle = data.articles?.[0]?.title?.trim();
  if (!topTitle) return fallback;

  const prefix = "AI Radar: ";
  const suffix = " & more";
  const budget = MAX_SUBJECT_LENGTH - prefix.length - suffix.length;

  const title =
    topTitle.length <= budget ? topTitle : `${topTitle.slice(0, budget - 1).trimEnd()}…`;

  return data.articles.length > 1
    ? `${prefix}${title}${suffix}`
    : `${prefix}${title}`;
}

export function buildTestSubject(data: SubjectData): string {
  return `[TEST] ${buildNewsletterSubject(data)}`;
}
