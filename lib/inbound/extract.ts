import { load } from "cheerio";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/lib/config";
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
 * Readable text and links from an email's HTML.
 *
 * Newsletters are table layouts with tracking pixels and a footer of unsubscribe links, so
 * the input is reduced before it costs tokens. Links are listed explicitly alongside the
 * text, because the model has to be able to quote a URL it can see rather than reconstruct
 * one it inferred.
 */
export function readableEmail(input: { html?: string | null; text?: string | null }): {
  text: string;
  links: string[];
} {
  if (!input.html) {
    const text = (input.text ?? "").trim();
    return { text, links: extractBareUrls(text) };
  }

  const $ = load(input.html);

  $("script, style, noscript, iframe, img, svg, meta, link").remove();

  const links: string[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href")?.trim();
    if (!href) return;
    if (!/^https?:\/\//i.test(href)) return;
    if (!links.includes(href)) links.push(href);
  });

  const text = $("body").length > 0 ? $("body").text() : $.text();

  return {
    text: text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim(),
    links,
  };
}

function extractBareUrls(text: string): string[] {
  const found = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  return [...new Set(found)];
}

/** The input as the model sees it, capped, with the links enumerated. */
export function buildExtractionInput(
  readable: { text: string; links: string[] },
  // Typed as number rather than inferred: config is a const object, so the inferred type is
  // the literal 32000 and no caller could pass anything else.
  maxChars: number = config.emailIngest.maxInputChars
): string {
  const linkBlock =
    readable.links.length > 0
      ? `\n\nLINKS PRESENT IN THIS EMAIL (you may only use URLs from this list):\n${readable.links
          .map((link, index) => `${index + 1}. ${link}`)
          .join("\n")}`
      : "\n\nThis email contains no links.";

  const room = Math.max(0, maxChars - linkBlock.length);

  return `${readable.text.slice(0, room)}${linkBlock}`;
}

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
- Use only URLs that appear in the list of links given below. Never construct, complete or guess a URL. If an item has no URL in that list, leave it out.
- At most ${maxItems} items, the most substantial first.
- The snippet is the newsletter's own one or two sentence description, copied as it is. Empty string when there is none. Do not write your own.
- The title is the article's title as the newsletter gives it.

Reply with strict JSON and nothing else: an array of {"title": "...", "url": "...", "snippet": "..."}. An empty array is a valid answer.

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

/**
 * Keep only the items whose URL was actually in the email.
 *
 * The prompt says not to construct a URL and this is what makes that true. A digest with a
 * fabricated link creates an article pointing at something nobody wrote, which is worse than
 * an article missing from the batch.
 */
export function keepPresentUrls(
  items: DigestItem[],
  links: string[]
): { items: DigestItem[]; dropped: string[] } {
  const present = new Set(links.map((link) => link.trim()));
  const kept: DigestItem[] = [];
  const dropped: string[] = [];

  for (const item of items) {
    const url = (item.url ?? "").trim();

    if (url.length === 0 || !present.has(url)) {
      dropped.push(url || "(no url)");
      continue;
    }

    if (kept.some((existing) => existing.url === url)) continue;

    kept.push({
      title: String(item.title ?? "").trim(),
      url,
      snippet: String(item.snippet ?? "").trim(),
    });
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
        readable.links.includes(item.webVersionUrl.trim())
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
