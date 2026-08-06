/**
 * The AI Radar Weekly email, as designed in the Claude Design project
 * "AI Radar platform design" (AI Radar Weekly.html).
 *
 * Hand-built table HTML rather than a component library, because the design
 * depends on things react-email cannot express: MSO conditionals, the
 * `[data-ogsc]` dark-mode mirror for Outlook.com, and a light/dark logo pair
 * swapped by media query. Every rule the design fixes is kept here:
 *
 *  - 640px shell, 40px outer padding (20 on mobile), 8px spacing base
 *  - Georgia for the top story and the Link Inside headline, Arial elsewhere,
 *    so Outlook renders the design rather than a fallback of it
 *  - one accent CTA; article links are text with a 1px rule, the top story a 2px
 *    accent rule
 *  - a section renders only when it has items, and the divider belongs to the
 *    item, so counts can vary without anything looking amputated
 *  - dark mode never uses pure black or white, so nothing inverts into mush
 *
 * Everything interpolated here is escaped: titles and summaries arrive from RSS
 * and from model output, so a stray angle bracket must not be able to break the
 * markup of an email that has already been sent.
 */

import {
  ACCENT,
  BODY_INK,
  CARD,
  DARK_MODE_RULES,
  INK,
  MUTED,
  PAGE,
  PRIMARY,
  RULE,
  SANS,
  SERIF,
  TINT,
  bulletsBlock,
  escapeHtml,
  internalBlock,
  safeUrl,
  sectionBlock,
  topStoryBlock,
  topicItem,
  trendBlock,
} from "./edition-blocks";

/**
 * Re-exported because content-renderer.ts and template-renderer.ts have imported it from here
 * since before the fragments moved, and moving a function is not a reason to make every caller
 * change its import.
 */
export { escapeHtml };

export interface EmailArticle {
  title: string;
  summary: string;
  url: string;
  /** Publication name, when it can be derived from the source URL. */
  source?: string;
  /** How many tracked sources covered the same story, when known. */
  coverage?: number;
}

export interface EmailSection {
  /** Topic name, used as the section label. */
  name: string;
  anchor: string;
  items: EmailArticle[];
}

export interface EmailTrend {
  name: string;
  /** Percentage change against the previous fortnight; null when there is no baseline. */
  delta: number | null;
  note: string;
}

export interface EmailInternal {
  title: string;
  body: string;
  url?: string;
}

export interface EditionEmail {
  /** "Week 31 · 2026", shown in the masthead. */
  editionLabel: string;
  dateLabel: string;
  previewText: string;
  subject: string;
  /**
   * The TL;DR headlines and where each one goes.
   *
   * The field was called `anchor` and always held the article's own URL, while the real
   * anchors (`#top-story`, `topic-*`) existed and nothing used them. The value is right: an
   * in-document anchor is not reliable in email, since Gmail strips `id`. The name was wrong.
   */
  bullets: Array<{ text: string; url: string }>;
  /** Italic caption under the TL;DR heading, used to explain a thin week. */
  bulletsNote?: string;
  topStory?: EmailArticle;
  sections: EmailSection[];
  trends: EmailTrend[];
  internal?: EmailInternal;
  portalUrl: string;
  unsubscribeUrl: string;
  /** Absolute https URLs; relative paths never resolve in an email client. */
  logoOnLight: string;
  logoOnDark: string;
  footerLogoOnLight: string;
  footerLogoOnDark: string;
  sourceCount?: number;
  /** Optional editorial image for the top story. */
  topStoryImage?: string;
  companyLine: string;
}

/**
 * Insertion points for editor-authored custom blocks.
 *
 * Explicit anchors, because the previous implementation injected blocks by
 * regex-matching a heading's text ("This Week", "Project"): any wording change
 * made the blocks disappear from a sent newsletter with no error anywhere.
 */
export const BLOCK_POSITIONS = [
  "before-articles",
  "after-articles",
  "before-projects",
  "after-projects",
] as const;

