/**
 * Asking a model for closing-slot candidates.
 *
 * The prompt building and the reply parsing live here, away from the API call, so both are
 * testable without a key. The call itself is in app/api/asides/suggest/route.ts, following
 * how lib/inbound separates its prompt from its request.
 *
 * Everything this produces is written as PENDING and MODEL. A person moves it to APPROVED
 * or it never reaches a send: `asidePickerQuery` only offers APPROVED rows. That is
 * CLAUDE.md LLM06, and here it is also the difference between a good joke and an incident
 * carrying the company's name, because model humour about LLMs lands somewhere between
 * flat and subtly wrong.
 */

import { MAX_ASIDE_TEXT } from "./input";

/** Enough to find one worth keeping, few enough to read in under a minute. */
export const SUGGESTION_COUNT = 5;

export interface SuggestPromptInput {
  /** The current edition's topics, so the lines have something to be about. */
  topics: string[];
  /** Already-approved lines, as tone reference. Empty on a fresh library. */
  samples: string[];
  language: string;
}

export function buildSuggestPrompt(input: SuggestPromptInput): string {
  const topics = input.topics.filter((topic) => topic?.trim()).slice(0, 10);
  const samples = input.samples.filter((sample) => sample?.trim()).slice(0, 10);

  const topicBlock = topics.length
    ? `This week's edition covers: ${topics.join(", ")}.`
    : "This week's edition has no strong theme, so write about the industry in general.";

  const sampleBlock = samples.length
    ? `Here are lines that were approved before. Match their register, not their subjects:\n${samples
        .map((sample) => `- ${sample}`)
        .join("\n")}`
    : "There are no approved examples yet. Aim dry and understated rather than punchy.";

  return `You write the closing one-liner for an internal newsletter at an IT consultancy.

The joke is about the relationship between AI and software engineering and IT consulting: the gap between what the tools promise and what the week actually looked like, agentic everything, slop, the specific comedy of a senior engineer reviewing a diff no human wrote, and how normal all of this became so fast.

${topicBlock}

${sampleBlock}

Write in ${input.language}.

Rules:
- Write ${SUGGESTION_COUNT} candidates, one per line.
- No numbering, no bullets, no quotes around them, no preamble and no closing remark.
- Each line stands alone and is under ${MAX_ASIDE_TEXT} characters.
- Self-deprecating about our own industry, never about a named company, product or person.
- Dry. A line that is trying to be funny is worse than one that is merely true.`;
}

/**
 * The candidates in a reply.
 *
 * Defensive rather than trusting: this is model output, and the strictness costs a
 * suggestion at worst. A line over the cap is dropped rather than truncated, because a
 * truncated joke is missing its punchline and reads as a bug rather than as a rejection.
 */
export function parseSuggestions(reply: string): string[] {
  const seen = new Set<string>();
  const suggestions: string[] = [];

  for (const raw of reply.split("\n")) {
    let line = raw.trim();
    if (!line) continue;

    // Numbering and bullets, which get added despite the instruction not to.
    line = line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim();

    // Wrapping quotes, straight and curly.
    line = line.replace(/^["'“”]+/, "").replace(/["'“”]+$/, "").trim();

    if (!line) continue;
    // A preamble the model was told not to write. A one-liner does not end in a colon.
    if (line.endsWith(":")) continue;
    if (line.length > MAX_ASIDE_TEXT) continue;

    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push(line);
  }

  return suggestions;
}
