/**
 * RQ-006_01: the mechanical controls on a generated rewrite.
 *
 * The plan states four hard rules and enforces none of them: they are instructions
 * in a prompt, and a prompt is a request. The review's finding F2 is that this is
 * the load-bearing gap, and the answer to open question 1 makes it sharper. With no
 * guarantee that a human reads a piece before it reaches a subscriber, these checks
 * are not a safety net under a human reviewer. They are the only control, so:
 *
 * - they must fail closed: no output rather than an unchecked one;
 * - every generated piece carries its check result, so a complaint six months later
 *   can be answered with evidence instead of intent.
 *
 * Everything here is pure. That is deliberate: the one part of this feature whose
 * failure is a legal problem rather than a bug should be testable without a network,
 * a database or a model.
 *
 * What these checks cannot do, stated so nobody mistakes the guarantee:
 *
 * - A number written as a word ("three thousand") is not verified against a source
 *   that writes it in digits. Digit tokens are what is checked.
 * - Paraphrase is not detected. A sentence reworded to say something the source does
 *   not say passes every check here. Only reproduction and invented figures are
 *   mechanically catchable, and those are the two that matter most.
 * - A fabricated publication name or date inside the prose is not caught.
 */

export type CheckCode =
  | "verbatim"
  | "long-quote"
  | "unsupported-number"
  | "too-long"
  | "empty";

export interface CheckFailure {
  code: CheckCode;
  /** What was found, quoted, so the record says why rather than that. */
  detail: string;
}

export interface CheckResult {
  ok: boolean;
  failures: CheckFailure[];
  /** Recorded on the rewrite whether it passed or not. */
  stats: {
    words: number;
    /** Length of the longest run of words shared with the source. */
    longestSharedRun: number;
    numbersInOutput: number;
  };
}

export interface CheckLimits {
  /** Shared runs of this many words or more count as reproduction. */
  shingleSize: number;
  /** A quoted span longer than this is over the line. */
  maxQuoteWords: number;
  /** Hard cap on the body. */
  maxWords: number;
}

export const DEFAULT_LIMITS: CheckLimits = {
  // Eight words is long enough that ordinary phrasing does not collide by accident
  // and short enough to catch a lifted clause. "The company said it would begin
  // rolling out" is eight.
  shingleSize: 8,
  maxQuoteWords: 15,
  maxWords: 300,
};

/**
 * Words, lowercased, with punctuation and accents removed.
 *
 * Comparison has to survive the model changing a comma or a hyphen while lifting a
 * clause, so punctuation cannot be part of the identity of a phrase. Accents go too:
 * a Portuguese rewrite of an English source is the normal case here, and matching
 * must not depend on whether the model kept a diacritic.
 */
export function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

export function countWords(text: string): number {
  return words(text).length;
}

/** Every run of `size` consecutive words, as joined strings. */
export function shingles(text: string, size: number): string[] {
  const tokens = words(text);
  if (tokens.length < size) return [];

  const result: string[] = [];
  for (let index = 0; index + size <= tokens.length; index += 1) {
    result.push(tokens.slice(index, index + size).join(" "));
  }

  return result;
}

/**
 * The longest run of words the output shares with the source.
 *
 * Reported even when it is under the limit, because the number is the evidence: a
 * piece whose longest shared run is 4 is demonstrably not a reproduction, and that is
 * worth keeping rather than a bare "passed".
 */
export function longestSharedRun(source: string, output: string): number {
  const sourceTokens = words(source);
  const outputTokens = words(output);
  if (sourceTokens.length === 0 || outputTokens.length === 0) return 0;

  // Classic dynamic programming for the longest common substring, over words rather
  // than characters. One row at a time, because a long article against a short
  // rewrite is a wide matrix and only the previous row is ever needed.
  let previous = new Array<number>(sourceTokens.length + 1).fill(0);
  let best = 0;

  for (let out = 1; out <= outputTokens.length; out += 1) {
    const current = new Array<number>(sourceTokens.length + 1).fill(0);

    for (let src = 1; src <= sourceTokens.length; src += 1) {
      if (outputTokens[out - 1] === sourceTokens[src - 1]) {
        current[src] = previous[src - 1] + 1;
        if (current[src] > best) best = current[src];
      }
    }

    previous = current;
  }

  return best;
}

/** The first shared run of at least `size` words, for the failure detail. */
export function findVerbatimRun(
  source: string,
  output: string,
  size: number
): string | null {
  const sourceShingles = new Set(shingles(source, size));
  if (sourceShingles.size === 0) return null;

  for (const shingle of shingles(output, size)) {
    if (sourceShingles.has(shingle)) return shingle;
  }

  return null;
}

/**
 * Quoted spans in the output that run longer than the limit.
 *
 * Straight and curly quotes both, and the Portuguese and French angle quotes, because
 * the output language is configurable and a model writing Portuguese reaches for
 * whichever its training favoured.
 */
export function findLongQuotes(text: string, maxWords: number): string[] {
  const patterns = [
    /"([^"]{2,})"/g,
    /“([^”]{2,})”/g,
    /«([^»]{2,})»/g,
  ];

  const long: string[] = [];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const quoted = match[1];
      if (countWords(quoted) > maxWords) long.push(quoted.trim());
    }
  }

  return long;
}

