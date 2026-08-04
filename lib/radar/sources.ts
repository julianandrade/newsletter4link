/**
 * RQ-004 phase A: the two upstream sources, and nothing else.
 *
 * Both return a count for a query over a day. Neither returns articles: Hacker
 * News is already an RSS source feeding the curation pipeline, and this is a
 * different job. Here the question is "how often was this entity mentioned on that
 * day", which is a measurement, not content.
 *
 * Forward-only. There is no backfill, by decision (SCOPE-REVISION, 4 August 2026):
 * collection starts today and the radar says nothing until it has six weeks of
 * baseline. That is the cost of not scraping a year of someone else's archive.
 */

export interface DayWindow {
  /** Midnight UTC of the day to count. */
  date: Date;
}

export interface CountResult {
  count: number;
  /** Exactly what was asked, so a series can be audited after a query changes. */
  query: string;
}

export class SourceUnavailable extends Error {
  constructor(
    readonly source: "HN" | "ARXIV",
    message: string
  ) {
    super(message);
    this.name = "SourceUnavailable";
  }
}

/**
 * Every arXiv query is confined to the computing categories, centrally, so it
 * cannot be forgotten on a watchlist entry.
 *
 * Measured, not assumed. Two things came out of sampling the real API:
 *
 * 1. A quoted multi-word phrase in `all:` is not a phrase match. `all:"Mistral AI"`
 *    returned papers with no mention of Mistral at all, because "AI" appears in
 *    almost every abstract in the corpus, so adding it as a disambiguator made the
 *    query worse rather than better.
 * 2. Single distinctive tokens work, but arXiv spans every science. `all:Mistral`
 *    returns the MISTRAL spectrometer from nuclear physics and an AGN wind model;
 *    `all:Gemini` returns astronomy.
 *
 * The category constraint fixes both, and it is the disambiguator a generic word
 * like "AI" pretended to be. A control query of nonsense returns nothing, so the
 * API does respect what it is asked: the earlier noise was the query's fault.
 */
export const ARXIV_CATEGORIES = "(cat:cs.AI OR cat:cs.CL OR cat:cs.LG)";

/** Seconds between requests each source asks for, and we honour. */
export const RATE_LIMIT_MS = {
  // Algolia's HN API is generous; one per second is courteous and plenty.
  HN: 1_000,
  // arXiv's terms of use ask for one request every three seconds.
  ARXIV: 3_000,
} as const;

export const dayBounds = (date: Date) => {
  const start = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );

  return { startSeconds: Math.floor(start / 1000), endSeconds: Math.floor(start / 1000) + 86_400 };
};

/** Midnight UTC of the day `date` falls in. */
export const utcDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

