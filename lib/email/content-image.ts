/**
 * The lead story's image, taken from the article content already stored.
 *
 * `edition-template.ts` has a two-column top story with a thumbnail and nothing ever set
 * `topStoryImage`, so the strongest layout in the design had never appeared in a real send.
 *
 * The obvious fix was a new `Article.imageUrl` column populated during collection. This is the
 * cheaper one: `content` is already stored and already carries the publisher's own image, because
 * `rss-collector.ts` reads `content:encoded`. No migration, no change to the collection path, and
 * it works on the 4456 rows that already exist rather than only on rows written from now on.
 *
 * What it refuses matters more than what it accepts. Scraped content is full of things that are
 * technically images and never editorial: tracking pixels, share buttons, author avatars, the
 * publication's own logo. A wrong picture beside the lead story is worse than none, so anything
 * doubtful is rejected.
 */

/**
 * A declared width or height, whole number captured.
 *
 * `\d+` and not `\d{1,2}`: a bounded count matches the *prefix* of a longer number, so
 * `width="1200"` read as 12 and a perfectly good 1200px photograph was rejected as a beacon.
 */
const DIMENSION = /\b(?:width|height)\s*=\s*["']?(\d+)["']?/gi;

/**
 * Hosts and paths that are never editorial.
 *
 * Deliberately a small list of things actually seen in feeds rather than an attempt at
 * completeness: the size and extension checks catch most of it, and this catches the rest.
 */
const NEVER_EDITORIAL = [
  "feedburner",
  "feeds.feedburner.com",
  "pixel",
  "/track",
  "tracking",
  "beacon",
  "doubleclick",
  "google-analytics",
  "googletagmanager",
  "gravatar.com",
  "/avatar",
  "/logo",
  "sharethis",
  "addtoany",
  "twitter.com/share",
  "stats.wordpress.com",
  "scorecardresearch",
  "1x1",
  "spacer.gif",
  "blank.gif",
];

/** Formats an email client will not render, or that are not photographs. */
const BAD_EXTENSION = /\.(svg|gif|webp|avif|ico|bmp|tif|tiff)(\?|#|$)/i;

function isPlausible(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // A relative path never resolves in an email client, and neither does data: or anything else.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const lower = url.toLowerCase();
  if (NEVER_EDITORIAL.some((token) => lower.includes(token))) return false;
  if (BAD_EXTENSION.test(parsed.pathname + parsed.search)) return false;

  return true;
}

/**
 * True when the tag declares itself small enough to be a beacon rather than a picture.
 *
 * Only declared dimensions are read. Fetching the image to measure it would put an HTTP request
 * per article into a collection route that already times out on Vercel.
 */
function declaresItselfTiny(tag: string): boolean {
  DIMENSION.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = DIMENSION.exec(tag)) !== null) {
    if (Number(match[1]) <= 32) return true;
  }

  return false;
}

/**
 * The first plausible editorial image in an article's stored content, or undefined.
 *
 * Undefined is the common and correct answer: many feeds carry no image, and the top story then
 * renders in the single-column layout it has always used.
 */
export function firstContentImage(
  content: string | null | undefined
): string | undefined {
  if (!content) return undefined;

  const tags = content.match(/<img\b[^>]*>/gi);
  if (!tags) return undefined;

  for (const tag of tags) {
    if (declaresItselfTiny(tag)) continue;

    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!src) continue;

    const url = src[1].trim();
    if (isPlausible(url)) return url;
  }

  return undefined;
}
