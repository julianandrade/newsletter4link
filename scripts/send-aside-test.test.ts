/**
 * A real send, on purpose, for verifying the closing block in an actual inbox.
 *
 * Named `.test.ts` because that is the only way to get vitest's alias and TypeScript
 * resolution, which a plain `node` run cannot do: the app's modules import through `@/`,
 * and Node's ESM resolver handles neither that nor directory imports.
 *
 * It is skipped unless SEND_REAL_EMAIL=1, so `npx vitest run` never mails anybody. Run it
 * deliberately:
 *
 *   SEND_REAL_EMAIL=1 NODE_OPTIONS=--use-system-ca npx vitest run scripts/send-aside-test.test.ts
 *
 * `--use-system-ca` is not optional on this machine. Kaspersky intercepts api.resend.com
 * from Windows and Node ships its own CA bundle, so without it the send dies with
 * SELF_SIGNED_CERT_IN_CHAIN and nothing reaches Resend.
 */

import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { renderNewsletterEmail, newsletterSubject } from "@/lib/email/sender";
import { sendEmail } from "@/lib/email/sender";
import { toEmailAside } from "@/lib/asides/select";

const RECIPIENTS = ["julian.andrade@linkconsulting.com", "jgrandrade@gmail.com"];

const enabled = process.env.SEND_REAL_EMAIL === "1";

describe.skipIf(!enabled)("a real send carrying the closing block", () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
    log: ["error"],
  });

  it(
    "delivers to both addresses, with and without an image",
    async () => {
      const aside = await prisma.aside.findFirst({
        where: { language: "pt-PT" },
        orderBy: { createdAt: "asc" },
      });

      expect(aside, "seed the library first: node --env-file=.env scripts/seed-asides.ts").toBeTruthy();

      const articles = await prisma.article.findMany({
        where: { discardedAt: null, status: "APPROVED" },
        orderBy: [{ relevanceScore: "desc" }],
        take: 6,
      });

      const emailData = {
        articles: articles.map((article) => ({
          title: article.title,
          summary: article.summary || "",
          sourceUrl: article.sourceUrl,
          category: article.category,
          relevanceScore: article.relevanceScore,
          content: article.content,
        })),
        projects: [],
        week: 32,
        year: 2026,
        label: "One more thing, verification send",
        oneMoreThing: toEmailAside(aside!),
      };

      console.log(`Articles in the fixture: ${emailData.articles.length}`);
      console.log(`Aside under test: ${aside!.text}`);

      const html = await renderNewsletterEmail(emailData);

      // The two things that must be true of the bytes before anybody is mailed.
      expect(html).toContain("One more thing");
      expect(html).toContain(aside!.text.slice(0, 30));

      for (const to of RECIPIENTS) {
        const result = await sendEmail(
          to,
          `[TEST] ${newsletterSubject(emailData)}`,
          html
        );

        console.log(`${to}: ${result.success ? `sent ${result.messageId}` : `FAILED ${result.error}`}`);
        expect(result.success, `${to}: ${result.error}`).toBe(true);
      }

      await prisma.$disconnect();
    },
    120_000
  );
});
