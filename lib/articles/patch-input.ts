/**
 * What an editor may change about an article, and what a valid change looks like.
 *
 * The route accepted `summary` and `category` and nothing else, so a wrong title, a
 * tracking URL where the publisher's link should be, a missing author and the wrong
 * publication date were all uneditable anywhere in the product. All four reach the
 * newsletter.
 *
 * Pure: no Prisma, no fetch. The route owns the tenant scope and the role check.
 */

export interface ArticlePatch {
  title?: string;
  summary?: string;
  sourceUrl?: string;
  author?: string | null;
  publishedAt?: Date | null;
  category?: string[];
}

export interface PatchError {
  error: string;
}

/** http and https only: the value ends up as an href in a mail client. */
function isSafeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseArticlePatch(
  body: unknown
): { data: ArticlePatch } | PatchError {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "The request body must be an object" };
  }

  const input = body as Record<string, unknown>;
  const data: ArticlePatch = {};

  if (typeof input.title === "string") {
    const trimmed = input.title.trim();
    // The newsletter renders it and the archive links it. There is no sensible blank.
    if (trimmed.length === 0) return { error: "title cannot be blank" };
    data.title = trimmed;
  }

  if (typeof input.summary === "string") {
    // A blank summary is legitimate: the template falls back to the headline.
    data.summary = input.summary;
  }

  if (typeof input.sourceUrl === "string") {
    const trimmed = input.sourceUrl.trim();
    if (!isSafeUrl(trimmed)) {
      return { error: "sourceUrl must be an http or https URL" };
    }
    data.sourceUrl = trimmed;
  }

  if (typeof input.author === "string") {
    const trimmed = input.author.trim();
    // Empty clears it. Not every story names an author, and there has to be a way back.
    data.author = trimmed.length > 0 ? trimmed : null;
  }

  if (input.publishedAt === null) {
    data.publishedAt = null;
  } else if (typeof input.publishedAt === "string") {
    const parsed = new Date(input.publishedAt);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "publishedAt must be a date, or null to clear it" };
    }
    data.publishedAt = parsed;
  }

  if (Array.isArray(input.category)) {
    if (!input.category.every((value) => typeof value === "string")) {
      return { error: "every category must be a string" };
    }
    const cleaned = (input.category as string[])
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    data.category = [...new Set(cleaned)];
  } else if (input.category !== undefined) {
    return { error: "category must be an array of strings" };
  }

  if (Object.keys(data).length === 0) {
    return {
      error:
        "No valid fields to update. Provide title, summary, sourceUrl, author, publishedAt or category.",
    };
  }

  return { data };
}
