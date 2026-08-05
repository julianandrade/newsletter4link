import type Anthropic from "@anthropic-ai/sdk";

/**
 * Read the text out of a model reply.
 *
 * This exists because `message.content[0].type === "text" ? ... : ""` was the pattern
 * in twenty-one places, and it is wrong on the current models. A reply may open with a
 * thinking block, and then index 0 is not the text: every one of those call sites
 * quietly produced an empty string, "{}" or "[]" and carried on.
 *
 * The failure is silent, which is what makes it worth a shared function. An article
 * scored from an empty reply is not an error anybody sees, it is an article that
 * scored badly. I found it because a rewrite refused twice with "no parsable reply"
 * and had nothing to show, and the prompt that triggered it was simply longer and more
 * complex than the ones already in the codebase.
 */
export function messageText(message: Anthropic.Message): string {
  return message.content
    .filter(
      (block): block is Extract<Anthropic.ContentBlock, { type: "text" }> =>
        block.type === "text"
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/**
 * The text, or a fallback when the reply carried none.
 *
 * Callers that parse JSON pass "{}" or "[]" and handle the empty case themselves, so
 * the fallback is theirs to choose rather than this module's to impose.
 */
export function messageTextOr(message: Anthropic.Message, fallback: string): string {
  const text = messageText(message);
  return text.length > 0 ? text : fallback;
}

/** A description of what came back, for a log line when there was no text. */
export function describeBlocks(message: Anthropic.Message): string {
  const kinds = message.content.map((block) => block.type);
  return `${kinds.length === 0 ? "no blocks" : kinds.join(", ")}, stop reason ${message.stop_reason}`;
}
