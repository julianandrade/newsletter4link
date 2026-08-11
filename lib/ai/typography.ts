/**
 * The house typography rule, and the pass that enforces it.
 *
 * One rule so far: nothing wider than a hyphen. Every prose prompt in the app carries
 * `NO_LONG_DASH_RULE` and every model reply that becomes prose goes through
 * `stripLongDashes`, because a prompt is a request. The same reasoning as
 * `lib/rewrite/checks.ts`: the instruction is worth sending, and the mechanical pass is
 * what makes it true. Models emit em dashes at a rate no wording reliably suppresses.
 *
 * Here rather than inside `lib/rewrite/` because the Link Take is not the only surface
 * that writes prose: the generated edition's opening, summaries, transitions, closing and
 * subject lines, the curation summary and the closing-slot suggestions all do.
 *
 * Deliberately not applied in `lib/ai/message.ts`, which would have been one line and
 * would also have rewritten the article text that `lib/inbound/extract.ts` pulls out of an
 * email. That text is the publisher's, and it is what the copy checks compare against.
 * This rule governs what we write, not what we quote from.
 */

/**
 * Everything wider than a hyphen: figure dash, en dash, em dash, horizontal bar, the two
 * long CJK dashes, and the minus sign, which arrives as punctuation more often than as
 * arithmetic.
 *
 * A double hyphen is not in here on purpose. It is the other common em dash substitute,
 * but it is also how every CLI flag in a story about tooling is written, and `--force`
 * turned into `- force` is a worse defect than the dash it fixed.
 */
const LONG_DASH = "\\u2012\\u2013\\u2014\\u2015\\u2E3A\\u2E3B\\u2212";

const dash = (pattern: string, flags = "g") =>
  new RegExp(pattern.replace(/DASH/g, `[${LONG_DASH}]`), flags);

/** True when there is anything for `stripLongDashes` to do. Used by the tests. */
export function hasLongDash(text: string): boolean {
  return dash("DASH").test(text);
}

/**
 * The rule as the prompts state it, in one place so all of them state it the same way.
 *
 * English, like every other prompt here, and explicit that it holds in the output
 * language too: the prose is pt-PT by default, and a rule about punctuation read as
 * applying only to the English it is written in would be obeyed in the wrong language.
 */
export const NO_LONG_DASH_RULE =
  `Never use a long dash: no em dash, no en dash, no horizontal bar, and no minus ` +
  `sign as punctuation. Use a comma for an aside, a hyphen when the break has to be ` +
  `harder than a comma, and a colon when what follows explains what came before. This ` +
  `holds in every language you write in, Portuguese included.`;

/**
 * Replace every long dash with punctuation that carries the same job.
 *
 * Four cases, cheapest reading first. A range keeps its closed-up form, a signed number
 * keeps its sign, a dash opening a line was a bullet written with the wrong character,
 * and everything else is a break inside a sentence and becomes a spaced hyphen.
 *
 * The hyphen rather than the comma, which reads better and is what the prompt asks the
 * model for: this function is the net under the prompt, and it cannot tell a parenthetical
 * from two independent clauses. Turning the second into a comma splice would be replacing
 * a typographic slip with a grammatical one. A spaced hyphen is never wrong.
 *
 * Only spaces and tabs are ever consumed, never a newline: `\s*` around the dash joined
 * a paragraph to the one after it whenever a line happened to end on one.
 */
export function stripLongDashes(text: string): string {
  if (!text) return text;

  return (
    text
      // 2020–2024, and 2020 — 2024, which is a range with room around it.
      .replace(dash("(\\d)[ \\t]*DASH[ \\t]*(?=\\d)"), "$1-")
      // −5, where the dash is a sign rather than punctuation.
      .replace(dash("(^|[\\s(\\[])DASH(?=\\d)", "gm"), "$1-")
      // A line opening on a dash is a list item, whatever character was used to mark it.
      .replace(dash("^([ \\t]*)DASH[ \\t]*", "gm"), "$1- ")
      .replace(dash("[ \\t]*DASH[ \\t]*"), " - ")
      // The spaced hyphen leaves a trailing space behind when the dash ended a line.
      .replace(/[ \t]+$/gm, "")
  );
}

/** Every string in a list, for the prompts that answer with one. */
export function stripLongDashesFrom(lines: string[]): string[] {
  return lines.map((line) => stripLongDashes(line));
}
