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

const ACCENT = "#ff7901";
const PRIMARY = "#2d4449";
const INK = "#1a1d1e";
const BODY_INK = "#3c4547";
const MUTED = "#6b7674";
const RULE = "#dfe3e2";
const RULE_SOFT = "#ebeeed";
const TINT = "#e9eeee";
const CARD = "#fbfbfa";
const PAGE = "#eceeed";

const SANS = "Arial,Helvetica,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

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
  bullets: Array<{ text: string; anchor: string }>;
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

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#039;";
    }
  });
}

/** Absolute http(s) only: a javascript: or data: href must never reach an inbox. */
function safeUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function link(url: string | undefined, label: string, style: string): string {
  const safe = safeUrl(url);
  const text = escapeHtml(label);
  if (!safe) return text;
  return `<a href="${escapeHtml(safe)}" style="${style}">${text}</a>`;
}

/* ------------------------------------------------------------------ fragments */

function bulletRow(bullet: { text: string; anchor: string }): string {
  return `<tr>
        <td width="18" valign="top" style="width:18px; padding:7px 0 0 0; font-family:${SANS}; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:${ACCENT}; font-weight:bold;">&#8250;</td>
        <td valign="top" style="padding:6px 0 0 0; font-family:${SANS}; font-size:15px; line-height:23px; mso-line-height-rule:exactly; color:#22282a;" class="t-body">${link(
          bullet.anchor,
          bullet.text,
          "color:#22282a; text-decoration:none; border-bottom:1px solid #b9c3c1;"
        )}</td>
      </tr>`;
}

/** One story inside a topic section. The rule belongs to the item, not the section. */
function topicItem(item: EmailArticle, isFirst: boolean, isLast: boolean): string {
  const meta = [item.source, item.coverage ? `${item.coverage} sources` : null]
    .filter(Boolean)
    .join(" · ");

  const cellStyle = isFirst
    ? `padding-bottom:${isLast ? "0" : "16px"};`
    : `border-top:1px solid ${RULE_SOFT}; padding-top:16px;${isLast ? "" : " padding-bottom:16px;"}`;

  return `<tr><td class="${isFirst ? "" : "rule"}" style="${cellStyle}">
      <div class="h2 t-strong" style="font-family:${SANS}; font-size:17px; line-height:24px; mso-line-height-rule:exactly; font-weight:bold; color:${INK}; padding-bottom:5px;">${link(
        item.url,
        item.title,
        `color:${INK}; text-decoration:none;`
      )}</div>
      <div class="t-body" style="font-family:${SANS}; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:${BODY_INK};${meta ? " padding-bottom:6px;" : ""}">${escapeHtml(
        item.summary
      )}</div>
      ${
        meta
          ? `<div class="t-muted" style="font-family:${SANS}; font-size:11px; line-height:14px; mso-line-height-rule:exactly; letter-spacing:1px; color:${MUTED}; text-transform:uppercase;">${escapeHtml(
              meta
            )}</div>`
          : ""
      }
    </td></tr>`;
}

function sectionBlock(section: EmailSection): string {
  if (section.items.length === 0) return "";

  const items = section.items
    .map((item, index) =>
      topicItem(item, index === 0, index === section.items.length - 1)
    )
    .join("\n");

  return `<tr><td class="px" style="padding:26px 40px 0 40px;"><div class="rule" style="border-top:1px solid ${RULE}; font-size:0; line-height:0;">&nbsp;</div></td></tr>
<tr><td class="px" id="${escapeHtml(section.anchor)}" style="padding:26px 40px 0 40px;">
  <div style="font-family:${SANS}; font-size:11px; line-height:16px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.6px; color:${ACCENT}; text-transform:uppercase; padding-bottom:14px;">${escapeHtml(
    section.name
  )}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${items}
  </table>
</td></tr>`;
}

function trendRow(trend: EmailTrend, isLast: boolean): string {
  // No baseline means no honest percentage: say "new" rather than invent one.
  const figure =
    trend.delta === null
      ? "new"
      : `${trend.delta > 0 ? "&#9650;&nbsp;" : trend.delta < 0 ? "&#9660;&nbsp;" : ""}${Math.abs(
          trend.delta
        )}%`;

  return `<tr>
        <td valign="top" style="padding:12px 0 0 0; font-family:${SANS}; font-size:15px; line-height:22px; mso-line-height-rule:exactly; font-weight:bold; color:${INK};" class="t-strong">${escapeHtml(
          trend.name
        )}</td>
        <td valign="top" align="right" width="72" class="trend-figure" style="width:72px; padding:12px 0 0 0; font-family:${SANS}; font-size:14px; line-height:22px; mso-line-height-rule:exactly; font-weight:bold; color:${PRIMARY};">${figure}</td>
      </tr>
      <tr><td colspan="2" style="padding:2px 0 ${isLast ? "0" : "12px"} 0; font-family:${SANS}; font-size:14px; line-height:21px; mso-line-height-rule:exactly; color:${BODY_INK};" class="t-body">${escapeHtml(
        trend.note
      )}</td></tr>
      ${
        isLast
          ? ""
          : `<tr><td colspan="2" class="rule" style="border-top:1px solid #d6dddc; font-size:0; line-height:0;">&nbsp;</td></tr>`
      }`;
}

