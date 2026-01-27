/**
 * Script to create Unlayer-compatible email templates
 * These templates have designJson and can be edited in the WYSIWYG editor
 * Run with: npx tsx scripts/create-unlayer-templates.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Get branding settings from org settings (or use defaults)
async function getBranding(organizationId?: string) {
  if (organizationId) {
    const settings = await prisma.orgSettings.findUnique({
      where: { organizationId },
    });
    return {
      logoUrl: settings?.logoUrl || "",
      bannerUrl: settings?.bannerUrl || "",
    };
  }
  return {
    logoUrl: "",
    bannerUrl: "",
  };
}

// Corporate Professional Template - Clean and minimal
function createCorporateTemplate(branding: { logoUrl: string; bannerUrl: string }) {
  const design = {
    counters: { u_column: 4, u_row: 5, u_content_text: 7, u_content_image: 2, u_content_divider: 2, u_content_html: 2 },
    body: {
      id: "body",
      rows: [
        // Header Row
        {
          id: "header-row",
          cells: [1],
          columns: [
            {
              id: "header-col",
              contents: [
                ...(branding.logoUrl ? [{
                  id: "logo",
                  type: "image",
                  values: {
                    containerPadding: "20px",
                    anchor: "",
                    src: { url: branding.logoUrl, width: 80, height: 80 },
                    textAlign: "center",
                    altText: "Link Consulting",
                    action: { name: "web", values: { href: "", target: "_blank" } },
                  },
                }] : []),
                {
                  id: "title",
                  type: "text",
                  values: {
                    containerPadding: "10px 20px",
                    anchor: "",
                    fontSize: "28px",
                    textAlign: "center",
                    lineHeight: "140%",
                    linkStyle: { inherit: true, linkColor: "#0000ee", linkHoverColor: "#0000ee", linkUnderline: true, linkHoverUnderline: true },
                    hideDesktop: false,
                    displayCondition: null,
                    text: "<p style=\"line-height: 140%;\"><strong>Link AI Newsletter</strong></p>",
                  },
                },
                {
                  id: "subtitle",
                  type: "text",
                  values: {
                    containerPadding: "0px 20px 20px",
                    anchor: "",
                    fontSize: "14px",
                    color: "#666666",
                    textAlign: "center",
                    lineHeight: "140%",
                    text: "<p style=\"line-height: 140%;\">Week {{week}} &middot; {{year}}</p>",
                  },
                },
              ],
              values: {
                backgroundColor: "#1a202c",
                padding: "20px",
                border: {},
                borderRadius: "8px 8px 0 0",
                _meta: { htmlID: "u_column_1", htmlClassNames: "u_column" },
              },
            },
          ],
          values: {
            displayCondition: null,
            columns: false,
            backgroundColor: "",
            columnsBackgroundColor: "",
            backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
            padding: "0px",
            anchor: "",
            hideDesktop: false,
            _meta: { htmlID: "u_row_1", htmlClassNames: "u_row" },
          },
        },
        // Introduction Row
        {
          id: "intro-row",
          cells: [1],
          columns: [
            {
              id: "intro-col",
              contents: [
                {
                  id: "intro-text",
                  type: "text",
                  values: {
                    containerPadding: "30px",
                    fontSize: "16px",
                    color: "#4a5568",
                    lineHeight: "170%",
                    text: "<p style=\"line-height: 170%;\">Welcome to this week's curated selection of AI and technology insights. Our editorial team has reviewed the most significant developments to keep you informed.</p>",
                  },
                },
              ],
              values: { backgroundColor: "#ffffff", padding: "0px", border: {} },
            },
          ],
          values: { padding: "0px", backgroundColor: "#ffffff" },
        },
        // Articles Section
        {
          id: "articles-row",
          cells: [1],
          columns: [
            {
              id: "articles-col",
              contents: [
                {
                  id: "articles-heading",
                  type: "text",
                  values: {
                    containerPadding: "20px 30px 10px",
                    fontSize: "20px",
                    fontWeight: 600,
                    color: "#1a202c",
                    text: "<p><strong>Featured Articles</strong></p>",
                  },
                },
                {
                  id: "articles-content",
                  type: "html",
                  values: {
                    containerPadding: "10px 30px 30px",
                    html: "{{articles}}",
                  },
                },
              ],
              values: { backgroundColor: "#ffffff", padding: "0px", border: {} },
            },
          ],
          values: { padding: "0px", backgroundColor: "#ffffff" },
        },
        // Projects Section
        {
          id: "projects-row",
          cells: [1],
          columns: [
            {
              id: "projects-col",
              contents: [
                {
                  id: "projects-heading",
                  type: "text",
                  values: {
                    containerPadding: "20px 30px 10px",
                    fontSize: "20px",
                    fontWeight: 600,
                    color: "#1a202c",
                    text: "<p><strong>From Our Teams</strong></p>",
                  },
                },
                {
                  id: "projects-content",
                  type: "html",
                  values: {
                    containerPadding: "10px 30px 30px",
                    html: "{{projects}}",
                  },
                },
              ],
              values: { backgroundColor: "#ffffff", padding: "0px", border: {} },
            },
          ],
          values: { padding: "0px", backgroundColor: "#f7fafc" },
        },
        // Footer Row
        {
          id: "footer-row",
          cells: [1],
          columns: [
            {
              id: "footer-col",
              contents: [
                {
                  id: "footer-text",
                  type: "text",
                  values: {
                    containerPadding: "20px 30px",
                    fontSize: "13px",
                    color: "#718096",
                    textAlign: "center",
                    lineHeight: "150%",
                    text: '<p style="line-height: 150%;">Curated with AI, reviewed by experts at Link Consulting.</p><p style="line-height: 150%;"><a href="{{unsubscribe_url}}" style="color: #718096;">Unsubscribe</a> &middot; <a href="https://linkconsulting.com" style="color: #718096;">Link Consulting</a></p>',
                  },
                },
              ],
              values: { backgroundColor: "#f7fafc", padding: "0px", border: {}, borderRadius: "0 0 8px 8px" },
            },
          ],
          values: { padding: "0px", backgroundColor: "" },
        },
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
        contentWidth: "600px",
        fontFamily: { label: "Georgia", value: "'Georgia', 'Times New Roman', serif" },
        textColor: "#2d3748",
        popupBackgroundColor: "#FFFFFF",
        popupBackgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "cover", position: "center" },
        popupOverlay_backgroundColor: "rgba(0, 0, 0, 0.1)",
        popupCloseButton_position: "top-right",
        popupCloseButton_backgroundColor: "#DDDDDD",
        popupCloseButton_iconColor: "#000000",
        popupCloseButton_borderRadius: "0px",
        popupCloseButton_margin: "0px",
        popupCloseButton_action: { name: "close_popup", attrs: { onClick: "document.querySelector('.u-teleporter').remove()" } },
        backgroundColor: "#f8f9fa",
        backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
        preheaderText: "This week's AI and technology insights from Link Consulting",
        linkStyle: { body: true, linkColor: "#1a202c", linkHoverColor: "#0000ee", linkUnderline: true, linkHoverUnderline: true },
        _meta: { htmlID: "u_body", htmlClassNames: "u_body" },
      },
    },
    schemaVersion: 16,
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link AI Newsletter - Week {{week}}, {{year}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Georgia, 'Times New Roman', serif; background-color: #f8f9fa; color: #2d3748;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #1a202c; padding: 32px 40px; border-radius: 8px 8px 0 0; text-align: center;">
              ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="Link Consulting" width="80" height="80" style="display: block; margin: 0 auto 16px; border-radius: 8px;">` : ''}
              <h1 style="margin: 0; font-size: 28px; font-weight: 400; color: #ffffff;">Link AI Newsletter</h1>
              <p style="margin: 8px 0 0; font-size: 14px; color: #a0aec0;">Week {{week}} &middot; {{year}}</p>
            </td>
          </tr>
          <!-- Introduction -->
          <tr>
            <td style="padding: 32px 40px 24px;">
              <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #4a5568;">Welcome to this week's curated selection of AI and technology insights. Our editorial team has reviewed the most significant developments to keep you informed.</p>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;"><hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;"></td>
          </tr>
          <!-- Articles -->
          <tr>
            <td style="padding: 32px 40px;">
              <h2 style="margin: 0 0 24px; font-size: 20px; font-weight: 600; color: #1a202c;">Featured Articles</h2>
              {{articles}}
            </td>
          </tr>
          <!-- Projects -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 24px; font-size: 20px; font-weight: 600; color: #1a202c;">From Our Teams</h2>
              {{projects}}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fafc; padding: 24px 40px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 13px; color: #718096;">Curated with AI, reviewed by experts at Link Consulting.</p>
              <p style="margin: 0; font-size: 13px; color: #a0aec0;">
                <a href="{{unsubscribe_url}}" style="color: #718096; text-decoration: underline;">Unsubscribe</a>
                &nbsp;&middot;&nbsp;
                <a href="https://linkconsulting.com" style="color: #718096; text-decoration: underline;">Link Consulting</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { design, html };
}

// Modern Tech Template - Dark theme with gradients
function createModernTemplate(branding: { logoUrl: string; bannerUrl: string }) {
  const design = {
    counters: { u_column: 4, u_row: 5, u_content_text: 6, u_content_image: 2, u_content_html: 2 },
    body: {
      id: "body",
      rows: [
        // Header with gradient
        {
          id: "header-row",
          cells: [1],
          columns: [
            {
              id: "header-col",
              contents: [
                ...(branding.logoUrl ? [{
                  id: "logo",
                  type: "image",
                  values: {
                    containerPadding: "20px",
                    src: { url: branding.logoUrl, width: 56, height: 56 },
                    textAlign: "center",
                    altText: "Link",
                  },
                }] : []),
                {
                  id: "title",
                  type: "text",
                  values: {
                    containerPadding: "10px 20px",
                    fontSize: "36px",
                    fontWeight: 800,
                    textAlign: "center",
                    color: "#ffffff",
                    text: "<p><strong>AI PULSE</strong></p>",
                  },
                },
                {
                  id: "subtitle",
                  type: "text",
                  values: {
                    containerPadding: "0px 20px 30px",
                    fontSize: "16px",
                    fontWeight: 500,
                    textAlign: "center",
                    color: "rgba(255,255,255,0.9)",
                    text: "<p>Week {{week}} &bull; {{year}}</p>",
                  },
                },
              ],
              values: {
                backgroundColor: "",
                backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
                padding: "20px",
                border: {},
                borderRadius: "16px 16px 0 0",
              },
            },
          ],
          values: {
            backgroundColor: "#6366f1",
            backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
            padding: "0px",
          },
        },
        // Intro
        {
          id: "intro-row",
          cells: [1],
          columns: [
            {
              id: "intro-col",
              contents: [
                {
                  id: "intro-text",
                  type: "text",
                  values: {
                    containerPadding: "30px 40px",
                    fontSize: "18px",
                    color: "#cbd5e1",
                    lineHeight: "160%",
                    text: "<p>Your weekly dose of cutting-edge AI developments, breakthrough research, and industry shifts.</p>",
                  },
                },
              ],
              values: { backgroundColor: "#1e293b", padding: "0px" },
            },
          ],
          values: { padding: "0px", backgroundColor: "#1e293b" },
        },
        // Articles
        {
          id: "articles-row",
          cells: [1],
          columns: [
            {
              id: "articles-col",
              contents: [
                {
                  id: "articles-heading",
                  type: "text",
                  values: {
                    containerPadding: "30px 40px 15px",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#6366f1",
                    letterSpacing: "2px",
                    text: "<p>THIS WEEK'S HIGHLIGHTS</p>",
                  },
                },
                {
                  id: "articles-content",
                  type: "html",
                  values: {
                    containerPadding: "0px 40px 30px",
                    html: "{{articles}}",
                  },
                },
              ],
              values: { backgroundColor: "#1e293b", padding: "0px" },
            },
          ],
          values: { padding: "0px", backgroundColor: "#1e293b" },
        },
        // Projects
        {
          id: "projects-row",
          cells: [1],
          columns: [
            {
              id: "projects-col",
              contents: [
                {
                  id: "projects-heading",
                  type: "text",
                  values: {
                    containerPadding: "30px 40px 15px",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#ec4899",
                    letterSpacing: "2px",
                    text: "<p>BUILT AT LINK</p>",
                  },
                },
                {
                  id: "projects-content",
                  type: "html",
                  values: {
                    containerPadding: "0px 40px 30px",
                    html: "{{projects}}",
                  },
                },
              ],
              values: { backgroundColor: "#0f172a", padding: "0px" },
            },
          ],
          values: { padding: "0px", backgroundColor: "#0f172a" },
        },
        // Footer
        {
          id: "footer-row",
          cells: [1],
          columns: [
            {
              id: "footer-col",
              contents: [
                {
                  id: "footer-text",
                  type: "text",
                  values: {
                    containerPadding: "30px 40px",
                    fontSize: "14px",
                    color: "#64748b",
                    textAlign: "center",
                    lineHeight: "150%",
                    text: '<p>Powered by AI &bull; Curated by Humans</p><p><a href="{{unsubscribe_url}}" style="color: #6366f1; text-decoration: none;">Unsubscribe</a> | <a href="https://linkconsulting.com" style="color: #6366f1; text-decoration: none;">Link Consulting</a></p>',
                  },
                },
              ],
              values: { backgroundColor: "#1e293b", padding: "0px", borderRadius: "0 0 16px 16px", border: { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "#334155" } },
            },
          ],
          values: { padding: "0px", backgroundColor: "" },
        },
      ],
      headers: [],
      footers: [],
      values: {
        contentWidth: "600px",
        contentAlign: "center",
        fontFamily: { label: "Helvetica Neue", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" },
        textColor: "#ffffff",
        backgroundColor: "#0f172a",
        preheaderText: "Your weekly AI developments digest from Link Consulting",
        linkStyle: { body: true, linkColor: "#6366f1", linkHoverColor: "#818cf8", linkUnderline: false, linkHoverUnderline: true },
      },
    },
    schemaVersion: 16,
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Pulse - Week {{week}}, {{year}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background-color: #0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%); padding: 40px; border-radius: 16px 16px 0 0; text-align: center;">
              ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="Link" width="56" height="56" style="display: block; margin: 0 auto 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">` : ''}
              <h1 style="margin: 0; font-size: 36px; font-weight: 800; color: #ffffff; letter-spacing: -1px;">AI PULSE</h1>
              <p style="margin: 12px 0 0; font-size: 16px; color: rgba(255,255,255,0.9); font-weight: 500;">Week {{week}} &bull; {{year}}</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background-color: #1e293b;">
              <!-- Intro -->
              <div style="padding: 32px 40px;">
                <p style="margin: 0; font-size: 18px; line-height: 1.6; color: #cbd5e1;">Your weekly dose of cutting-edge AI developments, breakthrough research, and industry shifts.</p>
              </div>
              <!-- Articles -->
              <div style="padding: 0 40px 32px;">
                <h2 style="margin: 0 0 20px; font-size: 14px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 2px;">This Week's Highlights</h2>
                {{articles}}
              </div>
            </td>
          </tr>
          <!-- Projects -->
          <tr>
            <td style="background-color: #0f172a; padding: 32px 40px;">
              <h2 style="margin: 0 0 20px; font-size: 14px; font-weight: 700; color: #ec4899; text-transform: uppercase; letter-spacing: 2px;">Built at Link</h2>
              {{projects}}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #1e293b; padding: 32px 40px; border-radius: 0 0 16px 16px; border-top: 1px solid #334155; text-align: center;">
              <p style="margin: 0 0 12px; font-size: 14px; color: #64748b;">Powered by AI &bull; Curated by Humans</p>
              <p style="margin: 0; font-size: 13px; color: #475569;">
                <a href="{{unsubscribe_url}}" style="color: #6366f1; text-decoration: none;">Unsubscribe</a>
                <span style="color: #334155;">&nbsp;|&nbsp;</span>
                <a href="https://linkconsulting.com" style="color: #6366f1; text-decoration: none;">Link Consulting</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { design, html };
}

// Executive Summary Template - Clean and minimal
function createExecutiveTemplate(branding: { logoUrl: string; bannerUrl: string }) {
  const design = {
    counters: { u_column: 4, u_row: 5, u_content_text: 6, u_content_image: 1, u_content_html: 2, u_content_divider: 2 },
    body: {
      id: "body",
      rows: [
        // Header
        {
          id: "header-row",
          cells: [1],
          columns: [
            {
              id: "header-col",
              contents: [
                {
                  id: "header-text",
                  type: "text",
                  values: {
                    containerPadding: "20px 0 10px",
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#111827",
                    text: `<p>${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="Link" width="32" height="32" style="display: inline-block; vertical-align: middle; border-radius: 6px; margin-right: 12px;">` : ''}<span style="vertical-align: middle;">Link AI Brief</span></p>`,
                  },
                },
                {
                  id: "divider",
                  type: "divider",
                  values: {
                    containerPadding: "10px 0 20px",
                    border: { borderTopWidth: "2px", borderTopStyle: "solid", borderTopColor: "#111827" },
                  },
                },
              ],
              values: { backgroundColor: "#ffffff", padding: "0px" },
            },
          ],
          values: { padding: "0px", backgroundColor: "#ffffff" },
        },
        // Date and intro
        {
          id: "intro-row",
          cells: [1],
          columns: [
            {
              id: "intro-col",
              contents: [
                {
                  id: "date-text",
                  type: "text",
                  values: {
                    containerPadding: "0 0 15px",
                    fontSize: "14px",
                    color: "#6b7280",
                    textAlign: "right",
                    text: "<p>Week {{week}}, {{year}}</p>",
                  },
                },
                {
                  id: "intro-text",
                  type: "text",
                  values: {
                    containerPadding: "0 0 20px",
                    fontSize: "15px",
                    color: "#374151",
                    lineHeight: "160%",
                    text: "<p>A concise digest of this week's most impactful AI developments and internal achievements.</p>",
                  },
                },
              ],
              values: { backgroundColor: "#ffffff", padding: "0px" },
            },
          ],
          values: { padding: "0px", backgroundColor: "#ffffff" },
        },
        // Articles
        {
          id: "articles-row",
          cells: [1],
          columns: [
            {
              id: "articles-col",
              contents: [
                {
                  id: "articles-heading",
                  type: "text",
                  values: {
                    containerPadding: "0 0 15px",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#6b7280",
                    letterSpacing: "1.5px",
                    text: "<p>KEY DEVELOPMENTS</p>",
                  },
                },
                {
                  id: "articles-content",
                  type: "html",
                  values: {
                    containerPadding: "0 0 20px",
                    html: "{{articles}}",
                  },
                },
              ],
              values: { backgroundColor: "#ffffff", padding: "0px" },
            },
          ],
          values: { padding: "0px", backgroundColor: "#ffffff" },
        },
        // Projects
        {
          id: "projects-row",
          cells: [1],
          columns: [
            {
              id: "projects-col",
              contents: [
                {
                  id: "divider2",
                  type: "divider",
                  values: {
                    containerPadding: "0 0 20px",
                    border: { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "#e5e7eb" },
                  },
                },
                {
                  id: "projects-heading",
                  type: "text",
                  values: {
                    containerPadding: "0 0 15px",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#6b7280",
                    letterSpacing: "1.5px",
                    text: "<p>INTERNAL HIGHLIGHTS</p>",
                  },
                },
                {
                  id: "projects-content",
                  type: "html",
                  values: {
                    containerPadding: "0 0 20px",
                    html: "{{projects}}",
                  },
                },
              ],
              values: { backgroundColor: "#ffffff", padding: "0px" },
            },
          ],
          values: { padding: "0px", backgroundColor: "#ffffff" },
        },
        // Footer
        {
          id: "footer-row",
          cells: [1],
          columns: [
            {
              id: "footer-col",
              contents: [
                {
                  id: "footer-text",
                  type: "text",
                  values: {
                    containerPadding: "20px 0 0",
                    fontSize: "12px",
                    color: "#9ca3af",
                    textAlign: "center",
                    text: '<p><a href="{{unsubscribe_url}}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a> &bull; Link Consulting &copy; {{year}}</p>',
                  },
                },
              ],
              values: { backgroundColor: "#ffffff", padding: "0px", border: { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "#e5e7eb" } },
            },
          ],
          values: { padding: "0px", backgroundColor: "#ffffff" },
        },
      ],
      headers: [],
      footers: [],
      values: {
        contentWidth: "560px",
        contentAlign: "center",
        fontFamily: { label: "Helvetica Neue", value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
        textColor: "#111827",
        backgroundColor: "#ffffff",
        preheaderText: "This week's AI brief from Link Consulting",
        linkStyle: { body: true, linkColor: "#111827", linkHoverColor: "#6b7280", linkUnderline: true, linkHoverUnderline: true },
      },
    },
    schemaVersion: 16,
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link AI Brief - Week {{week}}, {{year}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #ffffff; color: #111827;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ffffff;">
    <tr>
      <td align="center" style="padding: 32px 20px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0">
          <!-- Header -->
          <tr>
            <td style="padding-bottom: 24px; border-bottom: 2px solid #111827;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="Link" width="32" height="32" style="display: inline-block; vertical-align: middle; border-radius: 6px; margin-right: 12px;">` : '<span style="display: inline-block; width: 32px; height: 32px; background: #111827; border-radius: 6px; vertical-align: middle; margin-right: 12px;"></span>'}
                    <span style="font-size: 20px; font-weight: 700; color: #111827; vertical-align: middle;">Link AI Brief</span>
                  </td>
                  <td style="text-align: right;">
                    <span style="font-size: 14px; color: #6b7280;">Week {{week}}, {{year}}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Intro -->
          <tr>
            <td style="padding: 24px 0;">
              <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">A concise digest of this week's most impactful AI developments and internal achievements.</p>
            </td>
          </tr>
          <!-- Articles -->
          <tr>
            <td style="padding-bottom: 24px;">
              <h2 style="margin: 0 0 16px; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1.5px;">Key Developments</h2>
              {{articles}}
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td><hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0;"></td>
          </tr>
          <!-- Projects -->
          <tr>
            <td style="padding: 24px 0;">
              <h2 style="margin: 0 0 16px; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1.5px;">Internal Highlights</h2>
              {{projects}}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding-top: 24px; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                <a href="{{unsubscribe_url}}" style="color: #6b7280; text-decoration: underline;">Unsubscribe</a>
                &nbsp;&bull;&nbsp;
                Link Consulting &copy; {{year}}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { design, html };
}

async function main() {
  console.log("Creating Unlayer-compatible email templates...\n");

  const branding = await getBranding();
  console.log("Branding settings:", branding.logoUrl ? "Logo found" : "No logo", branding.bannerUrl ? "Banner found" : "No banner");
  console.log("");

  const templates = [
    {
      name: "Corporate Professional",
      description: "Clean, minimal design with business-appropriate styling. Uses serif typography for elegance.",
      ...createCorporateTemplate(branding),
    },
    {
      name: "Modern Tech",
      description: "Bold gradients, contemporary design with a dark theme. Perfect for tech-forward audiences.",
      ...createModernTemplate(branding),
    },
    {
      name: "Executive Summary",
      description: "Condensed, text-focused format designed for busy executives who want quick insights.",
      ...createExecutiveTemplate(branding),
    },
  ];

  for (const template of templates) {
    // Check if template already exists
    const existing = await prisma.emailTemplate.findFirst({
      where: { name: template.name },
    });

    if (existing) {
      // Update existing template
      await prisma.emailTemplate.update({
        where: { id: existing.id },
        data: {
          html: template.html,
          designJson: template.design,
          description: template.description,
        },
      });
      console.log(`Updated: ${template.name}`);
    } else {
      // Get first org (for scripts, use first org as default)
      const firstOrg = await prisma.organization.findFirst();
      if (!firstOrg) {
        console.error("No organization found. Please create an organization first.");
        process.exit(1);
      }
      // Create new template
      await prisma.emailTemplate.create({
        data: {
          name: template.name,
          description: template.description,
          html: template.html,
          designJson: template.design,
          isActive: false,
          isDefault: false,
          organizationId: firstOrg.id,
        },
      });
      console.log(`Created: ${template.name}`);
    }
  }

  console.log("\nDone! Templates are ready and editable in your dashboard.");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
