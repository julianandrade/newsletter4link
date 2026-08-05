/**
 * A markdown subset, parsed into data rather than markup.
 *
 * This exists to render prose a language model wrote. That prose is untrusted input
 * (CLAUDE.md LLM05), and the two obvious ways to render it are both wrong here: a
 * markdown library is a large dependency and a supply-chain surface (A03) for a grammar
 * this small, and `dangerouslySetInnerHTML` over model output is the exact path A05
 * exists to close.
 *
 * So nothing here produces an HTML string. Every character of the input leaves as the
 * `text` of a span, which a component renders as a text node. There is no sanitization
 * step because there is nothing to sanitize, and therefore no sanitization step anybody
 * can forget to call.
 *
 * Feature-agnostic on purpose. It arrived with the Link Take (RQ-006_03) but knows
 * nothing about rewrites, and the next thing that has to show model-authored prose
 * safely should import it from here rather than from that feature's folder.
 *
 * Handled: ATX headings to three levels, `-` and `*` bullets, `**strong**`, `*em*`,
 * `_em_`, and paragraphs separated by blank lines with wrapped lines joined.
 *
 * Not handled, deliberately: links, images, tables, code, blockquotes, nested lists.
 * An unrecognised construct survives as literal text, which is the safe failure: an
 * unrendered `##` is ugly, and an executed one is a vulnerability.
 */

export interface Span {
  text: string;
  strong?: boolean;
  emphasis?: boolean;
}

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "bullet"; spans: Span[] };

/** A bullet block, for a caller that has already narrowed to one. */
export type BulletBlock = Extract<Block, { kind: "bullet" }>;

const HEADING = /^(#{1,3})\s+(.+)$/;

/**
 * A marker followed by whitespace. `*emphasised* opening` is not a list, and the space
 * is the only thing that tells them apart.
 */
const BULLET = /^[-*]\s+(.+)$/;

/**
 * Strong, then emphasis with either marker.
 *
 * The lookarounds are what standard markdown uses to decide a delimiter is a delimiter:
 * an opener is not followed by whitespace, a closer is not preceded by it. Without them,
 * `two ** asterisks and one * alone` parses as emphasis spanning the middle of the
 * sentence, which is a real body a model can produce and a silent mangling of it.
 */
const INLINE =
  /\*\*(?!\s)([^*]+?)(?<!\s)\*\*|\*(?![\s*])([^*\n]*?)(?<![\s*])\*|_(?!\s)([^_\n]*?)(?<!\s)_/g;

function span(text: string, mark?: "strong" | "emphasis"): Span {
  // The mark is set only when it applies, so a plain span is exactly `{ text }`.
  if (mark === "strong") return { text, strong: true };
  if (mark === "emphasis") return { text, emphasis: true };
  return { text };
}

/** Inline marks within one line of text. Anything unrecognised stays literal. */
export function parseSpans(text: string): Span[] {
  const spans: Span[] = [];
  let cursor = 0;

  // No `lastIndex` reset, and none is needed: `matchAll` clones the regex and advances
  // the clone, never the original, so a module-level `g` regex carries no state between
  // calls. That holds only while `matchAll` is the sole way this regex is used. An
  // `exec` or `test` call on it anywhere would leave `lastIndex` parked mid-string and
  // silently make the next `matchAll` start from there.
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > cursor) spans.push(span(text.slice(cursor, at)));

    if (match[1] !== undefined) {
      spans.push(span(match[1], "strong"));
    } else {
      spans.push(span(match[2] ?? match[3] ?? "", "emphasis"));
    }

    cursor = at + match[0].length;
  }

  if (cursor < text.length) spans.push(span(text.slice(cursor)));

  return spans;
}

/** A body as blocks, in document order. */
export function parseBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  let pending: string[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    blocks.push({ kind: "paragraph", spans: parseSpans(pending.join(" ")) });
    pending = [];
  };

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line.length === 0) {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", text: heading[2].trim() });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      blocks.push({ kind: "bullet", spans: parseSpans(bullet[1].trim()) });
      continue;
    }

    pending.push(line);
  }

  flush();

  return blocks;
}
