/**
 * The HTML fragments the AI Radar edition is made of.
 *
 * Extracted from edition-template.ts so the code renderer and the merge tags that feed the
 * Unlayer template variants emit the same markup. Without this, a hand-built template renders
 * articles that look like a different product, which is the failure content-renderer.ts says
 * in its own header that it exists to prevent.
 *
 * Every rule the design fixes lives here rather than in the shell:
 *
 *  - Georgia for the top story and the internal headline, Arial elsewhere, so Outlook renders
 *    the design rather than a fallback of it
 *  - article links are text with a 1px rule, the top story a 2px accent rule
 *  - a section renders only when it has items, and the divider belongs to the item, so counts
 *    can vary without anything looking amputated
 *
 * Everything interpolated is escaped: titles and summaries arrive from RSS and from model
 * output, so a stray angle bracket must not be able to break the markup of an email that has
 * already been sent.
 *
 * The types come from edition-template.ts through `import type`, which is erased at compile
 * time, so the two modules do not form a runtime cycle.
 */

import type {
  EditionEmail,
  EmailArticle,
  EmailInternal,
  EmailSection,
  EmailTrend,
} from "./edition-template";

/* -------------------------------------------------------------------- palette */

export const ACCENT = "#ff7901";
export const PRIMARY = "#2d4449";
export const INK = "#1a1d1e";
export const BODY_INK = "#3c4547";
export const MUTED = "#6b7674";
export const RULE = "#dfe3e2";
export const RULE_SOFT = "#ebeeed";
export const TINT = "#e9eeee";
export const CARD = "#fbfbfa";
export const PAGE = "#eceeed";

export const SANS = "Arial,Helvetica,sans-serif";
export const SERIF = "Georgia,'Times New Roman',serif";

/**
 * The dark-mode rules, and the `[data-ogsc]` mirror Outlook.com needs.
 *
 * Lives here rather than inline in the shell because two things emit it: the code renderer's
 * own `<style>`, and the hardening pass that reinstates it in HTML exported from Unlayer, which
 * cannot produce it. Two copies would drift, and a drifted dark mode is invisible until someone
 * with a dark client opens the email.
 *
 * Nothing here uses pure black or white, so nothing inverts into mush. The values were chosen
 * against real clients: `.link-strong` exists because the primary teal is a light-card colour
 * that reads as almost nothing on the dark card, and this keeps text links at 7.5:1 against
 * #1c2224 while leaving the accent button's white label alone.
 */
export const DARK_MODE_RULES = `  @media (prefers-color-scheme: dark) {
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
  [data-ogsc] .link-strong, [data-ogsc] .link-strong a { color: #8fb8ad !important; }`;

/* --------------------------------------------------------------------- escaping */

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

/** An unresolved merge tag and nothing else: `{{archive_url}}`, never `{{a}}b`. */
const MERGE_TAG_ONLY = /^\{\{\w+\}\}$/;

/**
 * Absolute http(s) only: a javascript: or data: href must never reach an inbox.
 *
 * A bare merge tag passes through unchanged. The three signed URLs cannot be resolved when the
 * edition is rendered, because each is bound to one subscriber and the send loop substitutes
 * them later; without this they would fail the URL parse and be dropped, silently turning a
 * link into plain text for every recipient. The pattern is anchored, so an attempt to smuggle
 * `{{x}}javascript:...` is still rejected.
 */
export function safeUrl(value: string | undefined): string | null {
  if (!value) return null;
  if (MERGE_TAG_ONLY.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function link(url: string | undefined, label: string, style: string): string {
  const safe = safeUrl(url);
  const text = escapeHtml(label);
  if (!safe) return text;
  return `<a href="${escapeHtml(safe)}" style="${style}">${text}</a>`;
}

/* ------------------------------------------------------------------ fragments */

export function bulletRow(bullet: { text: string; url: string }): string {
  return `<tr>
        <td width="18" valign="top" style="width:18px; padding:7px 0 0 0; font-family:${SANS}; font-size:14px; line-height:22px; mso-line-height-rule:exactly; color:${ACCENT}; font-weight:bold;">&#8250;</td>
        <td valign="top" style="padding:6px 0 0 0; font-family:${SANS}; font-size:15px; line-height:23px; mso-line-height-rule:exactly; color:#22282a;" class="t-body">${link(
          bullet.url,
          bullet.text,
          "color:#22282a; text-decoration:none; border-bottom:1px solid #b9c3c1;"
        )}</td>
      </tr>`;
}

/**
 * The TL;DR box.
 *
 * Was built inline inside renderEditionEmail. Extracted so a template can place it through a
 * merge tag and get the same box, note included.
 */
export function bulletsBlock(
  bullets: Array<{ text: string; url: string }>,
  note: string | undefined
): string {
  if (bullets.length === 0) return "";

  return `<tr><td class="px" style="padding:28px 40px 0 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="tint" style="background-color:${TINT};">
  <tr><td style="padding:22px 24px 8px 24px; font-family:${SANS}; font-size:12px; line-height:16px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:1.6px; color:${PRIMARY}; text-transform:uppercase;" class="t-strong">This week in 30 seconds</td></tr>
  ${
    note
      ? `<tr><td class="t-muted" style="padding:2px 24px 0 24px; font-family:${SANS}; font-size:12px; line-height:18px; mso-line-height-rule:exactly; color:${MUTED}; font-style:italic;">${escapeHtml(
          note
        )}</td></tr>`
      : ""
  }
  <tr><td style="padding:0 24px 22px 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${bullets.map(bulletRow).join("\n")}
    </table>
  </td></tr>
  </table>
</td></tr>`;
}

/** One story inside a topic section. The rule belongs to the item, not the section. */
export function topicItem(
  item: EmailArticle,
  isFirst: boolean,
  isLast: boolean
): string {
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

export function sectionBlock(section: EmailSection): string {
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

export function trendRow(trend: EmailTrend, isLast: boolean): string {
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

export function trendBlock(trends: EmailTrend[]): string {
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

export function topStoryBlock(data: EditionEmail): string {
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

export function internalBlock(internal: EmailInternal | undefined): string {
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
