import { load } from "cheerio";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";
import { structuredOutputTuning } from "@/lib/ai-models";
import { messageText, describeBlocks } from "@/lib/ai/message";
import { rethrowIfModelRejected } from "@/lib/ai/model";

/**
 * RQ-007 step 2: turn one email into the articles it is about.
 *
 * Two modes, because a digest and an essay are different documents and one prompt for both
 * would do neither well. A digest is a list of other people's articles; an essay is the
 * article.
 *
 * The rules that matter are in the prompt and then checked in code. A model asked for
 * "only URLs literally present in the input" will mostly comply and will occasionally
 * construct one, and a constructed URL is worse than a missing one: it creates an article
 * pointing somewhere nobody wrote.
 */

export type ParseMode = "DIGEST" | "ESSAY";

export interface DigestItem {
  title: string;
  url: string;
  snippet: string;
}

export interface EssayItem {
  title: string;
  webVersionUrl: string | null;
  plainTextBody: string;
}

/**
 * `NONE` is a finished job and `FAILED` is not.
 *
 * They used to be one variant, and that is what lost the four largest newsletters on
 * 6 August 2026: a call that died and an email that legitimately had nothing in it
 * arrived at the caller as the same value, so the caller marked both PROCESSED with a
 * null error. The failure was invisible in the data and could never be retried.
 *
 * Anything that reads this must branch on the difference.
 */
export type ExtractResult =
  | { mode: "DIGEST"; items: DigestItem[]; dropped: string[] }
  | { mode: "ESSAY"; item: EssayItem }
  /** The email was read and there was nothing in it to extract. Nothing went wrong. */
  | { mode: "NONE"; reason: string }
  /** The extraction did not complete. The email has not been dealt with. */
  | { mode: "FAILED"; reason: string };

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * One link in an email, with the anchor it came from.
 *
 * The anchor text is the whole point. It is what ties a title to a URL, and for a
 * newsletter that wraps every link in a tracking redirect it is the *only* thing that
 * does: `link.mail.beehiiv.com/ss/c/u001.IOfk…` says nothing about what it points at.
 */
export interface EmailLink {
  url: string;
  /** The anchor's own text. Empty for a bare URL in a plain text email. */
  text: string;
}

/**
 * Readable text and links from an email's HTML.
 *
 * Newsletters are table layouts with tracking pixels and a footer of unsubscribe links, so
 * the input is reduced before it costs tokens. Links are listed explicitly alongside the
 * text, because the model has to be able to quote a URL it can see rather than reconstruct
 * one it inferred.
 *
 * ## Why the anchor text travels with the URL
 *
 * It used to be a list of bare URLs, and that destroyed the pairing the email itself
 * carries. The model got titles from the text and URLs from the list and had to put them
 * back together, which is impossible when the URLs are opaque wrappers. On 8 August 2026,
 * on one real digest, four of the five checkable items were paired with another item's
 * href: "The Tutor Was Right, Students Quit" was stored with the link belonging to
 * "Hurricane Warnings a Day Sooner".
 *
 * The email already knows the answer. This keeps it.
 */
export function readableEmail(input: { html?: string | null; text?: string | null }): {
  text: string;
  links: EmailLink[];
} {
  if (!input.html) {
    const text = (input.text ?? "").trim();
    // A bare URL in plain text has no anchor. Empty rather than a guess: the pairing check
    // treats "no anchor" as nothing to contradict, and a made-up label would contradict.
    return { text, links: extractBareUrls(text).map((url) => ({ url, text: "" })) };
  }

  const $ = load(input.html);

  $("script, style, noscript, iframe, img, svg, meta, link").remove();

  const links: EmailLink[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim();
    if (!href) return;
    if (!/^https?:\/\//i.test(href)) return;
    if (isBoilerplateLink(href)) return;
    // First anchor wins. A newsletter links one piece from its heading and again from a
    // bare "read more"; the heading is the one that identifies it, and it comes first.
    if (links.some((link) => link.url === href)) return;

    links.push({ url: href, text: $(element).text().replace(/\s+/g, " ").trim() });
  });

  const text = $("body").length > 0 ? $("body").text() : $.text();

  return {
    text: text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    links,
  };
}