export type BlockPosition = (typeof BLOCK_POSITIONS)[number];

export const BLOCK_ANCHORS: Record<BlockPosition, string> = {
  "before-articles": "<!--radar:before-articles-->",
  "after-articles": "<!--radar:after-articles-->",
  "before-projects": "<!--radar:before-projects-->",
  "after-projects": "<!--radar:after-projects-->",
};

/* ---------------------------------------------------------------- the email */

export function renderEditionEmail(data: EditionEmail): string {
  const portal = safeUrl(data.portalUrl) ?? "";
  const unsubscribe = safeUrl(data.unsubscribeUrl) ?? "";

  const bullets = bulletsBlock(data.bullets, data.bulletsNote);
  const topStory = topStoryBlock(data);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(data.subject)}</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<![endif]-->
<style>
  a { color: ${PRIMARY}; }
  a:hover { color: ${ACCENT}; }
  @media only screen and (max-width: 620px) {
    .wrap { width: 100% !important; }
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .stack { display: block !important; width: 100% !important; max-width: 100% !important; }
    .thumb { padding: 0 0 16px 0 !important; }
    .h1 { font-size: 27px !important; line-height: 32px !important; }
    .h2 { font-size: 19px !important; line-height: 25px !important; }
    .cta a { display: block !important; }
    /* A named edition can be far wider than the 130px logo it shares the row with. At
       320px "AI Act special edition" wrapped to two lines and pushed the wordmark out of
       alignment, so on a narrow screen the masthead stacks instead of competing. The
       align="right" attributes stay on the cells: Outlook's Word engine ignores this
       query and needs them. */
    .masthead-cell { display: block !important; width: 100% !important; text-align: left !important; }
    .masthead-logo { float: none !important; }
    .masthead-logo td { text-align: left !important; }
    .masthead-meta { padding-top: 10px !important; }
  }
${DARK_MODE_RULES}
</style>
</head>
<body class="body-bg" style="margin:0; padding:0; background-color:${PAGE}; -webkit-font-smoothing:antialiased;">
<span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all;">${escapeHtml(
    data.previewText
  )}</span>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="body-bg" style="background-color:${PAGE};">
<tr><td align="center" style="padding:24px 12px 40px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="wrap card" style="width:640px; max-width:640px; background-color:${CARD};">

<!-- MASTHEAD -->
<tr><td class="px" style="padding:26px 40px 18px 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
    <td align="left" style="font-family:${SANS}; font-size:20px; line-height:24px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:2px; color:${PRIMARY};" class="t-strong masthead-cell">AI&nbsp;RADAR<span style="color:${ACCENT};">.</span></td>
    <td align="right" valign="top" style="font-family:${SANS};" class="masthead-cell">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" class="masthead-logo"><tr><td align="right" style="padding-bottom:6px;">
        <img class="logo-light" src="${escapeHtml(
          data.logoOnLight
        )}" width="130" height="17" alt="Linkroad" style="display:block; border:0; outline:none; text-decoration:none; font-family:${SANS}; font-size:11px; color:${MUTED}; width:130px; height:17px;">
        <!--[if !mso]><!--><img class="logo-dark" src="${escapeHtml(
          data.logoOnDark
        )}" width="130" height="17" alt="Linkroad" style="display:none; max-height:0; overflow:hidden; mso-hide:all; border:0; outline:none; text-decoration:none; font-family:${SANS}; font-size:11px; color:${MUTED}; width:130px; height:17px;"><!--<![endif]-->
      </td></tr><tr><td align="right" style="font-family:${SANS}; font-size:11px; line-height:14px; mso-line-height-rule:exactly; letter-spacing:1.2px; color:${MUTED}; text-transform:uppercase;" class="t-muted masthead-meta">${escapeHtml(
    data.editionLabel
  )} &nbsp;·&nbsp; ${escapeHtml(data.dateLabel)}</td></tr></table>
    </td>
  </tr>
  </table>
