/**
 * RQ-006_02, review finding F3: whether a publisher's page may be fetched at all.
 *
 * Reading an RSS feed a publisher offers is one thing. Fetching the article page and
 * extracting its body is scraping, and several publishers truncate their feeds
 * precisely because they want the reader on the page. So this is default deny, and
 * adding a domain is a deliberate act with a reason recorded next to it.
 *
 * The list starts empty on purpose. Nothing is fetched until somebody decides which
 * publishers may be, which is an editorial decision rather than a technical one. The
 * machinery is here and inert.
 *
 * It is also mostly unnecessary, which is the useful thing measured while building it.
 * The collector used to truncate every feed at 2000 characters, so text these
 * publishers already give away was being discarded on the way in: MIT Technology
 * Review, Ars Technica and The Verge all publish more than that in their feeds. Using
 * what a feed carries raises no question about scraping at all, and it covers more of
 * the corpus than fetching would.
 */

export interface PublisherPolicy {
  /** Hostname without a leading www. */
  domain: string;
  /** Why this domain is allowed. Recorded because the decision is reviewable. */
  reason: string;
}

/**
 * Domains whose article pages may be fetched for full text.
 *
 * The recommendation, unapplied: start with publishers who already publish full text
 * in their own feeds, since fetching those adds nothing they have not already given.
 * Ars Technica, The Verge and TechCrunch truncate deliberately and should stay off it.
 */
export const FETCH_ALLOWLIST: PublisherPolicy[] = [];

export type FetchVerdict =
  | { allowed: true; domain: string }
  | { allowed: false; domain: string; reason: string };

/** The hostname of a URL, lowercased and without www, or null if it is not a URL. */
export function domainOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Whether this URL may be fetched.
 *
 * A subdomain does not inherit its parent's permission. Allowing "example.com" and
 * thereby allowing "anything.example.com" is how an allowlist stops meaning anything,
 * and publisher groups host unrelated titles on subdomains.
 */
export function mayFetch(
  url: string,
  allowlist: PublisherPolicy[] = FETCH_ALLOWLIST
): FetchVerdict {
  const domain = domainOf(url);

  if (!domain) {
    return { allowed: false, domain: "", reason: "not an http or https URL" };
  }

  const entry = allowlist.find((policy) => policy.domain === domain);

  if (!entry) {
    return {
      allowed: false,
      domain,
      reason: `${domain} is not on the fetch allowlist, and the list is default deny`,
    };
  }

  return { allowed: true, domain };
}

/**
 * The declared identity of this fetcher.
 *
 * Naming the tool and giving a contact address is both the courteous and the
 * defensible choice, and a publisher is within their rights to block an anonymous
 * client.
 */
export const FETCH_USER_AGENT =
  "newsletter4link/1.0 (+https://newsletter4link.vercel.app; julian.andrade@linkconsulting.com)";

// ==================== robots.txt ====================

export interface RobotsRules {
  /** Disallowed path prefixes that apply to us. */
  disallow: string[];
  /** Allowed path prefixes, which override a broader disallow. */
  allow: string[];
  /** Seconds the host asks us to wait between requests, when stated. */
  crawlDelaySeconds: number | null;
}

/**
 * Parse robots.txt, keeping the groups that apply to this client.
 *
 * A group naming this user agent wins over the wildcard group entirely, which is what
 * the standard says and what publishers expect. Anything addressed to another named
 * crawler is not ours to obey or to ignore.
 */
export function parseRobots(text: string, userAgent = "newsletter4link"): RobotsRules {
  const lines = text.split(/\r?\n/);

  const groups: Array<{ agents: string[]; rules: RobotsRules }> = [];
  let current: { agents: string[]; rules: RobotsRules } | null = null;
  let lastLineWasAgent = false;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line.length === 0) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      // Consecutive user-agent lines address one group.
      if (!current || !lastLineWasAgent) {
        current = {
          agents: [],
          rules: { disallow: [], allow: [], crawlDelaySeconds: null },
        };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }

    lastLineWasAgent = false;
    if (!current) continue;

    if (field === "disallow") {
      // An empty Disallow means "nothing is disallowed", so it is not a rule.
      if (value.length > 0) current.rules.disallow.push(value);
    } else if (field === "allow") {
      if (value.length > 0) current.rules.allow.push(value);
    } else if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) {
        current.rules.crawlDelaySeconds = seconds;
      }
    }
  }

  const named = groups.find((group) =>
    group.agents.some((agent) => agent === userAgent.toLowerCase())
  );

  if (named) return named.rules;

  const wildcard = groups.find((group) => group.agents.includes("*"));

  return wildcard?.rules ?? { disallow: [], allow: [], crawlDelaySeconds: null };
}

/**
 * Whether robots.txt permits this path.
 *
 * The longest matching rule wins, and Allow beats Disallow at equal length, which is
 * the behaviour the major crawlers implement and therefore what publishers write for.
 * A path with no matching rule is permitted: robots.txt is a list of exclusions.
 */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  const matchLength = (patterns: string[]) =>
    patterns
      .filter((pattern) => path.startsWith(pattern.replace(/\*$/, "")))
      .reduce((longest, pattern) => Math.max(longest, pattern.length), -1);

  const disallowed = matchLength(rules.disallow);
  const allowed = matchLength(rules.allow);

  if (disallowed === -1) return true;

  return allowed >= disallowed;
}

// ==================== paywalls and walls ====================

/**
 * Markers that a page is a gate rather than an article.
 *
 * The plan's rule was to treat 401, 402 and 403 as a paywall, which does not cover the
 * common case: a paywalled page usually answers 200, either with a gate or with the
 * first two paragraphs and a subscribe wall. Status codes will not detect that, so the
 * extracted text has to be inspected.
 */
const WALL_MARKERS = [
  "subscribe to continue",
  "subscribe to read",
  "continue reading",
  "already a subscriber",
  "create a free account",
  "sign in to read",
  "register to continue",
  "this article is for subscribers",
  "become a member",
  "start your free trial",
  "para continuar a ler",
  "assine para continuar",
  "conteudo exclusivo para subscritores",
];

export interface WallVerdict {
  walled: boolean;
  reason: string | null;
}

/**
 * Whether extracted text looks like a wall rather than an article.
 *
 * Two signals, and either is enough. A subscribe marker in a short body is a gate; a
 * body far shorter than the feed excerpt means the fetch got less than the feed already
 * gave, which is the shape of a truncated page.
 */
export function detectWall(input: {
  extracted: string;
  /** The excerpt the feed carried, for comparison. */
  excerpt: string;
}): WallVerdict {
  const text = input.extracted.toLowerCase();
  const marker = WALL_MARKERS.find((candidate) => text.includes(candidate));

  // A marker in a long article is a footer or a promotion, not a gate. In a short one
  // it is the page's whole point.
  if (marker && input.extracted.length < 2_000) {
    return { walled: true, reason: `subscribe wall marker: "${marker}"` };
  }

  if (
    input.excerpt.length > 0 &&
    input.extracted.length < input.excerpt.length
  ) {
    return {
      walled: true,
      reason: `the page yielded less text than the feed excerpt (${input.extracted.length} against ${input.excerpt.length})`,
    };
  }

  return { walled: false, reason: null };
}