async function fetchWithTimeout(
  url: string,
  source: "HN" | "ARXIV",
  timeoutMs = 20_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Identifying the caller is both the courteous and the defensible choice,
        // and both APIs are within their rights to block an anonymous scraper.
        "User-Agent":
          "newsletter4link-radar/1.0 (+https://newsletter4link.vercel.app; julian.andrade@linkconsulting.com)",
      },
    });

    if (!response.ok) {
      throw new SourceUnavailable(source, `HTTP ${response.status}`);
    }

    return response;
  } catch (error) {
    if (error instanceof SourceUnavailable) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SourceUnavailable(source, `timed out after ${timeoutMs}ms`);
    }
    throw new SourceUnavailable(
      source,
      error instanceof Error ? error.message : "unknown error"
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How many Hacker News items matching `query` were created on that day.
 *
 * Uses the Algolia search endpoint's `nbHits`, which is the total for the filter
 * rather than the size of the page returned, so `hitsPerPage=0` is enough and no
 * results are transferred.
 *
 * `query` is passed through as written. It is the validated query from the entity,
 * not a name: quoting and OR-ing are how "MCP" stops meaning Minecraft Coder Pack.
 */
export async function countHackerNews(
  query: string,
  window: DayWindow
): Promise<CountResult> {
  const { startSeconds, endSeconds } = dayBounds(window.date);

  const url =
    "https://hn.algolia.com/api/v1/search?" +
    new URLSearchParams({
      query,
      hitsPerPage: "0",
      /**
       * Stories, not comments, and stated rather than implied.
       *
       * Measured on 3 August 2026 for the query "agentic": 78 stories, 361 comments,
       * 441 in total. Counting comments would let one popular thread swamp a week of
       * signal, so the count is stories and the volume it measures is "how often was
       * this posted about", not "how much was said".
       *
       * The field restriction alone already produced 78, because comments carry no
       * title or story_text and so cannot match. That is an accident of the index
       * rather than a stated intent, hence `tags` as well: if Algolia ever indexes
       * comments differently, this query still means what it says. It also excludes a
       * story matched on some other field, such as an author whose name contains the
       * query, which is not a mention.
       */
      tags: "story",
      restrictSearchableAttributes: "title,story_text",
      numericFilters: `created_at_i>=${startSeconds},created_at_i<${endSeconds}`,
    });

  const response = await fetchWithTimeout(url, "HN");
  const body = (await response.json()) as { nbHits?: number };

  if (typeof body.nbHits !== "number") {
    throw new SourceUnavailable("HN", "response had no nbHits");
  }

  return { count: body.nbHits, query };
}

/**
 * How many arXiv papers matching `query` were submitted on that day.
 *
 * The API returns Atom, and the only field needed is `opensearch:totalResults`, so
 * `max_results=0` keeps the payload to the header. Query syntax is arXiv's own:
 * `all:"model context protocol"`, with the quotes, which is what makes it a phrase
 * rather than three common words.
 */
export async function countArxiv(
  query: string,
  window: DayWindow
): Promise<CountResult> {
  const day = utcDay(window.date);
  const yyyymmdd = (value: Date) =>
    `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(
      value.getUTCDate()
    ).padStart(2, "0")}`;

  // submittedDate is inclusive at both ends, so one day is 0000 to 2359 of that
  // same day. Ending at the next day's 0000 would count a midnight submission
  // twice, once on each day.
  const stamp = yyyymmdd(day);
  const ranged =
    `(${query}) AND ${ARXIV_CATEGORIES} ` +
    `AND submittedDate:[${stamp}0000 TO ${stamp}2359]`;

  const url =
    "https://export.arxiv.org/api/query?" +
    new URLSearchParams({
      search_query: ranged,
      start: "0",
      max_results: "1",
    });

  const response = await fetchWithTimeout(url, "ARXIV");
  const xml = await response.text();

  const match = xml.match(
    /<opensearch:totalResults[^>]*>(\d+)<\/opensearch:totalResults>/
  );

  if (!match) {
    throw new SourceUnavailable("ARXIV", "response had no totalResults");
  }

  // The effective query, not the entity's fragment: a stored point has to be able
  // to say what was actually asked, and the categories and the window are part of
  // that.
  return { count: Number(match[1]), query: ranged };
}

/** Sample hits for a query, for measuring precision by reading them. */
export async function sampleHackerNews(
  query: string,
  limit = 20
): Promise<Array<{ title: string; url: string | null; createdAt: string }>> {
  const url =
    "https://hn.algolia.com/api/v1/search?" +
    new URLSearchParams({
      query,
      hitsPerPage: String(limit),
      // The same population the count uses, or precision is measured on one set of
      // items and collected from another.
      tags: "story",
      restrictSearchableAttributes: "title,story_text",
    });

  const response = await fetchWithTimeout(url, "HN");
  const body = (await response.json()) as {
    hits?: Array<{ title?: string; story_title?: string; url?: string; created_at?: string }>;
  };

  return (body.hits ?? []).map((hit) => ({
    title: hit.title ?? hit.story_title ?? "(no title)",
    url: hit.url ?? null,
    createdAt: hit.created_at ?? "",
  }));
}

export async function sampleArxiv(
  query: string,
  limit = 20
): Promise<
  Array<{ title: string; url: string | null; createdAt: string; summary: string }>
> {
  const url =
    "https://export.arxiv.org/api/query?" +
    new URLSearchParams({
      // The same confinement the count uses, or precision would be measured on a
      // different population from the one collected.
      search_query: `(${query}) AND ${ARXIV_CATEGORIES}`,
      start: "0",
      max_results: String(limit),
    });

  const response = await fetchWithTimeout(url, "ARXIV");
  const xml = await response.text();

  const entries = xml.split("<entry>").slice(1);

  return entries.map((entry) => {
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "(no title)";
    const link = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? null;
    const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] ?? "";
    // The abstract matters for validation: an `abs:` query matches the abstract, and
    // judging such a hit by its title alone rejects a real mention whenever the title
    // does not happen to name the entity.
    const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] ?? "";

    return {
      title: title.replace(/\s+/g, " ").trim(),
      url: link,
      createdAt: published,
      summary: summary.replace(/\s+/g, " ").trim(),
    };
  });
}