/**
 * Links that cannot be an article, dropped before they cost anything.
 *
 * The digest prompt already tells the model to exclude these. Sending them spends the
 * character budget to be told no, and on the newsletters that failed, the budget running
 * out was the whole problem: one had 64 tracking links of 419 characters each, which left
 * no room for the email's own text.
 *
 * Deliberately narrow. Each pattern matches boilerplate in the path or the query, not any
 * URL containing the word: `example.com/how-to-unsubscribe-from-anything` is an article
 * about unsubscribing and must survive.
 */
function isBoilerplateLink(href: string): boolean {
  let url: URL;

  try {
    url = new URL(href);
  } catch {
    return false;
  }

  const path = url.pathname.toLowerCase();
  const query = url.search.toLowerCase();

  // A path segment that *is* the boilerplate, rather than a word inside a longer slug.
  const segments = path.split("/").filter(Boolean);
  const boilerplateSegments = [
    "unsubscribe",
    "manage-preferences",
    "manage-subscription",
    "email-preferences",
    "update-profile",
    "sharer",
    /**
     * Added 8 August 2026, from what a real Substack digest actually offered.
     *
     * `subscribe` is the newsletter's own call to action, and `action` is where Substack
     * puts `disable_email` and friends. Both were candidates the model could pair a
     * heading with, and both are the newsletter selling itself rather than pointing at
     * a piece of writing.
     */
    "subscribe",
    "action",
  ];

  if (segments.some((segment) => boilerplateSegments.includes(segment))) return true;

  /**
   * An asset is not a document.
   *
   * A Substack email wraps every section image in an anchor pointing at the CDN, and the
   * `<img>` removal above leaves that anchor behind. Three articles on 8 August 2026 were
   * created from `substackcdn.com/image/fetch/...` URLs, so clicking the article opened a
   * JPEG.
   *
   * The extension has to end the path rather than merely appear in it, so an article at
   * `/why-png-beats-jpg` survives.
   */
  if (/\.(jpe?g|png|gif|webp|svg|avif|bmp|ico|mp4|mp3|pdf)$/.test(path)) return true;
  if (path.includes("/image/fetch/") || /(^|\.)substackcdn\.com$/.test(url.hostname)) {
    return true;
  }

  /**
   * Substack's "open this in the app" links, which are not the piece.
   *
   * One real email carried nine identical `app-link/post` URLs for the same post, plus a
   * like button and a share button on the same path. They outnumbered the articles.
   */
  if (/(^|\.)substack\.com$/.test(url.hostname) && path.startsWith("/app-link/")) {
    return true;
  }

  // The share intents, which are a host plus a fixed path.
  if (/^(www\.)?(twitter|x)\.com$/.test(url.hostname) && path.startsWith("/intent/")) {
    return true;
  }
  if (/(^|\.)facebook\.com$/.test(url.hostname) && path.includes("/sharer")) return true;
  if (/(^|\.)linkedin\.com$/.test(url.hostname) && path.includes("/sharing/")) return true;
  /**
   * A login wall wrapping a share intent, which is neither.
   *
   * Stored in production as an article titled "Slow poke" whose source URL was a LinkedIn
   * sign-in page with the real article buried in a nested `session_redirect` parameter.
   */
  if (/(^|\.)linkedin\.com$/.test(url.hostname) && path.startsWith("/uas/login")) {
    return true;
  }
  // Facebook's, which is the same shape: a sign-in page with the real destination buried
  // in `next=`. Stored in production as an article titled "Reviews are in".
  if (/(^|\.)facebook\.com$/.test(url.hostname) && path.startsWith("/login")) {
    return true;
  }

  if (query.includes("action=unsubscribe")) return true;

  return false;
}

function extractBareUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  return [...new Set(found)];
}

/**
 * The share of the budget the email's own text is guaranteed.
 *
 * The text says what the articles are; the links are what they point at. Whichever of the
 * two has to be cut, it cannot be the text.
 */
const TEXT_SHARE = 0.55;

/**
 * The input as the model sees it, capped, with the links enumerated.
 *
 * The link block used to be assembled first and given whatever length it wanted, with the
 * text taking the remainder. That is backwards, and on 6 August 2026 it cost two
 * newsletters entirely: tracking URLs run 400 to 1200 characters, so 64 of them filled a
 * 32000-character budget to 99% and the email's text was truncated to nothing. The model
 * was handed a wall of URLs and asked which articles the email described.
 *
 * Now the text is served first, up to its share, and the links fill what is left. Links
 * that do not fit are dropped, and the count is stated: a silently shorter list looks like
 * an email with fewer links, and the model would be asked to match an article against a
 * list missing its URL.
 */
