/**
 * Asking a model to write the captions for one meme template.
 *
 * Separate from lib/asides/suggest.ts, which writes standalone one-liners from nothing. This
 * writes into a shape: a format with a fixed number of slots, each of which means something
 * specific, plus the alt text that has to carry the joke for a reader whose client blocked
 * the image.
 *
 * The prompt building and the reply parsing live here, away from the API call, so both are
 * testable without a key. Same split as lib/asides/suggest.ts and lib/inbound.
 *
 * The `format` and `role` strings from the template go in verbatim, and they are the whole
 * reason the output is a joke rather than N unrelated sentences. A model told "write two
 * lines" writes two lines about two different things. A model told that the top panel is
 * what Drake rejects and the bottom is what he prefers writes a joke shaped like Drake.
 */

import { NO_LONG_DASH_RULE, stripLongDashes } from "@/lib/ai/typography";
import { MAX_ASIDE_TEXT } from "@/lib/asides/input";
import type { MemeTemplate } from "./templates";

/**
 * The cap on one caption, in characters.
 *
 * Far below the aside's own 500. `composeMeme` will fit anything into its box, so this is
 * not about overflow: it is that autofit answers a 300-character caption by shrinking the
 * type until the joke is a paragraph in a photograph, which nobody reads. A meme line that
 * needs more than this is a line that is not working.
 */
export const MAX_MEME_CAPTION = 120;

export interface MemePromptInput {
  template: MemeTemplate;
  /** The edition's topics, so the joke has something to be about. */
  topics: string[];
  /** Already-approved lines, as tone reference. Empty on a fresh library. */
  samples: string[];
  language: string;
}

export function buildMemePrompt(input: MemePromptInput): string {
  const { template } = input;
  const topics = input.topics.filter((topic) => topic?.trim()).slice(0, 10);
  const samples = input.samples.filter((sample) => sample?.trim()).slice(0, 6);

  const topicBlock = topics.length
    ? `This week's edition covers: ${topics.join(", ")}.`
    : "This week's edition has no strong theme, so write about the industry in general.";

  const sampleBlock = samples.length
    ? `Lines approved before, for register only. Do not reuse their subjects:\n${samples
        .map((sample) => `- ${sample}`)
        .join("\n")}`
    : "There are no approved examples yet. Aim dry and understated rather than punchy.";

  const slots = template.zones
    .map((zone, index) => `${index + 1}. ${zone.role}`)
    .join("\n");

  return `You write the closing meme for an internal newsletter at an IT consultancy.

The joke is about the relationship between AI and software engineering and IT consulting: the gap between what the tools promise and what the week actually looked like, agentic everything, slop, the specific comedy of a senior engineer reviewing a diff no human wrote, and how normal all of this became so fast.

${topicBlock}

${sampleBlock}

The meme format is "${template.id}". ${template.format}

It has ${template.zones.length} caption ${template.zones.length === 1 ? "slot" : "slots"}, in this order:
${slots}

Write in ${input.language}.

Answer in exactly this shape, and nothing else:
${template.zones.map((_, index) => `${index + 1}: <caption for slot ${index + 1}>`).join("\n")}
ALT: <one sentence carrying the same joke on its own>

Rules:
- Each caption is under ${MAX_MEME_CAPTION} characters. Short is the whole craft here: these are set in heavy type over a picture.
- Fill every slot, and write for the slot it is. A caption that would work equally well in any of them means the format is being ignored.
- ALT is what a reader sees when their mail client blocks images. It has to land the joke without the picture, so it is a sentence rather than a label, and it never describes the image or mentions the meme.
- No numbering beyond the labels above, no quotes around the captions, no preamble, no closing remark.
- Self-deprecating about our own industry, never about a named company, product or person.
- Dry. A line that is trying to be funny is worse than one that is merely true.
- ${NO_LONG_DASH_RULE}`;
}

export interface MemeCaptions {
  /** One per zone, in zone order. */
  captions: string[];
  /** The aside's own text, and the image's alt text. */
  alt: string;
}

export type MemeCaptionResult =
  | { ok: true; value: MemeCaptions }
  | { ok: false; error: string };

/** Strip the wrapping quotes and stray bullets a model adds despite being told not to. */
function clean(text: string): string {
  return stripLongDashes(text)
    .trim()
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/^["'“”]+/, "")
    .replace(/["'“”]+$/, "")
    .trim();
}

/**
 * The captions in a reply.
 *
 * Deliberately not `parseSuggestions` from lib/asides/suggest.ts, which is right for its own
 * job and wrong for this one in two ways: it dedupes case-insensitively, and two slots of a
 * comparison format can legitimately read almost the same, which is sometimes the joke; and
 * it drops any line ending in a colon, which here would silently eat a caption and turn a
 * complete answer into a short one.
 *
 * Strict about the count. A format rendered with a slot missing is not a degraded meme, it
 * is a picture with a hole in it, so a short answer is refused rather than padded.
 */
export function parseMemeReply(reply: string, template: MemeTemplate): MemeCaptionResult {
  const captions = new Map<number, string>();
  let alt: string | null = null;

  for (const raw of reply.split("\n")) {
    const line = stripLongDashes(raw).trim();
    if (!line) continue;

    const altMatch = line.match(/^alt\s*[:.\-]\s*(.+)$/i);
    if (altMatch) {
      alt = clean(altMatch[1]);
      continue;
    }

    const slotMatch = line.match(/^(\d+)\s*[:.)]\s*(.+)$/);
    if (!slotMatch) continue;

    const index = Number(slotMatch[1]);
    const text = clean(slotMatch[2]);
    // A repeated label is the model correcting itself mid-answer; the first is the one it
    // committed to before it started hedging.
    if (text && !captions.has(index)) captions.set(index, text);
  }

  const ordered: string[] = [];
  for (let slot = 1; slot <= template.zones.length; slot += 1) {
    const text = captions.get(slot);
    if (!text) {
      return {
        ok: false,
        error: `The reply is missing a caption for slot ${slot} of ${template.zones.length} (${template.zones[slot - 1].role}).`,
      };
    }
    if (text.length > MAX_MEME_CAPTION) {
      return {
        ok: false,
        error: `Caption ${slot} is ${text.length} characters, over the ${MAX_MEME_CAPTION} a meme line gets.`,
      };
    }
    ordered.push(text);
  }

  if (!alt) {
    return {
      ok: false,
      error: "The reply has no ALT line, and the aside's text is what a blocked image falls back to.",
    };
  }

  if (alt.length > MAX_ASIDE_TEXT) {
    return {
      ok: false,
      error: `The ALT line is ${alt.length} characters, over the ${MAX_ASIDE_TEXT} an aside gets.`,
    };
  }

  return { ok: true, value: { captions: ordered, alt } };
}
