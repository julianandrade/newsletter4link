/**
 * Script to create professional email templates
 * Run with: npx tsx scripts/create-templates.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Get branding settings
async function getBranding() {
  const settings = await prisma.brandingSettings.findUnique({
    where: { id: "default" },
  });
  return {
    logoUrl: settings?.logoUrl || "",
    bannerUrl: settings?.bannerUrl || "",
  };
}

// Template 1: Corporate Professional
function createCorporateProfessionalTemplate(branding: { logoUrl: string; bannerUrl: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link AI Newsletter - Week {{week}}, {{year}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Georgia', 'Times New Roman', serif; background-color: #f8f9fa; color: #2d3748;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f9fa;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background-color: #1a202c; padding: 32px 40px; border-radius: 4px 4px 0 0;">
              ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="Link Consulting" width="48" height="48" style="display: block; margin: 0 auto 16px; border-radius: 8px;">` : ''}
              <h1 style="margin: 0; font-size: 28px; font-weight: 400; color: #ffffff; text-align: center; letter-spacing: -0.5px;">
                Link AI Newsletter
              </h1>
              <p style="margin: 8px 0 0; font-size: 14px; color: #a0aec0; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Week {{week}} &middot; {{year}}
              </p>
            </td>
          </tr>

          <!-- Introduction -->
          <tr>
            <td style="padding: 32px 40px 24px;">
              <p style="margin: 0; font-size: 16px; line-height: 1.7; color: #4a5568;">
                Welcome to this week's curated selection of AI and technology insights. Our editorial team has reviewed the most significant developments to keep you informed.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 0;">
            </td>
          </tr>

          <!-- Articles Section -->
          <tr>
            <td style="padding: 32px 40px;">
              <h2 style="margin: 0 0 24px; font-size: 20px; font-weight: 600; color: #1a202c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Featured Articles
              </h2>
              {{articles}}
            </td>
          </tr>

          <!-- Projects Section -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <h2 style="margin: 0 0 24px; font-size: 20px; font-weight: 600; color: #1a202c; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                From Our Teams
              </h2>
              {{projects}}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fafc; padding: 24px 40px; border-radius: 0 0 4px 4px; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px; font-size: 13px; color: #718096; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Curated with AI, reviewed by experts at Link Consulting.
              </p>
              <p style="margin: 0; font-size: 13px; color: #a0aec0; text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
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
}

// Template 2: Modern Tech
function createModernTechTemplate(branding: { logoUrl: string; bannerUrl: string }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link AI Newsletter - Week {{week}}, {{year}}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; background-color: #0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #0f172a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0">

          ${branding.bannerUrl ? `
          <!-- Banner -->
          <tr>
            <td>
              <img src="${branding.bannerUrl}" alt="Newsletter Banner" width="600" style="display: block; border-radius: 16px 16px 0 0; width: 100%; height: auto;">
            </td>
          </tr>
          ` : ''}

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%); padding: 40px; ${branding.bannerUrl ? 'border-radius: 0;' : 'border-radius: 16px 16px 0 0;'}">
              ${branding.logoUrl ? `<img src="${branding.logoUrl}" alt="Link" width="56" height="56" style="display: block; margin: 0 auto 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">` : ''}
              <h1 style="margin: 0; font-size: 36px; font-weight: 800; color: #ffffff; text-align: center; letter-spacing: -1px;">
                AI PULSE
              </h1>
              <p style="margin: 12px 0 0; font-size: 16px; color: rgba(255,255,255,0.9); text-align: center; font-weight: 500;">
                Week {{week}} &bull; {{year}}
              </p>
            </td>
          </tr>

          <!-- Content Area -->
          <tr>
            <td style="background-color: #1e293b; padding: 0;">

              <!-- Intro -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 32px 40px;">
                    <p style="margin: 0; font-size: 18px; line-height: 1.6; color: #cbd5e1;">
                      Your weekly dose of cutting-edge AI developments, breakthrough research, and industry shifts.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Articles Section -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 0 40px 32px;">
                    <h2 style="margin: 0 0 20px; font-size: 14px; font-weight: 700; color: #6366f1; text-transform: uppercase; letter-spacing: 2px;">
                      This Week's Highlights
                    </h2>
                    {{articles}}
                  </td>
                </tr>
              </table>

              <!-- Projects Section -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 32px 40px; background-color: #0f172a;">
                    <h2 style="margin: 0 0 20px; font-size: 14px; font-weight: 700; color: #ec4899; text-transform: uppercase; letter-spacing: 2px;">
                      Built at Link
                    </h2>
                    {{projects}}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #1e293b; padding: 32px 40px; border-radius: 0 0 16px 16px; border-top: 1px solid #334155;">
              <p style="margin: 0 0 12px; font-size: 14px; color: #64748b; text-align: center;">
                Powered by AI &bull; Curated by Humans
              </p>
              <p style="margin: 0; font-size: 13px; color: #475569; text-align: center;">
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
}

// Template 3: Executive Summary
function createExecutiveSummaryTemplate(branding: { logoUrl: string; bannerUrl: string }) {
  return `<!DOCTYPE html>
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

          <!-- Minimal Header -->
          <tr>
            <td style="padding-bottom: 24px; border-bottom: 2px solid #111827;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    ${branding.logoUrl ?
                      `<img src="${branding.logoUrl}" alt="Link" width="32" height="32" style="display: inline-block; vertical-align: middle; border-radius: 6px; margin-right: 12px;">` :
                      '<span style="display: inline-block; width: 32px; height: 32px; background: #111827; border-radius: 6px; vertical-align: middle; margin-right: 12px;"></span>'
                    }
                    <span style="font-size: 20px; font-weight: 700; color: #111827; vertical-align: middle;">Link AI Brief</span>
                  </td>
                  <td style="text-align: right;">
                    <span style="font-size: 14px; color: #6b7280;">Week {{week}}, {{year}}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Executive Summary -->
          <tr>
            <td style="padding: 24px 0;">
              <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">
                A concise digest of this week's most impactful AI developments and internal achievements.
              </p>
            </td>
          </tr>

          <!-- Articles -->
          <tr>
            <td style="padding-bottom: 24px;">
              <h2 style="margin: 0 0 16px; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1.5px;">
                Key Developments
              </h2>
              {{articles}}
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0;">
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0;">
            </td>
          </tr>

          <!-- Projects -->
          <tr>
            <td style="padding: 24px 0;">
              <h2 style="margin: 0 0 16px; font-size: 12px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1.5px;">
                Internal Highlights
              </h2>
              {{projects}}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top: 24px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
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
}

async function main() {
  console.log("Creating professional email templates...\n");

  const branding = await getBranding();
  console.log("Branding settings:", branding.logoUrl ? "Logo found" : "No logo", branding.bannerUrl ? "Banner found" : "No banner");

  const templates = [
    {
      name: "Corporate Professional",
      description: "Clean, minimal design with business-appropriate styling. Uses serif typography for elegance.",
      html: createCorporateProfessionalTemplate(branding),
    },
    {
      name: "Modern Tech",
      description: "Bold gradients, contemporary design with a dark theme. Perfect for tech-forward audiences.",
      html: createModernTechTemplate(branding),
    },
    {
      name: "Executive Summary",
      description: "Condensed, text-focused format designed for busy executives who want quick insights.",
      html: createExecutiveSummaryTemplate(branding),
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
          description: template.description,
        },
      });
      console.log(`Updated: ${template.name}`);
    } else {
      // Create new template
      await prisma.emailTemplate.create({
        data: {
          name: template.name,
          description: template.description,
          html: template.html,
          isActive: false,
          isDefault: false,
        },
      });
      console.log(`Created: ${template.name}`);
    }
  }

  console.log("\nDone! Templates are ready in your dashboard.");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