function trendBlock(trends: EmailTrend[]): string {
  if (trends.length === 0) return "";

  return `<tr><td class="px" id="radar" style="padding:30px 40px 0 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="tint" style="background-color:${TINT};">
  <tr><td height="3" style="height:3px; background-color:${PRIMARY}; font-size:0; line-height:3px;">&nbsp;</td></tr>
  <tr><td style="padding:20px 24px 4px 24px;">
    <div style="font-family:${SANS}; font-size:11px; line-height:16px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.6px; color:${PRIMARY}; text-transform:uppercase;" class="t-strong">Trend radar &nbsp;·&nbsp; accelerating this week</div>
  </td></tr>
  <tr><td style="padding:0 24px 22px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${trends.map((trend, index) => trendRow(trend, index === trends.length - 1)).join("\n")}
    </table>
  </td></tr>
  </table>
</td></tr>`;
}

function topStoryBlock(data: EditionEmail): string {
  const story = data.topStory;
  if (!story) return "";

  const image = safeUrl(data.topStoryImage);
  const meta = story.source ? `Lead: ${story.source}` : "";

  return `<tr><td class="px" id="top-story" style="padding:34px 40px 0 40px;">
  <div style="font-family:${SANS}; font-size:11px; line-height:16px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.6px; color:${ACCENT}; text-transform:uppercase; padding-bottom:10px;">Top story</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
    <td valign="top" class="stack" style="${image ? "width:380px;" : "width:100%;"}">
      <div class="h1 t-strong" style="font-family:${SERIF}; font-size:30px; line-height:36px; mso-line-height-rule:exactly; font-weight:normal; color:${INK}; padding-bottom:12px;">${link(
        story.url,
        story.title,
        `color:${INK}; text-decoration:none;`
      )}</div>
      <div class="t-body" style="font-family:${SANS}; font-size:15px; line-height:24px; mso-line-height-rule:exactly; color:${BODY_INK}; padding-bottom:14px;">${escapeHtml(
        story.summary
      )}</div>
    </td>
    ${
      image
        ? `<td width="24" class="stack" style="width:24px; font-size:0; line-height:0;">&nbsp;</td>
    <td valign="top" align="right" width="152" class="stack thumb" style="width:152px;">
      <img src="${escapeHtml(image)}" width="152" height="114" alt="${escapeHtml(
        story.title
      )}" style="display:block; width:152px; height:auto; border:1px solid ${RULE}; background-color:${TINT}; font-family:${SANS}; font-size:11px; line-height:16px; color:${MUTED};">
    </td>`
        : ""
    }
  </tr>
  </table>
  ${
    story.coverage || meta
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    ${
      story.coverage
        ? `<td class="badge" style="background-color:${TINT}; padding:5px 9px; font-family:${SANS}; font-size:10px; line-height:14px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.2px; color:${PRIMARY}; text-transform:uppercase;">Covered by ${story.coverage} sources</td>
    <td width="12" style="width:12px; font-size:0;">&nbsp;</td>`
        : ""
    }
    ${
      meta
        ? `<td style="font-family:${SANS}; font-size:11px; line-height:14px; mso-line-height-rule:exactly; letter-spacing:1px; color:${MUTED}; text-transform:uppercase;" class="t-muted">${escapeHtml(
            meta
          )}</td>`
        : ""
    }
  </tr></table>`
      : ""
  }
  ${
    safeUrl(story.url)
      ? `<div class="link-strong" style="padding-top:14px; font-family:${SANS}; font-size:14px; line-height:20px; mso-line-height-rule:exactly;">${link(
          story.url,
          "Read the analysis",
          `color:${PRIMARY}; font-weight:bold; text-decoration:none; border-bottom:2px solid ${ACCENT};`
        )}</div>`
      : ""
  }
</td></tr>`;
}

function internalBlock(internal: EmailInternal | undefined): string {
  if (!internal) return "";

  return `<tr><td class="px" style="padding:30px 40px 0 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background-color:${PRIMARY}; padding:4px 8px; font-family:${SANS}; font-size:10px; line-height:14px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.4px; color:#ffffff; text-transform:uppercase;">Internal</td>
  </tr></table>
  <div class="h2 t-strong" style="font-family:${SERIF}; font-size:21px; line-height:28px; mso-line-height-rule:exactly; color:${INK}; padding:12px 0 6px 0;">${link(
    internal.url,
    internal.title,
    `color:${INK}; text-decoration:none;`
  )}</div>
  <div class="t-body" style="font-family:${SANS}; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:${BODY_INK};">${escapeHtml(
    internal.body
  )}</div>
