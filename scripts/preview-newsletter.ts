/**
 * Renders the newsletter email template to static HTML and screenshots it at
 * desktop and mobile widths — a quick visual QA loop for the email design
 * without needing a running app, database, or email provider.
 *
 * Usage: npx tsx scripts/preview-newsletter.ts
 * Output: .preview/newsletter.html, .preview/newsletter-desktop.png,
 *         .preview/newsletter-mobile.png
 */
import { render } from "@react-email/components";
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import NewsletterEmail from "../emails/newsletter";

const sampleData = {
  week: 24,
  year: 2026,
  previewText: "Week 24, 2026: OpenAI ships agentic browser to all Plus users",
  unsubscribeUrl: "https://newsletter4link.vercel.app/unsubscribe?token=sample",
  articles: [
    {
      title: "OpenAI ships agentic browser to all Plus users",
      summary:
        "OpenAI rolled out its agentic browsing mode to every Plus subscriber, letting the assistant navigate, fill forms, and complete multi-step tasks autonomously. Early benchmarks show task completion rates of 78% on real-world workflows, a significant jump from research previews.",
      sourceUrl: "https://example.com/openai-browser",
      category: ["Large Language Models", "AI Tools"],
    },
    {
      title: "EU AI Act enforcement begins for general-purpose models",
      summary:
        "The second enforcement phase of the EU AI Act came into force this week, requiring providers of general-purpose AI models to publish training-data summaries and energy usage. Consultancies report a surge in compliance-audit requests from mid-market clients.",
      sourceUrl: "https://example.com/eu-ai-act",
      category: ["AI Regulation"],
    },
    {
      title: "Anthropic publishes interpretability breakthrough on feature steering",
      summary:
        "New research demonstrates reliable behavioral steering of production-scale models by manipulating learned features directly, opening practical paths for fine-grained safety controls without retraining. The paper includes open-source tooling.",
      sourceUrl: "https://example.com/anthropic-interp",
      category: ["AI Research", "AI Ethics"],
    },
  ],
  projects: [
    {
      name: "Invoice Intelligence for RetailCo",
      description:
        "Deployed a document-AI pipeline that extracts, validates, and posts supplier invoices end-to-end, integrated with the client's SAP system.",
      team: "Data & AI Practice",
      impact: "Processing time per invoice down from 9 minutes to 40 seconds; 99.2% extraction accuracy.",
      projectDate: new Date("2026-05-15").toISOString(),
    },
  ],
};

async function main() {
  const outDir = path.join(process.cwd(), ".preview");
  mkdirSync(outDir, { recursive: true });

  const html = await render(NewsletterEmail(sampleData));
  const htmlPath = path.join(outDir, "newsletter.html");
  writeFileSync(htmlPath, html);
  console.log(`HTML: ${htmlPath} (${html.length} bytes)`);

  // PLAYWRIGHT_CHROMIUM_PATH lets sandboxed environments point at a
  // pre-provisioned Chromium when the matching revision can't be downloaded.
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  for (const [name, width] of [
    ["desktop", 800],
    ["mobile", 390],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(`file://${htmlPath}`);
    const shot = path.join(outDir, `newsletter-${name}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    console.log(`Screenshot: ${shot}`);
    await page.close();
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
