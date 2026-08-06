/**
 * v3 of the AI Radar Weekly: the frame decomposed as far as a design can go.
 *
 * v2 hands the editor the masthead, the copy, the call to action and the footer. v3 goes further
 * and lifts the four block headings out of the code into Unlayer text blocks, so "This week in 30
 * seconds", "Top story", "Trend radar" and the "Internal" badge become words an editor can change,
 * recolour and reorder.
 *
 * WHAT COULD NOT BE CONVERTED, and why. This is the list the spec's Risk 2 asked for, written now
 * that it is known rather than promised:
 *
 *  1. Anything repeating N times. The articles inside a topic section, the topic sections
 *     themselves, and the rows of the trend radar. A design has no loop, and the sections come
 *     from `article.category` at runtime, so not even a row per known topic can be pre-seeded.
 *     These stay merge tags in v3 exactly as in v2. This is the floor, not a shortcoming.
 *  2. A topic section's eyebrow. It is the topic's name, one per section, so it repeats and
 *     follows rule 1. The four headings v3 does lift are the ones that appear exactly once.
 *  3. The 64px accent rule. Unlayer's divider draws one colour across the full width; the design
 *     wants 64px of accent then a hairline. It is an html block, editable as HTML without the
 *     visual controls.
 *  4. The "Covered by N sources" badge and the "Lead:" caption. Inline table cells whose presence
 *     depends on the data, so they live inside {{top_story}}.
 *  5. The light/dark logo pair and its MSO conditional. Unlayer emits neither a conditional
 *     comment nor a media-query swap; the pair is seeded as two images with the class hooks, and
 *     lib/email/harden-export.ts reinstates the conditional on export.
 *  6. The dark-mode block and the [data-ogsc] mirror. Same reason. Injected on export.
 *
 * So "full conversion" means every part of the frame that appears once is a row. It does not mean
 * the merge tags go away, and it cannot.
 */

import { RADAR_HEADLESS_MARKER } from "@/lib/email/merge-tags";

interface Branding {
  logoUrl: string;
  bannerUrl: string;
}

const ACCENT = "#ff7901";
const PRIMARY = "#2d4449";
const MUTED = "#6b7674";
const TINT = "#e9eeee";
const CARD = "#fbfbfa";
const PAGE = "#eceeed";
const SANS = "Arial,Helvetica,sans-serif";

function assetBase(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://newsletter4link.vercel.app";
  return `${appUrl.replace(/\/$/, "")}/email`;
}

function text(
  id: string,
  html: string,
  values: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id,
    type: "text",
    values: {
      containerPadding: "0px 40px",
      anchor: "",
      fontSize: "14px",
      textAlign: "left",
      lineHeight: "150%",
      linkStyle: {
        inherit: false,
        linkColor: PRIMARY,
        linkHoverColor: ACCENT,
        linkUnderline: true,
        linkHoverUnderline: true,
      },
      hideDesktop: false,
      displayCondition: null,
      text: html,
      ...values,
    },
  };
}

function rawHtml(
  id: string,
  html: string,
  containerPadding = "0px"
): Record<string, unknown> {
  return {
    id,
    type: "html",
    values: {
      containerPadding,
      anchor: "",
      hideDesktop: false,
      displayCondition: null,
      html,
    },
  };
}

/**
 * Marks a merge tag as the body of its optional row.
 *
 * Load-bearing in v3, more than in v2. The heading shares the row with the body, so without the
 * marker the hardening pass judges the row by its whole text, finds the heading, and keeps an
 * otherwise empty row alive. That is the exact bug a test caught here.
 */
function body(tag: string): string {
  return `<div class="radar-body">${tag}</div>`;
}

/** An eyebrow: the small uppercase label above a block. Editable, which is the point of v3. */
function eyebrow(id: string, label: string, color: string): Record<string, unknown> {
  return text(
    id,
    `<p style="line-height: 145%; letter-spacing: 1.6px; text-transform: uppercase;"><strong>${label}</strong></p>`,
    { containerPadding: "26px 40px 10px", fontSize: "11px", color }
  );
}

