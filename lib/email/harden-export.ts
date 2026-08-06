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
 * the browser preview both call it and cannot disagree. Every transform is idempotent, so running
 * it twice is harmless.
 *
 * ORDER MATTERS, in two ways.
 *
 * This runs *after* substitution, never before. `dropEmptyOptionalRows` judges emptiness against
 * the final markup, and an unresolved `{{trend_radar}}` reads as content, which is the outcome we
 * want: a visible placeholder is a bug someone can see.
 *
 * And within `hardenExportedHtml`, dropping and wrapping run before injection, because the
 * injected stylesheet contains `.logo-dark` as a selector and the scanner should never walk it.
 */

import { DARK_MODE_RULES } from "./edition-blocks";

/** A row that must disappear when the merge tag inside it renders nothing. */
export const OPTIONAL_ROW_CLASS = "radar-optional";

/**
 * Marks the part of an optional row that decides whether the row survives.
 *
 * Without it, emptiness has to be guessed from the row's whole text, and the guess was wrong. The
 * first rule tried was "no lowercase letter and no digit means empty", which held for an all-caps
 * eyebrow baked into the markup and failed the moment a template wrote its eyebrow in sentence
 * case and uppercased it in CSS: the heading then kept its own empty row alive. A test caught it.
 *
 * With this class the question stops being a guess. The row is empty when the element carrying
 * this class holds no text, which is exactly what "the merge tag rendered nothing" means.
 */
export const OPTIONAL_BODY_CLASS = "radar-body";

/** Present once the dark-mode block has been injected, so a second pass is a no-op. */
const MARKER = "<!--radar:hardened-->";

const MSO_OPEN = "<!--[if !mso]><!-->";
const MSO_CLOSE = "<!--<![endif]-->";

/**
 * Deliberately not a string containing OPTIONAL_ROW_CLASS.
 *
 * A hyphen is a word boundary, so `\bradar-optional\b` matches inside `radar-optional-keep`. A
 * sentinel of that shape would be found again by the next scan and the loop would never terminate.
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

/* ------------------------------------------------------------------- scanning */

interface Extent {
  /** Index of the element's opening `<`. */
  start: number;
  /** Index of the `<` that begins the closing tag. */
  closeStart: number;
  /** Index one past the closing `>`. */
  end: number;
}

/**
 * The full extent of the element starting at `start`, by counting tags of the same name.
 *
 * An Unlayer row is nested tables of the same tag name, so the extent cannot be found by regex.
 * Returns null when the depth never balances, which means the markup is malformed: leaving it
 * alone is the only safe answer, because guessing an extent would delete real content.
 */
function elementExtent(html: string, start: number, tag: string): Extent | null {
  const scan = new RegExp(`<${tag}\\b|</${tag}\\s*>`, "gi");
  scan.lastIndex = start;

  let depth = 0;
  let step: RegExpExecArray | null;

  while ((step = scan.exec(html)) !== null) {
    if (step[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return { start, closeStart: step.index, end: step.index + step[0].length };
      }
    } else {
      depth += 1;
    }
  }

  return null;
}

/** The element whose `class` attribute at `attributeIndex` we already found, resolved to a span. */
function extentAround(html: string, attributeIndex: number): Extent | null {
  const start = html.lastIndexOf("<", attributeIndex);
  if (start === -1) return null;

  const name = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start, attributeIndex + 1));
  if (!name) return null;

  return elementExtent(html, start, name[1]);
}

/** Visible text, with every tag, attribute and non-breaking space removed. */
function textOf(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

/** The inner markup of the element carrying OPTIONAL_BODY_CLASS, or null when there is none. */
function bodyOf(fragment: string): string | null {
  const attribute = new RegExp(`class="[^"]*\\b${OPTIONAL_BODY_CLASS}\\b[^"]*"`);
  const found = attribute.exec(fragment);
  if (!found) return null;

  const extent = extentAround(fragment, found.index);
  if (!extent) return null;

  const openEnd = fragment.indexOf(">", found.index);
  if (openEnd === -1 || openEnd > extent.closeStart) return null;

  return fragment.slice(openEnd + 1, extent.closeStart);
}

/**
 * Whether a row holds anything a reader would call content.
 *
 * When the row marks its body, that element alone decides, which is deterministic: the body is
 * exactly what the merge tag filled.
 *
 * Without a marker the whole row is judged by the older rule, no lowercase letter and no digit.
 * That is kept only as a fallback for a row someone wrote by hand, not as a design: it mistakes a
 * sentence-case heading for content, which is the bug that motivated the marker. Every template
 * this codebase seeds carries one.
 */
function hasContent(fragment: string): boolean {
  const body = bodyOf(fragment);
  if (body !== null) return textOf(body).length > 0;

  return /[a-z0-9]/.test(fragment.replace(/<[^>]*>/g, " "));
}

export function dropEmptyOptionalRows(html: string): string {
  const attribute = new RegExp(`class="[^"]*\\b${OPTIONAL_ROW_CLASS}\\b[^"]*"`, "g");
  let result = html;
  let cursor = 0;

  // Bounded rather than `while (true)`: a scanner bug should produce one wrong email, not hang the
  // send route. Ten optional rows per template is the realistic ceiling.
  for (let guard = 0; guard < 500; guard += 1) {
    attribute.lastIndex = cursor;
    const found = attribute.exec(result);
    if (!found) break;

    const extent = extentAround(result, found.index);
    if (!extent) break;

    if (hasContent(result.slice(extent.start, extent.end))) {
      // Kept. Swap the class for a sentinel so the next scan moves past it, then restore every
      // sentinel at the end, which leaves a kept row byte-identical to how it arrived.
      result =
        result.slice(0, found.index) +
        result
          .slice(found.index, extent.end)
          .replace(OPTIONAL_ROW_CLASS, KEEP_SENTINEL) +
        result.slice(extent.end);
      cursor = found.index;
      continue;
    }

    result = result.slice(0, extent.start) + result.slice(extent.end);
    cursor = extent.start;
  }

  return result.split(KEEP_SENTINEL).join(OPTIONAL_ROW_CLASS);
}

/** The three, in the only order that works. See the header note. */
export function hardenExportedHtml(html: string): string {
  return injectDarkMode(wrapMsoLogo(dropEmptyOptionalRows(html)));
}