</td></tr>`;
}

/* ---------------------------------------------------------------- the email */

export function renderEditionEmail(data: EditionEmail): string {
  const portal = safeUrl(data.portalUrl) ?? "";
  const unsubscribe = safeUrl(data.unsubscribeUrl) ?? "";

  const bullets = data.bullets.length
    ? `<tr><td class="px" style="padding:28px 40px 0 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="tint" style="background-color:${TINT};">
  <tr><td style="padding:22px 24px 8px 24px; font-family:${SANS}; font-size:12px; line-height:16px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.6px; color:${PRIMARY}; text-transform:uppercase;" class="t-strong">This week in 30 seconds</td></tr>
  ${
    data.bulletsNote
      ? `<tr><td class="t-muted" style="padding:2px 24px 0 24px; font-family:${SANS}; font-size:12px; line-height:18px; mso-line-height-rule:exactly; color:${MUTED}; font-style:italic;">${escapeHtml(
          data.bulletsNote
        )}</td></tr>`
      : ""
  }
  <tr><td style="padding:0 24px 22px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${data.bullets.map(bulletRow).join("\n")}
    </table>
  </td></tr>
  </table>
</td></tr>`
    : "";

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
  }
  @media (prefers-color-scheme: dark) {
    .logo-light { display: none !important; max-height: 0 !important; overflow: hidden !important; }
    .logo-dark { display: block !important; max-height: none !important; }
    .body-bg { background-color: #14191a !important; }
    .card { background-color: #1c2224 !important; }
    .tint { background-color: #232b2c !important; }
    .t-strong, .t-strong a { color: #eef1f0 !important; }
    .t-body, .t-body a { color: #c3cbc9 !important; }
    .t-muted { color: #94a09d !important; }
    .rule { border-color: #303a3b !important; }
    .badge { background-color: #2b3436 !important; color: #cdd5d3 !important; }
    .trend-figure { color: #8fb8ad !important; }
    /* The primary teal is a light-card colour; on the dark card it reads as
       almost nothing. This step keeps text links at 7.5:1 against #1c2224.
       Scoped to a class rather than every anchor, so the accent button's white
       label is not overridden along with them. */
    .link-strong, .link-strong a, a.link-strong { color: #8fb8ad !important; }
  }
  [data-ogsc] .logo-light { display: none !important; max-height: 0 !important; overflow: hidden !important; }
  [data-ogsc] .logo-dark { display: block !important; max-height: none !important; }
  [data-ogsc] .body-bg { background-color: #14191a !important; }
  [data-ogsc] .card { background-color: #1c2224 !important; }
  [data-ogsc] .tint { background-color: #232b2c !important; }
  [data-ogsc] .t-strong, [data-ogsc] .t-strong a { color: #eef1f0 !important; }
  [data-ogsc] .t-body, [data-ogsc] .t-body a { color: #c3cbc9 !important; }
  [data-ogsc] .t-muted { color: #94a09d !important; }
  [data-ogsc] .rule { border-color: #303a3b !important; }
  [data-ogsc] .badge { background-color: #2b3436 !important; color: #cdd5d3 !important; }
  [data-ogsc] .trend-figure { color: #8fb8ad !important; }
  [data-ogsc] .link-strong, [data-ogsc] .link-strong a { color: #8fb8ad !important; }
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
    <td align="left" style="font-family:${SANS}; font-size:20px; line-height:24px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:2px; color:${PRIMARY};" class="t-strong">AI&nbsp;RADAR<span style="color:${ACCENT};">.</span></td>
    <td align="right" valign="top" style="font-family:${SANS};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr><td align="right" style="padding-bottom:6px;">
        <img class="logo-light" src="${escapeHtml(
          data.logoOnLight
        )}" width="130" height="17" alt="Linkroad" style="display:block; border:0; outline:none; text-decoration:none; font-family:${SANS}; font-size:11px; color:${MUTED}; width:130px; height:17px;">
        <!--[if !mso]><!--><img class="logo-dark" src="${escapeHtml(
          data.logoOnDark
        )}" width="130" height="17" alt="Linkroad" style="display:none; max-height:0; overflow:hidden; mso-hide:all; border:0; outline:none; text-decoration:none; font-family:${SANS}; font-size:11px; color:${MUTED}; width:130px; height:17px;"><!--<![endif]-->
      </td></tr><tr><td align="right" style="font-family:${SANS}; font-size:11px; line-height:14px; mso-line-height-rule:exactly; letter-spacing:1.2px; color:${MUTED}; text-transform:uppercase;" class="t-muted">${escapeHtml(
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