</td></tr>
<tr><td class="px" style="padding:0 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td width="64" height="3" style="width:64px; height:3px; background-color:${ACCENT}; line-height:3px; font-size:0;">&nbsp;</td>
    <td height="3" style="height:3px; background-color:${RULE}; line-height:3px; font-size:0;">&nbsp;</td>
  </tr></table>
</td></tr>

${bullets}
${topStory}
${topStory ? `<tr><td class="px" style="padding:30px 40px 0 40px;"><div class="rule" style="border-top:1px solid ${RULE}; font-size:0; line-height:0;">&nbsp;</div></td></tr>` : ""}
${BLOCK_ANCHORS["before-articles"]}
${data.sections.map(sectionBlock).join("\n")}
${BLOCK_ANCHORS["after-articles"]}
${trendBlock(data.trends)}
${BLOCK_ANCHORS["before-projects"]}
${internalBlock(data.internal)}
${BLOCK_ANCHORS["after-projects"]}

<!-- CTA -->
<tr><td class="px" align="center" style="padding:30px 40px 34px 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="cta"><tr>
    <td align="center" bgcolor="${ACCENT}" style="background-color:${ACCENT}; border-radius:4px;">
      <a href="${escapeHtml(portal)}" style="display:block; padding:14px 30px; font-family:${SANS}; font-size:15px; line-height:20px; mso-line-height-rule:exactly; font-weight:bold; color:#ffffff; text-decoration:none;">Read the full feed &rarr;</a>
    </td>
  </tr></table>
</td></tr>

<!-- FOOTER -->
<tr><td class="px" style="padding:0 40px;"><div class="rule" style="border-top:1px solid ${RULE}; font-size:0; line-height:0;">&nbsp;</div></td></tr>
<tr><td class="px" style="padding:22px 40px 30px 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-bottom:14px;">
    <img class="logo-light" src="${escapeHtml(
      data.footerLogoOnLight
    )}" width="100" height="48" alt="Linkroad" style="display:block; border:0; outline:none; text-decoration:none; font-family:${SANS}; font-size:11px; color:${MUTED}; width:100px; height:48px;">
    <!--[if !mso]><!--><img class="logo-dark" src="${escapeHtml(
      data.footerLogoOnDark
    )}" width="100" height="48" alt="Linkroad" style="display:none; max-height:0; overflow:hidden; mso-hide:all; border:0; outline:none; text-decoration:none; font-family:${SANS}; font-size:11px; color:${MUTED}; width:100px; height:48px;"><!--<![endif]-->
  </td></tr></table>
  <div style="font-family:${SANS}; font-size:12px; line-height:20px; mso-line-height-rule:exactly; color:${MUTED};" class="t-muted">
    <strong style="color:${PRIMARY}; letter-spacing:1px;" class="t-strong">AI RADAR WEEKLY</strong> &nbsp;·&nbsp; curated by the Linkroad AI practice${
      data.sourceCount ? ` from ${data.sourceCount} tracked sources` : ""
    }.
  </div>
  <div class="link-strong" style="padding-top:10px; font-family:${SANS}; font-size:12px; line-height:20px; mso-line-height-rule:exactly; color:${MUTED};">
    <a href="${escapeHtml(portal)}" style="color:${PRIMARY}; text-decoration:underline;">AI Radar portal</a> &nbsp;·&nbsp;
    <a href="${escapeHtml(unsubscribe)}" style="color:${PRIMARY}; text-decoration:underline;">Unsubscribe</a>
  </div>
  <div style="padding-top:12px; font-family:${SANS}; font-size:11px; line-height:17px; mso-line-height-rule:exactly; color:#8a9491;" class="t-muted">
    Summaries are machine-generated from public sources and may contain errors, so verify before client use.<br>
    ${escapeHtml(data.companyLine)}
  </div>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Plain-text alternative. Sent alongside the HTML: a text part measurably helps
 * deliverability, and some clients show it rather than the HTML.
 */