/**
 * How much of one anchor's text is shown.
 *
 * Enough to recognise a headline, capped so a newsletter that puts a paragraph inside an
 * `<a>` cannot spend the whole link budget on one line.
 */
const MAX_ANCHOR_CHARS = 120;

export function buildExtractionInput(
  readable: { text: string; links: EmailLink[] },
  // Typed as number rather than inferred: config is a const object, so the inferred type is
  // the literal 32000 and no caller could pass anything else.
  maxChars: number = config.emailIngest.maxInputChars
): string {
  const header =
    "\n\nLINKS PRESENT IN THIS EMAIL. Each line is a link's own anchor text followed by its URL. Take an item's URL from the line whose anchor text is that item:\n";

  if (readable.links.length === 0) {
    return `${readable.text.slice(0, maxChars)}\n\nThis email contains no links.`;
  }

  const lineFor = (link: EmailLink, index: number) => {
    // Stated rather than blank: a line with nothing between the quotes reads like a bug,
    // and the model has to be able to tell "no label" from "label the extractor lost".
    const label =
      link.text.length > 0 ? link.text.slice(0, MAX_ANCHOR_CHARS) : "(no link text)";
    return `${index + 1}. "${label}" -> ${link.url}\n`;
  };

  // The text keeps its share, and takes any room the links do not need.
  const linksNeed =
    header.length +
    readable.links.reduce((total, link, index) => total + lineFor(link, index).length, 0);
  const textRoom = Math.max(Math.floor(maxChars * TEXT_SHARE), maxChars - linksNeed);
  const text = readable.text.slice(0, textRoom);

  /**
   * The links get exactly what the text did not use, and the omission sentence is
   * reserved out of that only when something is actually going to be omitted.
   *
   * Computed rather than approximated with a margin: a margin large enough to be safe
   * dropped links that would have fitted, and one small enough to keep them let the
   * result run over the cap.
   */
  const allFit = linksNeed <= maxChars - text.length;
  const omissionRoom = "(999 further links omitted)\n".length;
  const linkBudget = maxChars - text.length - (allFit ? 0 : omissionRoom);

  let block = header;
  let kept = 0;

  for (const [index, link] of readable.links.entries()) {
    const line = lineFor(link, index);
    if (block.length + line.length > linkBudget) break;
    block += line;
    kept += 1;
  }

  const dropped = readable.links.length - kept;
  if (dropped > 0) {
    block += `(${dropped} further link${dropped === 1 ? "" : "s"} omitted)\n`;
  }

  return `${text}${block}`;
}

/**
 * One line in both prompts, phrased the way the model documentation asks for.
 *
 * With thinking turned off, these models can occasionally write internal markup into the
 * visible reply. Two counterintuitive rules apply, and both are followed here: the
 * instruction is generic rather than naming the tags, because naming them is measurably
 * less effective, and there is deliberately no instruction telling the model not to think
 * or not to reason, because that kind of rule makes the leakage worse rather than better.
 */
const NO_MARKUP = `\nDo not include internal or system XML tags in your response.\n`;

export function buildDigestPrompt(input: string, maxItems: number): string {
  return `This is an email newsletter that links to articles published elsewhere. List the articles it points at.

Include only external articles, posts and papers the newsletter is telling its reader about.

Exclude, and this is most of what is in a newsletter:
- sponsor and advertisement blocks, however they are labelled
- job listings and hiring sections
- "view in browser", "share", "subscribe", "unsubscribe", "manage preferences", "forward to a friend"
- the newsletter's own archive, homepage, social accounts and past issues
- links to the newsletter's own products, courses or merchandise
- tracking, analytics and image URLs

Rules:
- Use only URLs that appear in the list of links given below. Never construct, complete or guess a URL.
- Take each item's URL from the line whose anchor text is that item's own title or link text. Do not pair an item with a URL from a different line because it looks plausible: the URLs are opaque tracking links and cannot be told apart by reading them.
- If no line's anchor text corresponds to an item, leave the item out. A missing item is correct; an item pointing at another item's link is not.
- At most ${maxItems} items, the most substantial first.
- The snippet is the newsletter's own one or two sentence description, copied as it is. Empty string when there is none. Do not write your own.
- The title is the article's title as the newsletter gives it.

Reply with strict JSON and nothing else: an array of {"title": "...", "url": "...", "snippet": "..."}. An empty array is a valid answer.
${NO_MARKUP}
EMAIL:
${input}`;
}

