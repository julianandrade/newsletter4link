/**
 * The article taxonomy, and the only place it is written down.
 *
 * `categorizeArticle` supplied this list in its prompt and then accepted whatever
 * came back. Of 1297 categorised articles, 31 distinct stored values are not in the
 * list: "2026", "reporting", "display sizes", "Snapdragon 8 Elite chip", "phone
 * specifications", and worse, fragments of prose. Where the article was not about
 * AI at all, and plenty are not, the model refused in a sentence and the sentence
 * was split on commas and stored as categories, which is where "Based on the title
 * and content provided" and "However" came from. Nothing checked.
 *
 * It matters beyond tidiness. RQ-004 scopes a watchlist by topic, and a radar
 * focused on topics cannot be built on a field that accepts any string.
 *
 * `UNPLACED` is part of the taxonomy rather than an escape from it. It is what the
 * categoriser returns when it cannot place an article or when the call fails, and
 * it is already the value on rows written before this module existed, so it stays
 * spelled the way they spell it.
 */

export const UNPLACED = "AI News";

export const ARTICLE_CATEGORIES = [
  "Machine Learning",
  "Natural Language Processing",
  "Computer Vision",
  "AI Research",
  "AI Applications",
  "AI Ethics",
  "AI Regulation",
  "Large Language Models",
  "Robotics",
  "Autonomous Systems",
  "AI Business",
  "AI Tools",
  "Data Science",
  "Cloud AI",
  "Edge AI",
  UNPLACED,
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

export const MAX_CATEGORIES_PER_ARTICLE = 3;

/** Case and spacing are normalized away: the model returns "cloud ai" often
 *  enough that rejecting it would throw away a correct answer over its casing. */
const BY_NORMALIZED = new Map<string, ArticleCategory>(
  ARTICLE_CATEGORIES.map((category) => [normalize(category), category])
);

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * A few shapes the model reaches for that mean a category on the list. Kept small
 * and explicit: this is for synonyms seen in practice, not a general resolver, and
 * anything not here is dropped rather than guessed at.
 */
const SYNONYMS: Record<string, ArticleCategory> = {
  llm: "Large Language Models",
  llms: "Large Language Models",
  "large language model": "Large Language Models",
  nlp: "Natural Language Processing",
  ml: "Machine Learning",
  "computer vision & imaging": "Computer Vision",
  "ai regulation & policy": "AI Regulation",
  // Seen in the stored data. The EU AI Act is AI regulation by name, so this is a
  // rename rather than a guess. Neighbours like "GDPR", "DORA" and "regulatory
  // compliance" are deliberately not mapped: they are adjacent, not the same, and
  // a wrong category is worse than none.
  "eu ai act": "AI Regulation",
  "ai enforcement": "AI Regulation",
  policy: "AI Regulation",
  regulation: "AI Regulation",
  ethics: "AI Ethics",
  research: "AI Research",
  tools: "AI Tools",
  business: "AI Business",
  robotics: "Robotics",
};

export function resolveCategory(value: string): ArticleCategory | null {
  const key = normalize(value);
  if (!key) return null;

  return BY_NORMALIZED.get(key) ?? SYNONYMS[key] ?? null;
}

export interface CategoryParse {
  categories: ArticleCategory[];
  /** Values the model returned that are not in the taxonomy, kept so the caller
   *  can log them: silent dropping would hide a drifting prompt. */
  rejected: string[];
}

/**
 * Parse a comma-separated answer into taxonomy members.
 *
 * Anything off the list is dropped rather than mapped to a neighbour. A wrong
 * category is worse than none: it puts an article in a filter someone trusts.
 *
 * Duplicates collapse, so "LLM, Large Language Models" counts once and does not
 * consume two of the three slots.
 */
export function parseCategories(answer: string): CategoryParse {
  const categories: ArticleCategory[] = [];
  const rejected: string[] = [];

  for (const part of answer.split(",")) {
    const raw = part.trim();
    if (!raw) continue;

    const resolved = resolveCategory(raw);

    if (!resolved) {
      rejected.push(raw);
      continue;
    }

    if (!categories.includes(resolved)) categories.push(resolved);
    if (categories.length === MAX_CATEGORIES_PER_ARTICLE) break;
  }

  return { categories, rejected };
}

/** The list as the prompt should present it, without the unplaced bucket: asking
 *  the model to choose "AI News" would make it the easy answer for everything. */
export function promptCategoryList(): string {
  return ARTICLE_CATEGORIES.filter((category) => category !== UNPLACED)
    .map((category) => `- ${category}`)
    .join("\n");
}
