/**
 * Every merge tag the product understands, in one table.
 *
 * Two renderers used to keep their own list and they had already drifted:
 * content-renderer.ts accepted five tags and template-renderer.ts accepted seven, so
 * `{{articleCount}}` worked in a real send and rendered as literal text in the browser
 * preview. Two components hardcoded a third and fourth copy for the Unlayer palette. With the
 * vocabulary going from seven names to sixteen, four hand-maintained lists stop being a risk
 * and become a certainty.
 *
 * Client-safe on purpose: content-renderer.ts is imported by client components, so nothing
 * here may reach for Prisma or node crypto. Signed URLs arrive from the caller.
 */

import {
  bulletsBlock,
  escapeHtml,
  internalBlock,
  oneMoreThingBlock,
  sectionBlock,
  topStoryBlock,
  trendBlock,
} from "./edition-blocks";
import type { EditionEmail } from "./edition-template";

/**
 * A template declaring that it owns the block headings itself.
 *
 * v3 lifts "This week in 30 seconds", "Top story", "Trend radar" and the "Internal" badge into
 * Unlayer text blocks so an editor can reword and restyle them, which means the merge tags must
 * render without them or the heading appears twice.
 *
 * Carried in the template's own markup rather than in a column on EmailTemplate, for two reasons:
 * it needs no migration, and it survives Unlayer's export, so a template still declares itself
 * correctly after the editor saves it.
 */
export const RADAR_HEADLESS_MARKER = "<!--radar:headless-->";

export function isHeadlessTemplate(html: string): boolean {
  return html.includes(RADAR_HEADLESS_MARKER);
}

export interface MergeTag {
  /** The name inside the braces. */
  name: string;
  /** What the Unlayer palette calls it. */
  label: string;
  /**
   * One sentence for the editor, shown on the template screen's copy-a-tag panel.
   *
   * Here rather than on the screen because that panel was a fifth hand-written list of the same
   * vocabulary, and it had drifted to five tags while the sender understood sixteen.
   */
  description: string;
  /**
   * True when the value is bound to one subscriber, so it cannot be computed once for a whole
   * send. The three signed URLs are; everything else is shared.
   */
  perRecipient: boolean;
}

export const RADAR_MERGE_TAGS: readonly MergeTag[] = [
  {
    name: "articles",
    label: "Articles",
    description: "Every selected story as one list, with titles, summaries, sources and links.",
    perRecipient: false,
  },
  {
    name: "projects",
    label: "Projects",
    description: "The featured internal projects, with teams and impact lines.",
    perRecipient: false,
  },
  {
    name: "sections",
    label: "Topic sections",
    description:
      "The stories grouped under their topics, each with its own heading. A topic with nothing in it does not render.",
    perRecipient: false,
  },
  {
    name: "top_story",
    label: "Top story",
    description:
      "The lead story in the large editorial layout, with its picture when the feed carried one.",
    perRecipient: false,
  },
  {
    name: "trend_radar",
    label: "Trend radar",
    description: "The topics that accelerated, with the figures. Renders nothing on a quiet week.",
    perRecipient: false,
  },
  {
    name: "internal",
    label: "Internal block",
    description: "The internal work worth spotlighting. Renders nothing when no project is picked.",
    perRecipient: false,
  },
  {
    name: "one_more_thing",
    label: "One more thing",
    description:
      "The closing joke, note or spotlight, with its picture when there is one. Renders nothing when the edition chose none.",
    perRecipient: false,
  },
  {
    name: "tldr",
    label: "This week in 30 seconds",
    description: "The headline bullets, and the caption that explains a thin week.",
    perRecipient: false,
  },
  {
    name: "edition_label",
    label: "Edition name",
    description: "What this edition is called: its title, or the week when it has none.",
    perRecipient: false,
  },
  {
    name: "date_range",
    label: "Week date range",
    description: "The days the edition covers, as in 3-9 Aug 2026.",
    perRecipient: false,
  },
  {
    name: "week",
    label: "Week Number",
    description: "ISO week of the send, 1 to 53.",
    perRecipient: false,
  },
  { name: "year", label: "Year", description: "Year of the send.", perRecipient: false },
  {
    name: "articleCount",
    label: "Article count",
    description: "How many stories this edition carries.",
    perRecipient: false,
  },
  {
    name: "projectCount",
    label: "Project count",
    description: "How many internal projects this edition carries.",
    perRecipient: false,
  },
  {
    name: "unsubscribe_url",
    label: "Unsubscribe URL",
    description: "Each reader's own signed unsubscribe link. Required in every send.",
    perRecipient: true,
  },
  {
    name: "archive_url",
    label: "This edition in the browser",
    description: "A signed link to this edition's own page, for a View in browser line.",
    perRecipient: true,
  },
  {
    name: "portal_url",
    label: "Edition index URL",
    description: "A signed link to every edition this reader has received.",
    perRecipient: true,
  },
] as const;