export function renderEditionText(data: EditionEmail): string {
  const lines: string[] = [];

  lines.push(`AI RADAR WEEKLY`);
  lines.push(`${data.editionLabel} · ${data.dateLabel}`);
  lines.push("");

  if (data.bullets.length) {
    lines.push("THIS WEEK IN 30 SECONDS");
    for (const bullet of data.bullets) lines.push(`- ${bullet.text}`);
    lines.push("");
  }

  if (data.topStory) {
    lines.push("TOP STORY");
    lines.push(data.topStory.title);
    lines.push(data.topStory.summary);
    if (data.topStory.url) lines.push(data.topStory.url);
    lines.push("");
  }

  for (const section of data.sections) {
    if (!section.items.length) continue;
    lines.push(section.name.toUpperCase());
    for (const item of section.items) {
      lines.push(`- ${item.title}`);
      if (item.summary) lines.push(`  ${item.summary}`);
      if (item.url) lines.push(`  ${item.url}`);
    }
    lines.push("");
  }

  if (data.trends.length) {
    lines.push("TREND RADAR");
    for (const trend of data.trends) {
      const figure = trend.delta === null ? "new" : `${trend.delta > 0 ? "+" : ""}${trend.delta}%`;
      lines.push(`- ${trend.name} (${figure}): ${trend.note}`);
    }
    lines.push("");
  }

  if (data.internal) {
    lines.push("INTERNAL");
    lines.push(data.internal.title);
    lines.push(data.internal.body);
    if (data.internal.url) lines.push(data.internal.url);
    lines.push("");
  }

  lines.push(`Read the full feed: ${data.portalUrl}`);
  lines.push(`Unsubscribe: ${data.unsubscribeUrl}`);
  lines.push("");
  lines.push(
    "Summaries are machine-generated from public sources and may contain errors, so verify before client use."
  );
  lines.push(data.companyLine);

  return lines.join("\n");
}

/* ------------------------------------------- merge-tag fragments for templates */

/**
 * Article list for a custom Unlayer template's {{articles}} tag, in the same
 * visual language as the built-in edition, so a hand-built template does not
 * look like a different product.
 */
export function renderArticleItemsHtml(items: EmailArticle[]): string {
  if (items.length === 0) {
    return `<div style="font-family:${SANS}; font-size:14px; line-height:22px; color:${MUTED};">No stories this week.</div>`;
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${items.map((item, index) => topicItem(item, index === 0, index === items.length - 1)).join("\n")}
</table>`;
}

export function renderProjectItemsHtml(
  projects: Array<{ name: string; description: string; team?: string; impact?: string | null }>
): string {
  if (projects.length === 0) {
    return `<div style="font-family:${SANS}; font-size:14px; line-height:22px; color:${MUTED};">No internal work this week.</div>`;
  }

  return projects
    .map(
      (project) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px;">
  <tr><td style="background-color:${TINT}; padding:18px 20px;" class="tint">
    <div style="font-family:${SERIF}; font-size:19px; line-height:26px; color:${INK}; padding-bottom:6px;" class="t-strong">${escapeHtml(
      project.name
    )}</div>
    <div style="font-family:${SANS}; font-size:14px; line-height:22px; color:${BODY_INK};" class="t-body">${escapeHtml(
      project.description
    )}</div>
    ${
      project.team
        ? `<div style="padding-top:8px; font-family:${SANS}; font-size:11px; letter-spacing:1px; color:${MUTED}; text-transform:uppercase;" class="t-muted">${escapeHtml(
            project.team
          )}</div>`
        : ""
    }
    ${
      project.impact
        ? `<div style="padding-top:8px; font-family:${SANS}; font-size:14px; line-height:21px; font-weight:bold; color:${PRIMARY};" class="t-strong">${escapeHtml(
            project.impact
          )}</div>`
        : ""
    }
  </td></tr>
</table>`
    )
    .join("\n");
}
