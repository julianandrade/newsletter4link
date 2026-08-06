/**
 * v2 of the AI Radar Weekly: an editable frame around a code-rendered body.
 *
 * The built-in edition is code, and the things that make it good are the things an Unlayer design
 * cannot hold: MSO conditionals, the [data-ogsc] dark mirror, a logo pair swapped by media query,
 * and sections that render only when they have items. This variant keeps all of that and hands
 * the editor everything else.
 *
 * What the editor controls: the masthead, the intro copy, the call to action, the footer, the
 * order of the blocks, and whether a block is there at all.
 *
 * What stays code: anything that repeats N times. A design has no loop, so the articles, the
 * topic sections and the trend radar rows arrive through merge tags rendered by
 * lib/email/edition-blocks.ts, which is the same code the built-in edition uses. That is what
 * keeps a template built here from looking like a different product.
 *
 * Two seeded details carry meaning:
 *
 *  - `_meta.htmlClassNames` seeds the hooks lib/email/harden-export.ts needs. `card`, `tint`,
 *    `t-body`, `t-strong`, `t-muted` and `rule` are what the injected dark-mode block selects on;
 *    `radar-optional` marks a row that must disappear when its merge tag renders nothing. A row
 *    the editor adds later carries no hook and simply gets no dark-mode treatment, which is
 *    degradation rather than breakage.
 *  - the html blocks holding merge tags have `containerPadding: "0px"`, because each block brings
 *    the 40px gutter it has in the code renderer. Changing that gutter means editing the block,
 *    not the row.
 */

interface Branding {
  logoUrl: string;
  bannerUrl: string;
}

/**
 * Where the Linkroad logo pair lives.
 *
 * Baked into the stored html at seed time, the way the other seeded templates bake
 * `branding.logoUrl`. Relative paths never resolve in an email client, so it has to be absolute.
 */
function assetBase(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://newsletter4link.vercel.app";
  return `${appUrl.replace(/\/$/, "")}/email`;
}

const ACCENT = "#ff7901";
const PRIMARY = "#2d4449";
const MUTED = "#6b7674";
const CARD = "#fbfbfa";
const PAGE = "#eceeed";
const SANS = "Arial,Helvetica,sans-serif";

/** An Unlayer text block. */
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

/**
 * Marks a merge tag as the body of its optional row.
 *
 * lib/email/harden-export.ts drops a row whose body holds no text. Without the marker it would
 * have to guess emptiness from the row's whole text, and the guess mistakes a heading for content.
 */
function body(tag: string): string {
  return `<div class="radar-body">${tag}</div>`;
}

/** An Unlayer raw-html block. Used for everything a merge tag fills. */
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
 * One row, one column.
 *
 * `htmlClassNames` lands on the rendered element, which is how the hardening pass finds the row
 * to drop and how the injected dark-mode CSS finds what to recolour.
 */