const PER_RECIPIENT = new Set(
  RADAR_MERGE_TAGS.filter((tag) => tag.perRecipient).map((tag) => tag.name)
);

export function isPerRecipientTag(name: string): boolean {
  return PER_RECIPIENT.has(name);
}

function buildPattern(): RegExp {
  const names = RADAR_MERGE_TAGS.map((tag) => tag.name).join("|");
  return new RegExp(`\\{\\{(${names})\\}\\}`, "g");
}

/**
 * Exported for tests and for anyone needing to detect tags without substituting.
 *
 * Callers that substitute go through `renderMergeTags`, which builds its own instance: a
 * shared global RegExp carries `lastIndex` between calls, so the second call would start
 * mid-string and miss.
 */
export const MERGE_TAG_PATTERN = buildPattern();

/**
 * Substitute merge tags in one pass.
 *
 * One pass with a callback, so rendered content that happens to contain a placeholder is never
 * substituted a second time. A tag with no value is left literal rather than replaced with an
 * empty string: a visible `{{tag}}` in a preview is a bug someone can see, and a silent gap is
 * not.
 *
 * `keepPerRecipient` leaves the three signed URLs standing, so a send can render everything
 * shared once and resolve those inside its batch loop, per subscriber.
 */
export function renderMergeTags(
  html: string,
  values: Record<string, string>,
  options: { keepPerRecipient?: boolean } = {}
): string {
  return html.replace(buildPattern(), (match, name: string) => {
    if (options.keepPerRecipient && PER_RECIPIENT.has(name)) return match;
    return values[name] ?? match;
  });
}

/** The mergeTags object the Unlayer editor options want, derived from the same table. */
export function unlayerMergeTagOptions(
  samples: Record<string, string>
): Record<string, { name: string; value: string; sample: string }> {
  const options: Record<string, { name: string; value: string; sample: string }> = {};

  for (const tag of RADAR_MERGE_TAGS) {
    options[tag.name] = {
      name: tag.label,
      value: `{{${tag.name}}}`,
      sample: samples[tag.name] ?? `{{${tag.name}}}`,
    };
  }

  return options;
}

/**
 * The tags a built edition can supply on its own, rendered from the same fragments the code
 * renderer uses.
 *
 * This is what stops a template built in Unlayer looking like a different product. An absent
 * block renders as the empty string rather than a placeholder, so the optional row wrapping it
 * can be dropped on export.
 */
export function editionMergeValues(
  edition: EditionEmail,
  options: { wrapInTable?: boolean; headless?: boolean } = {}
): Record<string, string> {
  const wrap = options.wrapInTable ? asTable : identity;

  /**
   * `headless` drops each block's own heading, for the template variant that lifts them into
   * Unlayer text blocks so an editor can reword them. The topic sections keep theirs: a section's
   * eyebrow is its topic name, one per section, and what repeats cannot become a row.
   */
  const heading = options.headless ? { heading: false } : {};

  return {
    edition_label: escapeHtml(edition.editionLabel),
    date_range: escapeHtml(edition.dateLabel),
    tldr: wrap(bulletsBlock(edition.bullets, edition.bulletsNote, heading)),
    top_story: wrap(topStoryBlock(edition, heading)),
    sections: wrap(edition.sections.map(sectionBlock).join("\n")),
    trend_radar: wrap(trendBlock(edition.trends, heading)),
    internal: wrap(internalBlock(edition.internal, heading)),
    one_more_thing: wrap(oneMoreThingBlock(edition.oneMoreThing, heading)),
  };
}

function identity(html: string): string {
  return html;
}

/**
 * Wraps a block in a table of its own, so it can sit inside an Unlayer html block.
 *
 * Every block renderer emits `<tr><td>…</td></tr>`, because in the code renderer it is a row of
 * the 640px shell. Unlayer puts an html block's content inside its own table cell, where a bare
 * `<tr>` is invalid markup and clients disagree about how to recover from it.
 *
 * Empty stays empty rather than becoming an empty table, so `dropEmptyOptionalRows` still sees
 * nothing and removes the row around it.
 *
 * The consequence, worth knowing before reaching for Unlayer's padding controls: these blocks
 * keep the 40px horizontal padding they carry in the code renderer, so the rows holding them are
 * seeded with zero container padding. Changing the gutter on one of them means editing the block,
 * not the row.
 */
function asTable(html: string): string {
  if (html.length === 0) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">\n${html}\n</table>`;
}