/**
 * Numeric values in a text, normalized so the same figure written two ways compares
 * equal.
 *
 * Thousands separators are dropped only when they separate groups of exactly three
 * digits, so "1,000" is one thousand while "1,5" stays one and five tenths, which is
 * how a Portuguese source writes it. A trailing percent or currency symbol is not
 * part of the value: a source saying "40 percent" supports an output saying "40%".
 */
export function extractNumbers(text: string): string[] {
  const found: string[] = [];

  // Digit groups, with optional separators and decimals.
  for (const match of text.matchAll(/\d[\d.,\s]*\d|\d/g)) {
    // Spaces go first: "2 500" is one figure written the French way. A trailing
    // separator is punctuation, as in "in March 2027." rather than a decimal.
    const raw = match[0].replace(/\s/g, "").replace(/[.,]+$/, "");
    if (raw.length === 0) continue;

    /**
     * Group separators are recognised by shape, not one at a time.
     *
     * A single pass over "1.250.000" removed only the first separator and left
     * "1250.000", which parses as one thousand two hundred and fifty. Matching the
     * whole token instead is unambiguous: three digits in every group after the first
     * is thousands, anything else is a decimal.
     */
    let normalized: string;

    if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) {
      // 2,500 or 1.250.000: every separator groups thousands.
      normalized = raw.replace(/[.,]/g, "");
    } else if (/^\d{1,3}([.,]\d{3})+[.,]\d{1,2}$/.test(raw)) {
      // 1.250.000,75: the last separator is the decimal, the rest group thousands.
      const cut = Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","));
      normalized = `${raw.slice(0, cut).replace(/[.,]/g, "")}.${raw.slice(cut + 1)}`;
    } else {
      // 1,5 or 1.5 or 38: a single separator here is a decimal point.
      normalized = raw.replace(/,/g, ".");
    }

    const value = Number(normalized);
    if (!Number.isFinite(value)) continue;

    found.push(String(value));
  }

  return found;
}

/**
 * Numbers in the output that the source does not support.
 *
 * The most damaging hallucination in a business newsletter is an invented figure, and
 * it is the easiest to catch: every number in a rewrite must already be in the text it
 * was written from.
 *
 * Small counting numbers are exempt. "three of the five" and "two years" are ordinary
 * prose a writer produces without copying a figure, and flagging them would fail
 * every honest rewrite. The line is at ten, above which a number in a news piece is
 * almost always a quantity taken from somewhere.
 */
export function findUnsupportedNumbers(source: string, output: string): string[] {
  const supported = new Set(extractNumbers(source));

  return extractNumbers(output).filter((value) => {
    if (supported.has(value)) return false;

    const numeric = Number(value);
    if (Number.isFinite(numeric) && Math.abs(numeric) < 10 && Number.isInteger(numeric)) {
      return false;
    }

    return true;
  });
}

/**
 * Run every check.
 *
 * A rewrite passes only if all of them pass. There is no severity ladder and no
 * warning state on purpose: with nobody guaranteed to read the result, a warning is
 * a failure that shipped.
 */
export function checkRewrite(input: {
  /** The text the rewrite was generated from, full article or excerpt. */
  source: string;
  /** The generated body. */
  output: string;
  limits?: Partial<CheckLimits>;
}): CheckResult {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const failures: CheckFailure[] = [];

  const wordCount = countWords(input.output);
  const sharedRun = longestSharedRun(input.source, input.output);
  const numbers = extractNumbers(input.output);

  if (wordCount === 0) {
    failures.push({ code: "empty", detail: "the rewrite has no words" });
  }

  if (wordCount > limits.maxWords) {
    failures.push({
      code: "too-long",
      detail: `${wordCount} words, over the cap of ${limits.maxWords}`,
    });
  }

  const verbatim = findVerbatimRun(input.source, input.output, limits.shingleSize);
  if (verbatim) {
    failures.push({
      code: "verbatim",
      detail: `${limits.shingleSize} or more words reproduced from the source: "${verbatim}"`,
    });
  }

  for (const quote of findLongQuotes(input.output, limits.maxQuoteWords)) {
    failures.push({
      code: "long-quote",
      detail: `quote of ${countWords(quote)} words, over the limit of ${limits.maxQuoteWords}: "${quote.slice(0, 120)}"`,
    });
  }

  const unsupported = findUnsupportedNumbers(input.source, input.output);
  if (unsupported.length > 0) {
    failures.push({
      code: "unsupported-number",
      detail: `not in the source: ${unsupported.join(", ")}`,
    });
  }

  return {
    ok: failures.length === 0,
    failures,
    stats: {
      words: wordCount,
      longestSharedRun: sharedRun,
      numbersInOutput: numbers.length,
    },
  };
}

/** One line for the audit record, readable without the object. */
export function describeCheck(result: CheckResult): string {
  if (result.ok) {
    return `passed: ${result.stats.words} words, longest run shared with the source ${result.stats.longestSharedRun} words, ${result.stats.numbersInOutput} figures all supported`;
  }

  return `failed: ${result.failures.map((failure) => failure.code).join(", ")}`;
}
