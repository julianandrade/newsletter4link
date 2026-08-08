/**
 * Delete the articles the inbound pipeline produced, and queue their emails to be read again.
 *
 * Written for 8 August 2026, when six separate defects in the email path were fixed at once
 * and every article the path had produced was suspect:
 *
 * - titles paired with another item's tracking link, because the extractor discarded the
 *   anchor that tied them together
 * - tracking wrappers stored as the publisher's own URL, with `sourceUnresolved: false`
 *   asserting the opposite, which is also why campaign parameters survived: they were
 *   inside the wrapper and only appeared once a browser followed it
 * - `substackcdn.com/image/fetch/...` stored as articles, so the link opened a JPEG
 * - `open.substack.com/...?redirect=app-store`, which opens an app listing
 * - sender addresses stored as source URLs by the essay fallback
 *
 * The emails themselves are kept. Their HTML is still in `InboundEmail`, so the corrected
 * pipeline can be run against exactly the mail that produced the bad rows, which is the
 * only honest way to check that it now does better.
 *
 *   npx tsx --env-file=.env scripts/reset-email-articles.ts            (report only)
 *   npx tsx --env-file=.env scripts/reset-email-articles.ts --apply
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

/**
 * Articles this pipeline created, in both spellings.
 *
 * `inboundEmailId` covers everything since provenance was added for finding D1. The URL
 * shape covers the eleven rows created before it existed, whose `sourceUrl` is a bare
 * email address and which no other query would ever find.
 */
const CREATED_BY_EMAIL: Prisma.ArticleWhereInput = {
  OR: [
    { inboundEmailId: { not: null } },
    { NOT: { sourceUrl: { startsWith: "http" } } },
  ],
};

async function main() {
  const apply = process.argv.includes("--apply");

  const articles = await prisma.article.findMany({
    where: CREATED_BY_EMAIL,
    select: { id: true, title: true, sourceUrl: true, status: true },
  });

  const emails = await prisma.inboundEmail.findMany({
    where: { status: { in: ["PROCESSED", "FAILED"] } },
    select: { id: true, subject: true, html: true, text: true },
  });

  // A row with no body goes back to CONTENT_PENDING, not RECEIVED. Phase two would read
  // null content and fail it for good; the fetch has to happen first.
  const withBody = emails.filter((e) => e.html !== null || e.text !== null);
  const withoutBody = emails.filter((e) => e.html === null && e.text === null);

  console.log(`articles created by the email pipeline : ${articles.length}`);
  console.log(`emails to re-read, body already stored : ${withBody.length}`);
  console.log(`emails to re-read, body still to fetch : ${withoutBody.length}`);

  if (!apply) {
    console.log("\nreport only. Re-run with --apply to delete and requeue.\n");
    for (const article of articles.slice(0, 15)) {
      console.log(`  [${article.status}] ${article.title} -> ${article.sourceUrl.slice(0, 80)}`);
    }
    if (articles.length > 15) console.log(`  … and ${articles.length - 15} more`);
    return;
  }

  const deleted = await prisma.article.deleteMany({ where: CREATED_BY_EMAIL });
  console.log(`\ndeleted ${deleted.count} article(s)`);

  if (withBody.length > 0) {
    await prisma.inboundEmail.updateMany({
      where: { id: { in: withBody.map((e) => e.id) } },
      data: { status: "RECEIVED", processedAt: null, error: null, claimedAt: null },
    });
  }

  if (withoutBody.length > 0) {
    // `retryCount` is cleared with it: the count exists to stop an endlessly failing fetch,
    // and a corrected pipeline is new information rather than another attempt at the same
    // thing.
    await prisma.inboundEmail.updateMany({
      where: { id: { in: withoutBody.map((e) => e.id) } },
      data: {
        status: "CONTENT_PENDING",
        processedAt: null,
        error: null,
        claimedAt: null,
        retryCount: 0,
      },
    });
  }

  console.log(`requeued ${withBody.length + withoutBody.length} email(s)`);
  console.log(
    "\nNow run the ingest:\n  curl -H \"Authorization: Bearer $CRON_SECRET\" \\\n    https://newsletter4link.vercel.app/api/cron/email-ingest"
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