/**
 * The essay prompt asks for identification only, never for the body.
 *
 * It used to ask the model to return `plainTextBody`: the whole piece, unsummarised. That
 * cannot work and did not. Measured on the two real newsletters it lost, the bodies were
 * 4354 and 4654 output tokens against a budget of 4000 that thinking also drew on, so the
 * reply was truncated mid-JSON on every attempt. Raising the budget only moves the wall.
 *
 * The body is in the email. Copying it through a model spends output tokens to receive
 * text we already hold, and asks the model not to paraphrase while giving us no way to
 * check that it did not. Two things here genuinely need a reader: which of the headings is
 * the piece's own title, and which of the links is the "read online" one.
 */
export function buildEssayPrompt(input: string): string {
  return `This is an email newsletter that is itself a single piece of writing, not a list of links to other articles.

Identify two things:
- title: the piece's own title, from the subject or the heading. Not the newsletter's name, the title of this particular piece.
- webVersionUrl: the "view in browser" or "read online" URL, if one appears in the list of links below. Null when there is none. Never construct one.

Do not return the body. Do not summarise the piece.

Reply with strict JSON and nothing else: {"title": "...", "webVersionUrl": "..." or null}
${NO_MARKUP}
EMAIL:
${input}`;
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();

  const first = candidate.search(/[[{]/);
  if (first === -1) return null;

  const lastArray = candidate.lastIndexOf("]");
  const lastObject = candidate.lastIndexOf("}");
  const last = Math.max(lastArray, lastObject);
  if (last <= first) return null;

  try {
    return JSON.parse(candidate.slice(first, last + 1));
  } catch {
    return null;
  }
}

/** Punctuation and case removed, so two spellings of one headline compare equal. */
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Anchor labels that identify nothing, so there is nothing to check a title against.
 *
 * A newsletter that links its pieces from "Read more →" is not mispairing anything; it
 * simply carries no label. Treating those as a contradiction would drop the article.
 */
const GENERIC_ANCHOR =
  /^(read|read more|read online|read it|more|link|here|click here|view|view online|view in browser|continue|continue reading|full story|learn more|open|watch|listen|see more|source|link to article)$/;

/**
 * Does this anchor text actively say the URL belongs to something else?
 *
 * Deliberately asymmetric. It answers "is there a contradiction", not "is there a match",
 * because most of a real newsletter's anchors are labels rather than headlines and only a
 * substantial, headline-shaped anchor carries enough to contradict anything.
 */
function anchorContradicts(title: string, anchor: string): boolean {
  const label = normalize(anchor);
  const wanted = normalize(title);

  if (label.length === 0 || wanted.length === 0) return false;
  // Nothing to go on: a short or generic label identifies no particular article.
  if (label.length < 15 || GENERIC_ANCHOR.test(label)) return false;

  if (label.includes(wanted) || wanted.includes(label)) return false;

  /**
   * Half the shorter side's real words, found in the other.
   *
   * Containment alone is too strict: a digest routinely retitles an item, so
   * "Hurricane Warnings a Day Sooner" and "Hurricane warnings arrive a day sooner" would
   * fail it. Overlap accepts the rewrite and still rejects a different article, whose
   * words do not appear at all.
   */
  const words = (value: string) => value.split(" ").filter((word) => word.length > 3);
  const labelWords = words(label);
  const titleWords = words(wanted);

  if (labelWords.length === 0 || titleWords.length === 0) return false;

  const [shorter, longer] =
    titleWords.length <= labelWords.length ? [titleWords, labelWords] : [labelWords, titleWords];
  const inBoth = shorter.filter((word) => longer.includes(word)).length;

  return inBoth / shorter.length < 0.5;
}

/**
 * Keep only the items whose URL was actually in the email, attached to the right item.
 *
 * The prompt says not to construct a URL and this is what makes that true. A digest with a
 * fabricated link creates an article pointing at something nobody wrote, which is worse than
 * an article missing from the batch.
 *
 * Since 8 August 2026 it also checks the *pairing*, which is a different failure and turned
 * out to be the common one. Every URL the model returned really was in the email; four out
 * of five were simply attached to the wrong item. Presence alone could never have seen
 * that, because the wrappers are opaque and any one of them passes a presence check.
 */
export function keepPresentUrls(
  items: DigestItem[],
  links: EmailLink[]
): { items: DigestItem[]; dropped: string[] } {
  const byUrl = new Map(links.map((link) => [link.url.trim(), link]));
  const kept: DigestItem[] = [];
  const dropped: string[] = [];

  for (const item of items) {
    // Coerced rather than trusted: this is parsed model output, and a reply of
    // `{"url": 12}` used to throw here and take the whole email's extraction with it.
    const url = String(item?.url ?? "").trim();
    const link = byUrl.get(url);

    if (url.length === 0 || !link) {
      dropped.push(url || "(no url)");
      continue;
    }

    const title = String(item.title ?? "").trim();

    if (anchorContradicts(title, link.text)) {
      dropped.push(url);
      continue;
    }

    if (kept.some((existing) => existing.url === url)) continue;

    kept.push({ title, url, snippet: String(item.snippet ?? "").trim() });
  }

  return { items: kept.filter((item) => item.title.length > 0), dropped };
}

export type AskModel = (prompt: string, model: string) => Promise<string>;

const askAnthropic: AskModel = async (prompt, model) => {
  const message = await anthropic().messages.create({
    model,
    // Thinking is drawn from this too, which is why the old 4000 could be spent without a
    // single character of reply being emitted. See the config entry for the measurements.
    max_tokens: config.emailIngest.maxExtractionTokens,
    /**
     * Thinking off, lowest effort, on the models where that is expressible.
     *
     * The 5-family models think when the request does not say otherwise, and this call
     * does not want it: reading a newsletter and listing what it points at is not a
     * reasoning task. Raising the budget alone did not fix it, because thinking scales to
     * fill what it is given: 4000 tokens were exhausted, then 8000 were exhausted on the
     * same two emails. Not thinking is the fix; a bigger budget only moved the wall.
     */
    ...structuredOutputTuning(model),
    // No temperature: the current models reject it with a 400, which RQ-006 found by
    // making a real call. The plan asked for 0.2.
    messages: [{ role: "user", content: prompt }],
  });

  const text = messageText(message);

  if (text.length === 0) {
    throw new Error(`the model returned no text (${describeBlocks(message)})`);
  }

  return text;
};

/**
 * Extract from one email, with one retry on an unparsable reply.
 *
 * One retry and then a refusal, for the same reason as the rewrite path: a model that cannot
 * produce the shape twice will not produce it on the fifth attempt either, and the cost is
 * real.
 */
export async function extractNewsletterItems(
  input: { html?: string | null; text?: string | null },
  mode: ParseMode,
  model: string,
  ask: AskModel = askAnthropic
): Promise<ExtractResult> {
  const readable = readableEmail(input);

  if (readable.text.length < 50) {
    return { mode: "NONE", reason: "the email had almost no readable text" };
  }

  const prompt =
    mode === "DIGEST"
      ? buildDigestPrompt(
          buildExtractionInput(readable),
          config.emailIngest.maxItemsPerDigest
        )
      : buildEssayPrompt(buildExtractionInput(readable));

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let reply: string;

    try {
      reply = await ask(prompt, model);
    } catch (error) {
      rethrowIfModelRejected(error, model);
      // FAILED, not NONE: nothing was read, so the email has not been dealt with.
      return {
        mode: "FAILED",
        reason: `the extraction call failed: ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }

    const parsed = parseJson(reply);

    if (mode === "DIGEST") {
      if (!Array.isArray(parsed)) continue;

      const { items, dropped } = keepPresentUrls(
        parsed as DigestItem[],
        readable.links
      );

      return {
        mode: "DIGEST",
        items: items.slice(0, config.emailIngest.maxItemsPerDigest),
        dropped,
      };
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { title?: unknown }).title === "string"
    ) {
      const item = parsed as { title: string; webVersionUrl?: unknown };
      const title = item.title.trim();

      if (title.length === 0) continue;

      const webVersionUrl =
        typeof item.webVersionUrl === "string" &&
        readable.links.some((link) => link.url === item.webVersionUrl?.toString().trim())
          ? item.webVersionUrl.trim()
          : null;

      return {
        mode: "ESSAY",
        item: {
          title,
          webVersionUrl,
          /**
           * The email's own text, not the model's copy of it.
           *
           * Whatever the model returned for a body is ignored, including when it returns
           * one after being told not to: a paraphrase presented as the author's words is
           * the one failure here that would be invisible.
           */
          plainTextBody: readable.text.slice(0, config.emailIngest.maxEssayBodyChars),
        },
      };
    }
  }

  return {
    mode: "FAILED",
    reason: "the extractor did not return the requested shape after two attempts",
  };
}