function row(
  id: string,
  contents: Array<Record<string, unknown>>,
  options: {
    rowClasses?: string;
    columnClasses?: string;
    columnBackground?: string;
    rowBackground?: string;
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
      backgroundColor: options.rowBackground ?? "",
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

export function createRadarFrameTemplate(branding: Branding): {
  design: object;
  html: string;
} {
  const design = {
    counters: {
      u_column: 11,
      u_row: 11,
      u_content_text: 6,
      u_content_html: 7,
      u_content_button: 1,
      u_content_image: branding.logoUrl ? 1 : 0,
    },
    body: {
      id: "body",
      rows: [
        // Navigation, not content, so it sits above the card on the page background.
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
          { rowClasses: "u_row t-muted", columnClasses: "u_column" }
        ),

        row(
          "masthead",
          [
            ...(branding.logoUrl
              ? [
                  {
                    id: "masthead-logo",
                    type: "image",
                    values: {
                      containerPadding: "26px 40px 0px",
                      anchor: "",
                      src: { url: branding.logoUrl, width: 130, height: 17 },
                      textAlign: "right",
                      altText: "Linkroad",
                      action: { name: "web", values: { href: "", target: "_blank" } },
                    },
                  },
                ]
              : []),
            text(
              "masthead-wordmark",
              `<p style="line-height: 120%; letter-spacing: 2px;"><strong>AI&nbsp;RADAR<span style="color: ${ACCENT};">.</span></strong></p>`,
              {
                containerPadding: branding.logoUrl ? "10px 40px 0px" : "26px 40px 0px",
                fontSize: "20px",
                color: PRIMARY,
              }
            ),
            text(
              "masthead-meta",
              `<p style="line-height: 140%; letter-spacing: 1.2px; text-transform: uppercase;">{{edition_label}} &nbsp;·&nbsp; {{date_range}}</p>`,
              { containerPadding: "6px 40px 18px", fontSize: "11px", color: MUTED }
            ),
          ],
          {
            rowClasses: "u_row card",
            columnClasses: "u_column t-strong",
            columnBackground: CARD,
          }
        ),

        // The design's signature: 64px of accent against a full-width rule. Not expressible as an
        // Unlayer divider, which draws one colour across the whole width.
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

        // The five content blocks. radar-optional on the four that can be empty: the hardening
        // pass removes the row rather than leaving a gap where a section did not render.
        row("tldr", [rawHtml("tldr-html", body("{{tldr}}"))], {
          rowClasses: "u_row card radar-optional",
          columnClasses: "u_column tint",
          columnBackground: CARD,
        }),
        row("top-story", [rawHtml("top-story-html", body("{{top_story}}"))], {
          rowClasses: "u_row card radar-optional",
          columnClasses: "u_column",
          columnBackground: CARD,
        }),
        row("sections", [rawHtml("sections-html", "{{sections}}")], {
          rowClasses: "u_row card",
          columnClasses: "u_column",
          columnBackground: CARD,
        }),
        row("trends", [rawHtml("trends-html", body("{{trend_radar}}"))], {
          rowClasses: "u_row card radar-optional",
          columnClasses: "u_column tint",
          columnBackground: CARD,
        }),
        row("internal", [rawHtml("internal-html", body("{{internal}}"))], {
          rowClasses: "u_row card radar-optional",
          columnClasses: "u_column",
          columnBackground: CARD,
        }),

        row(
          "cta",
          [
            {
              id: "cta-button",
              type: "button",
              values: {
                containerPadding: "30px 40px 34px",
                anchor: "",
                href: {
                  name: "web",
                  values: { href: "{{portal_url}}", target: "_blank" },
                },
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
              "footer-text",
              `<p style="line-height: 165%;"><strong style="color: ${PRIMARY}; letter-spacing: 1px;">AI RADAR WEEKLY</strong> &nbsp;·&nbsp; curated by the Linkroad AI practice &nbsp;·&nbsp; {{articleCount}} stories this week.</p>` +
                `<p style="line-height: 165%;"><a href="{{portal_url}}" rel="noopener" target="_blank">AI Radar portal</a> &nbsp;·&nbsp; <a href="{{unsubscribe_url}}" rel="noopener" target="_blank">Unsubscribe</a></p>`,
              { containerPadding: "22px 40px 0px", fontSize: "12px", color: MUTED }
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

  /**
   * The stored html, which is what a send actually renders.
   *
   * Written by hand rather than exported, because seeding runs headless and Unlayer's exporter
   * only runs in a browser. Saving the template from the editor once replaces this with Unlayer's
   * own export; until then this is a faithful stand-in carrying the same tags and the same class
   * hooks, so the hardening pass and the dark mode behave identically either way.
   */
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
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="body-bg" style="background-color:${PAGE};">
<tr><td align="center" style="padding:18px 12px 40px 12px;">

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="wrap" style="width:640px; max-width:640px;">
<tr><td align="right" class="px t-muted" style="padding:0 40px 8px 40px; font-family:${SANS}; font-size:11px; line-height:16px; color:${MUTED};"><a href="{{archive_url}}" style="color:${MUTED}; text-decoration:underline;">View in browser</a></td></tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="wrap card" style="width:640px; max-width:640px; background-color:${CARD};">

<tr><td class="px t-strong" style="padding:26px 40px 0 40px;">
${
  branding.logoUrl
    ? // One asset, so it cannot be swapped for the dark card the way the Linkroad pair is.
      // Uploading light-on-transparent artwork is the fix, same as the built-in edition.
      `  <div style="text-align:right; padding-bottom:10px;"><img src="${branding.logoUrl}" width="130" alt="Linkroad" style="display:inline-block; border:0; width:130px;"></div>\n`
    : // The Linkroad pair, swapped by the media query the hardening pass injects. The dark one is
      // wrapped by wrapMsoLogo on export so Word-engine Outlook does not show both.
      `  <div style="text-align:right; padding-bottom:10px;"><img class="logo-light" src="${assetBase()}/linkroad-h-on-light.png" width="130" height="17" alt="Linkroad" style="display:inline-block; border:0; width:130px; height:17px;"><img class="logo-dark" src="${assetBase()}/linkroad-h-on-dark.png" width="130" height="17" alt="Linkroad" style="display:none; max-height:0; overflow:hidden; mso-hide:all; border:0; width:130px; height:17px;"></div>\n`
}  <div class="t-strong" style="font-family:${SANS}; font-size:20px; line-height:24px; font-weight:bold; letter-spacing:2px; color:${PRIMARY};">AI&nbsp;RADAR<span style="color:${ACCENT};">.</span></div>
  <div class="t-muted" style="padding-top:6px; padding-bottom:18px; font-family:${SANS}; font-size:11px; line-height:14px; letter-spacing:1.2px; color:${MUTED}; text-transform:uppercase;">{{edition_label}} &nbsp;·&nbsp; {{date_range}}</div>
</td></tr>

<tr><td class="px rule" style="padding:0 40px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
    <td width="64" height="3" style="width:64px; height:3px; background-color:${ACCENT}; line-height:3px; font-size:0;">&nbsp;</td>
    <td height="3" class="hairline" style="height:3px; background-color:#dfe3e2; line-height:3px; font-size:0;">&nbsp;</td>
  </tr></table>
</td></tr>

<tr><td class="px t-body" style="padding:22px 40px 0 40px; font-family:${SANS}; font-size:15px; line-height:24px; color:#3c4547;">The week in AI, curated by the Linkroad AI practice. Edit or remove this paragraph: it is yours.</td></tr>

<tr class="radar-optional"><td><div class="radar-body">{{tldr}}</div></td></tr>
<tr class="radar-optional"><td><div class="radar-body">{{top_story}}</div></td></tr>
<tr><td>{{sections}}</td></tr>
<tr class="radar-optional"><td><div class="radar-body">{{trend_radar}}</div></td></tr>
<tr class="radar-optional"><td><div class="radar-body">{{internal}}</div></td></tr>

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