function row(
  id: string,
  contents: Array<Record<string, unknown>>,
  options: {
    rowClasses?: string;
    columnClasses?: string;
    columnBackground?: string;
    padding?: string;
  } = {}
): Record<string, unknown> {
  return {
    id,
    cells: [1],
    columns: [
      {
        id: `${id}-col`,
        contents,
        values: {
          backgroundColor: options.columnBackground ?? "",
          padding: options.padding ?? "0px",
          border: {},
          borderRadius: "0px",
          _meta: {
            htmlID: `u_column_${id}`,
            htmlClassNames: options.columnClasses ?? "",
          },
        },
      },
    ],
    values: {
      displayCondition: null,
      columns: false,
      backgroundColor: "",
      columnsBackgroundColor: "",
      backgroundImage: {
        url: "",
        fullWidth: true,
        repeat: "no-repeat",
        size: "custom",
        position: "center",
      },
      padding: "0px",
      anchor: "",
      hideDesktop: false,
      _meta: { htmlID: `u_row_${id}`, htmlClassNames: options.rowClasses ?? "" },
    },
  };
}

export function createRadarUnlayerTemplate(branding: Branding): {
  design: object;
  html: string;
} {
  const logoHtml = branding.logoUrl
    ? `<div style="text-align:right; padding-bottom:10px;"><img src="${branding.logoUrl}" width="130" alt="Linkroad" style="display:inline-block; border:0; width:130px;"></div>`
    : `<div style="text-align:right; padding-bottom:10px;"><img class="logo-light" src="${assetBase()}/linkroad-h-on-light.png" width="130" height="17" alt="Linkroad" style="display:inline-block; border:0; width:130px; height:17px;"><img class="logo-dark" src="${assetBase()}/linkroad-h-on-dark.png" width="130" height="17" alt="Linkroad" style="display:none; max-height:0; overflow:hidden; mso-hide:all; border:0; width:130px; height:17px;"></div>`;

  const design = {
    counters: {
      u_column: 16,
      u_row: 16,
      u_content_text: 12,
      u_content_html: 9,
      u_content_button: 1,
    },
    body: {
      id: "body",
      rows: [
        // Declares that this template owns the block headings. lib/email/merge-tags.ts finds it
        // and renders the blocks headless, or every heading would appear twice.
        row("headless-marker", [rawHtml("headless-marker-html", RADAR_HEADLESS_MARKER)], {
          rowClasses: "u_row",
        }),

        row(
          "view-in-browser",
          [
            text(
              "view-in-browser-text",
              `<p style="line-height: 150%;"><a href="{{archive_url}}" rel="noopener" target="_blank">View in browser</a></p>`,
              {
                containerPadding: "0px 40px 8px",
                fontSize: "11px",
                textAlign: "right",
                color: MUTED,
              }
            ),
          ],
          { rowClasses: "u_row t-muted" }
        ),

        row(
          "masthead",
          [
            rawHtml("masthead-logo", logoHtml, "26px 40px 0px"),
            text(
              "masthead-wordmark",
              `<p style="line-height: 120%; letter-spacing: 2px;"><strong>AI&nbsp;RADAR<span style="color: ${ACCENT};">.</span></strong></p>`,
              { containerPadding: "0px 40px", fontSize: "20px", color: PRIMARY }
            ),
            text(
              "masthead-meta",
              `<p style="line-height: 140%; letter-spacing: 1.2px; text-transform: uppercase;">{{edition_label}} &nbsp;·&nbsp; {{date_range}}</p>`,
              { containerPadding: "6px 40px 18px", fontSize: "11px", color: MUTED }
            ),
          ],
          { rowClasses: "u_row card", columnClasses: "u_column t-strong", columnBackground: CARD }
        ),

        row(
          "accent-rule",
          [
            rawHtml(
              "accent-rule-html",
              `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
  <td width="64" height="3" style="width:64px; height:3px; background-color:${ACCENT}; line-height:3px; font-size:0;">&nbsp;</td>
  <td height="3" class="hairline" style="height:3px; background-color:#dfe3e2; line-height:3px; font-size:0;">&nbsp;</td>
</tr></table>`,
              "0px 40px"
            ),
          ],
          { rowClasses: "u_row card", columnClasses: "u_column rule", columnBackground: CARD }
        ),

        row(
          "intro",
          [
            text(
              "intro-text",
              `<p style="line-height: 160%;">The week in AI, curated by the Linkroad AI practice. Edit or remove this paragraph: it is yours.</p>`,
              { containerPadding: "22px 40px 0px", fontSize: "15px", color: "#3c4547" }
            ),
          ],
          { rowClasses: "u_row card", columnClasses: "u_column t-body", columnBackground: CARD }
        ),

        // The four blocks whose headings v3 owns. Heading and body share a row, so the hardening
        // pass takes both when the body renders nothing.
        row(
          "tldr",
          [
            eyebrow("tldr-heading", "This week in 30 seconds", PRIMARY),
            rawHtml("tldr-html", body("{{tldr}}")),
          ],
          {
            rowClasses: "u_row card radar-optional",
            columnClasses: "u_column tint",
            columnBackground: CARD,
          }
        ),
        row(
          "top-story",
          [
            eyebrow("top-story-heading", "Top story", ACCENT),
            rawHtml("top-story-html", body("{{top_story}}")),
          ],
          {
            rowClasses: "u_row card radar-optional",
            columnClasses: "u_column",
            columnBackground: CARD,
          }
        ),
        row("sections", [rawHtml("sections-html", "{{sections}}")], {
          rowClasses: "u_row card",
          columnClasses: "u_column",
          columnBackground: CARD,
        }),
        row(
          "trends",
          [
            eyebrow("trends-heading", "Trend radar &nbsp;·&nbsp; accelerating this week", PRIMARY),
            rawHtml("trends-html", body("{{trend_radar}}")),
          ],
          {
            rowClasses: "u_row card radar-optional",
            columnClasses: "u_column tint",
            columnBackground: CARD,
          }
        ),
        row(
          "internal",
          [
            eyebrow("internal-heading", "Internal", ACCENT),
            rawHtml("internal-html", body("{{internal}}")),
          ],
          {
            rowClasses: "u_row card radar-optional",
            columnClasses: "u_column",
            columnBackground: CARD,
          }
        ),

        row(
          "cta",
          [
            {
              id: "cta-button",
              type: "button",
              values: {
                containerPadding: "30px 40px 34px",
                anchor: "",
                href: { name: "web", values: { href: "{{portal_url}}", target: "_blank" } },
                buttonColors: {
                  color: "#ffffff",
                  backgroundColor: ACCENT,
                  hoverColor: "#ffffff",
                  hoverBackgroundColor: "#e56d00",
                },
                size: { autoWidth: true, width: "100%" },
                fontSize: "15px",
                textAlign: "center",
                lineHeight: "133%",
                padding: "14px 30px",
                border: {},
                borderRadius: "4px",
                hideDesktop: false,
                displayCondition: null,
                text: `<span style="line-height: 20px;"><strong>Read the full feed &rarr;</strong></span>`,
                calculatedWidth: 220,
                calculatedHeight: 48,
              },
            },
          ],
          { rowClasses: "u_row card cta", columnClasses: "u_column", columnBackground: CARD }
        ),

        row(
          "footer",
          [
            rawHtml(
              "footer-rule",
              `<div style="border-top:1px solid #dfe3e2; font-size:0; line-height:0;">&nbsp;</div>`,
              "0px 40px"
            ),
            text(
              "footer-brand",
              `<p style="line-height: 165%;"><strong style="color: ${PRIMARY}; letter-spacing: 1px;">AI RADAR WEEKLY</strong> &nbsp;·&nbsp; curated by the Linkroad AI practice &nbsp;·&nbsp; {{articleCount}} stories this week.</p>`,
              { containerPadding: "22px 40px 0px", fontSize: "12px", color: MUTED }
            ),
            text(
              "footer-links",
              `<p style="line-height: 165%;"><a href="{{portal_url}}" rel="noopener" target="_blank">AI Radar portal</a> &nbsp;·&nbsp; <a href="{{unsubscribe_url}}" rel="noopener" target="_blank">Unsubscribe</a></p>`,
              { containerPadding: "10px 40px 0px", fontSize: "12px", color: MUTED }
            ),
            text(
              "footer-legal",
              `<p style="line-height: 155%;">Summaries are machine-generated from public sources and may contain errors, so verify before client use.<br />Linkroad Group, Av. Duque de Avila 23, 1000-138 Lisboa, Portugal</p>`,
              { containerPadding: "12px 40px 30px", fontSize: "11px", color: "#8a9491" }
            ),
          ],
          { rowClasses: "u_row card", columnClasses: "u_column t-muted", columnBackground: CARD }
        ),
      ],
      headers: [],
      footers: [],
      values: {
        popupPosition: "center",
        popupWidth: "600px",
        popupHeight: "auto",
        borderRadius: "10px",
        contentAlign: "center",
        contentVerticalAlign: "center",
        contentWidth: "640px",
        fontFamily: { label: "Arial", value: SANS },
        textColor: "#3c4547",
        popupBackgroundColor: "#FFFFFF",
        popupBackgroundImage: {
          url: "",
          fullWidth: true,
          repeat: "no-repeat",
          size: "cover",
          position: "center",
        },
        popupOverlay_backgroundColor: "rgba(0, 0, 0, 0.1)",
        popupCloseButton_position: "top-right",
        popupCloseButton_backgroundColor: "#DDDDDD",
        popupCloseButton_iconColor: "#000000",
        popupCloseButton_borderRadius: "0px",
        popupCloseButton_margin: "0px",
        popupCloseButton_action: {
          name: "close_popup",
          attrs: { onClick: "document.querySelector('.u-teleporter').remove()" },
        },
        backgroundColor: PAGE,
        backgroundImage: {
          url: "",
          fullWidth: true,
          repeat: "no-repeat",
          size: "custom",
          position: "center",
        },
        preheaderText: "",
        linkStyle: {
          body: true,
          linkColor: PRIMARY,
          linkHoverColor: ACCENT,
          linkUnderline: true,
          linkHoverUnderline: true,
        },
        _meta: { htmlID: "u_body", htmlClassNames: "u_body body-bg" },
      },
    },
    schemaVersion: 16,
  };

  const eyebrowStyle = (color: string) =>
    `font-family:${SANS}; font-size:11px; line-height:16px; font-weight:bold; letter-spacing:1.6px; color:${color}; text-transform:uppercase;`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>AI Radar - {{edition_label}}</title>
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
</style>
</head>
<body class="body-bg" style="margin:0; padding:0; background-color:${PAGE}; -webkit-font-smoothing:antialiased;">
${RADAR_HEADLESS_MARKER}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="body-bg" style="background-color:${PAGE};">
<tr><td align="center" style="padding:18px 12px 40px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="wrap" style="width:640px; max-width:640px;">
<tr><td align="right" class="px t-muted" style="padding:0 40px 8px 40px; font-family:${SANS}; font-size:11px; line-height:16px; color:${MUTED};"><a href="{{archive_url}}" style="color:${MUTED}; text-decoration:underline;">View in browser</a></td></tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="wrap card" style="width:640px; max-width:640px; background-color:${CARD};">

<tr><td class="px t-strong" style="padding:26px 40px 0 40px;">
  ${logoHtml}
  <div class="t-strong" style="font-family:${SANS}; font-size:20px; line-height:24px; font-weight:bold; letter-spacing:2px; color:${PRIMARY};">AI&nbsp;RADAR<span style="color:${ACCENT};">.</span></div>
  <div class="t-muted" style="padding-top:6px; padding-bottom:18px; font-family:${SANS}; font-size:11px; line-height:14px; letter-spacing:1.2px; color:${MUTED}; text-transform:uppercase;">{{edition_label}} &nbsp;·&nbsp; {{date_range}}</div>
</td></tr>

<tr><td class="px rule" style="padding:0 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td width="64" height="3" style="width:64px; height:3px; background-color:${ACCENT}; line-height:3px; font-size:0;">&nbsp;</td>
    <td height="3" class="hairline" style="height:3px; background-color:#dfe3e2; line-height:3px; font-size:0;">&nbsp;</td>
  </tr></table>
</td></tr>

<tr><td class="px t-body" style="padding:22px 40px 0 40px; font-family:${SANS}; font-size:15px; line-height:24px; color:#3c4547;">The week in AI, curated by the Linkroad AI practice. Edit or remove this paragraph: it is yours.</td></tr>

<tr class="radar-optional"><td>
  <div class="px t-strong" style="padding:26px 40px 10px 40px; ${eyebrowStyle(PRIMARY)}">This week in 30 seconds</div>
  <div class="radar-body">{{tldr}}</div>
</td></tr>

<tr class="radar-optional"><td>
  <div class="px" style="padding:26px 40px 10px 40px; ${eyebrowStyle(ACCENT)}">Top story</div>
  <div class="radar-body">{{top_story}}</div>
</td></tr>

<tr><td>{{sections}}</td></tr>

<tr class="radar-optional"><td>
  <div class="px t-strong" style="padding:26px 40px 10px 40px; ${eyebrowStyle(PRIMARY)}">Trend radar &nbsp;·&nbsp; accelerating this week</div>
  <div class="radar-body">{{trend_radar}}</div>
</td></tr>

<tr class="radar-optional"><td>
  <div class="px" style="padding:26px 40px 10px 40px; ${eyebrowStyle(ACCENT)}">Internal</div>
  <div class="radar-body">{{internal}}</div>
</td></tr>

<tr><td class="px cta" align="center" style="padding:30px 40px 34px 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td align="center" bgcolor="${ACCENT}" style="background-color:${ACCENT}; border-radius:4px;">
      <a href="{{portal_url}}" style="display:block; padding:14px 30px; font-family:${SANS}; font-size:15px; line-height:20px; font-weight:bold; color:#ffffff; text-decoration:none;">Read the full feed &rarr;</a>
    </td>
  </tr></table>
</td></tr>

<tr><td class="px" style="padding:0 40px;"><div class="rule" style="border-top:1px solid #dfe3e2; font-size:0; line-height:0;">&nbsp;</div></td></tr>
<tr><td class="px t-muted" style="padding:22px 40px 30px 40px; font-family:${SANS}; font-size:12px; line-height:20px; color:${MUTED};">
  <div><strong style="color:${PRIMARY}; letter-spacing:1px;" class="t-strong">AI RADAR WEEKLY</strong> &nbsp;·&nbsp; curated by the Linkroad AI practice &nbsp;·&nbsp; {{articleCount}} stories this week.</div>
  <div class="link-strong" style="padding-top:10px;">
    <a href="{{portal_url}}" style="color:${PRIMARY}; text-decoration:underline;">AI Radar portal</a> &nbsp;·&nbsp;
    <a href="{{unsubscribe_url}}" style="color:${PRIMARY}; text-decoration:underline;">Unsubscribe</a>
  </div>
  <div style="padding-top:12px; font-size:11px; line-height:17px; color:#8a9491;">
    Summaries are machine-generated from public sources and may contain errors, so verify before client use.<br>
    Linkroad Group, Av. Duque de Avila 23, 1000-138 Lisboa, Portugal
  </div>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { design, html };
}
