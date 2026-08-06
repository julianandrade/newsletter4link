/**
 * What Unlayer will not emit, reinstated after the merge tags resolve.
 *
 * The code renderer's edition depends on three things a design JSON export cannot carry:
 *
 *  - a dark-mode block with the `[data-ogsc]` mirror Outlook.com reads
 *  - an MSO conditional around the dark logo, so Word-engine Outlook does not show both
 *  - rows that disappear when the merge tag inside them renders nothing
 *
 * A pure string function on purpose: no DOM, no dependencies, client-safe, so the send path and
 * the browser preview both call it and cannot disagree. Every transform is idempotent, so
 * running it twice is harmless.
 *
 * ORDER MATTERS, in two ways.
 *
 * This runs *after* substitution, never before. `dropEmptyOptionalRows` judges emptiness
 * against the final markup, and an unresolved `{{trend_radar}}` reads as content, which is the
 * outcome we want: a visible placeholder is a bug someone can see.
 *
 * And within `hardenExportedHtml`, dropping and wrapping run before injection, because the
 * injected stylesheet contains `.logo-dark` as a selector and the scanner should never walk it.
 */

import { DARK_MODE_RULES } from "./edition-blocks";

export const OPTIONAL_ROW_CLASS = "radar-optional";

/** Present once the dark-mode block has been injected, so a second pass is a no-op. */
const MARKER = "<!--radar:hardened-->";

const MSO_OPEN = "<!--[if !mso]><!-->";
const MSO_CLOSE = "<!--<![endif]-->";

/**
 * Deliberately not a string containing OPTIONAL_ROW_CLASS.
 *
 * A hyphen is a word boundary, so `\bradar-optional\b` matches inside `radar-optional-keep`.
 * A sentinel of that shape would be found again by the next scan and the loop would never
 * terminate.
 */
const KEEP_SENTINEL = "radarKeptOptional";

const DARK_MODE_STYLE = `${MARKER}
<style>
${DARK_MODE_RULES}
</style>`;

export function injectDarkMode(html: string): string {
  if (html.includes(MARKER)) return html;

  const head = html.indexOf("</head>");
  // A fragment with no head is left alone rather than given one: shipping it without the
  // dark-mode block is better than corrupting the markup.
  if (head === -1) return html;

  return html.slice(0, head) + DARK_MODE_STYLE + html.slice(head);
}

export function wrapMsoLogo(html: string): string {
  return html.replace(
    /<img\b[^>]*\bclass="[^"]*\blogo-dark\b[^"]*"[^>]*>/g,
    (tag: string, offset: number, whole: string) => {
      const preceding = whole.slice(Math.max(0, offset - MSO_OPEN.length), offset);
      if (preceding === MSO_OPEN) return tag;
      return `${MSO_OPEN}${tag}${MSO_CLOSE}`;
    }
  );
}

/**
 * Whether a fragment holds anything a reader would call content.
 *
 * The rule: strip every tag, attributes included, then look for a lowercase letter or a digit.
 * An eyebrow label like "TREND RADAR" or "INTERNAL" fails that test and counts as empty; a
 * sentence, a story title, a percentage, or an unresolved `{{merge_tag}}` passes it.
 *
 * The failure mode, stated plainly: an all-caps sentence inside an optional row would be judged
 * empty and the row dropped. That is acceptable because the class is only ever seeded onto rows
 * whose own visible text is an eyebrow, which is why the template builders apply it rather than
 * offering it to editors.
 */
function hasContent(fragment: string): boolean {
  return /[a-z0-9]/.test(fragment.replace(/<[^>]*>/g, " "));
}

interface OptionalElement {
  /** Index of the element's opening `<`. */
  start: number;
  /** Index one past the element's closing `>`. */
  end: number;
  /** Index of the `class="..."` attribute that carried the marker class. */
  classIndex: number;
}

/**
 * The next element carrying OPTIONAL_ROW_CLASS at or after `from`, with its full extent.
 *
 * An Unlayer row is nested tables, so the extent cannot be found by regex. This walks left from
 * the class attribute to the element's `<`, reads the tag name, then counts opening against
 * closing tags of that name until the depth returns to zero.
 *
 * Returns null when the markup is malformed and the depth never balances. Leaving it alone is
 * the only safe answer: guessing an extent would delete real content.
 */
function findOptionalElement(html: string, from: number): OptionalElement | null {
  const attribute = new RegExp(`class="[^"]*\\b${OPTIONAL_ROW_CLASS}\\b[^"]*"`, "g");
  attribute.lastIndex = from;

  const found = attribute.exec(html);
  if (!found) return null;

  const start = html.lastIndexOf("<", found.index);
  if (start === -1) return null;

  const name = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start, found.index + 1));
  if (!name) return null;

  const tag = name[1];
  const scan = new RegExp(`<${tag}\\b|</${tag}\\s*>`, "gi");
  scan.lastIndex = start;

  let depth = 0;
  let step: RegExpExecArray | null;

  while ((step = scan.exec(html)) !== null) {
    if (step[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return { start, end: step.index + step[0].length, classIndex: found.index };
      }
    } else {
      depth += 1;
    }
  }

  return null;
}

export function dropEmptyOptionalRows(html: string): string {
  let result = html;
  let cursor = 0;

  // Bounded rather than `while (true)`: a scanner bug should produce one wrong email, not hang
  // the send route. Ten optional rows per template is the realistic ceiling.
  for (let guard = 0; guard < 500; guard += 1) {
    const element = findOptionalElement(result, cursor);
    if (!element) break;

    if (hasContent(result.slice(element.start, element.end))) {
      // Kept. Swap the class for a sentinel so the next scan moves past it, then restore every
      // sentinel at the end, which leaves a kept row byte-identical to how it arrived.
      result =
        result.slice(0, element.classIndex) +
        result
          .slice(element.classIndex, element.end)
          .replace(OPTIONAL_ROW_CLASS, KEEP_SENTINEL) +
        result.slice(element.end);
      cursor = element.classIndex;
      continue;
    }

    result = result.slice(0, element.start) + result.slice(element.end);
    cursor = element.start;
  }

  return result.split(KEEP_SENTINEL).join(OPTIONAL_ROW_CLASS);
}

/** The three, in the only order that works. See the header note. */
export function hardenExportedHtml(html: string): string {
  return injectDarkMode(wrapMsoLogo(dropEmptyOptionalRows(html)));
}
