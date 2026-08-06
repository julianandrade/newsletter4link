import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * Separate an article's capture time from its publication date.
 *
 *     npx tsx scripts/backfill-captured-at.ts           # report only
 *     npx tsx scripts/backfill-captured-at.ts --apply   # write
 *
 * Two passes, and the first matters as much as the second.
 *
 * **capturedAt = createdAt.** The column arrived with `@default(now())`, so every existing
 * row would otherwise claim it was captured at the moment of the migration. `createdAt` is
 * when we actually took it in, and it has always been correct, so this moves a true value
 * into the column that now means it. Without this pass the migration replaces one wrong
 * date with another.
 *
 * **publishedAt = null where it was really the ingestion time.** Finding C1:
 * `curateArticle` wrote `publishedAt: new Date()`, so every article arriving through a
 * newsletter carried its ingestion time as its publication date, and the queue displayed
 * that under a column headed PUBLISHED. The signature is a publishedAt within a couple of
 * seconds of createdAt, which no real feed produces: a feed's pubDate predates our
 * collection by minutes at best.
 *
 * The window is deliberately tight. Widening it to a minute would catch a genuinely
 * fresh RSS item collected moments after publication and erase a date we legitimately
 * knew, which is a worse error than leaving a few wrong ones behind.
 */

const pool = new Pool({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ["error"] });

const APPLY = process.argv.includes("--apply");

/** Seconds within which publishedAt is indistinguishable from the row's own creation. */
const INGESTION_WINDOW_SECONDS = 2;

async function main() {
  const total = await prisma.article.count();

  /**
   * Rows whose capturedAt still holds the migration's default rather than their creation.
   * Compared against createdAt rather than against a fixed date, so re-running is safe.
   */
  const needCaptured = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*)::bigint AS n FROM "Article"
      WHERE abs(EXTRACT(EPOCH FROM ("capturedAt" - "createdAt"))) > 1`
  );

  const suspicious = await prisma.$queryRawUnsafe<
    Array<{ id: string; title: string; publishedAt: Date; sourceUrl: string }>
  >(
    `SELECT id, title, "publishedAt", "sourceUrl" FROM "Article"
      WHERE "publishedAt" IS NOT NULL
        AND abs(EXTRACT(EPOCH FROM ("publishedAt" - "createdAt"))) < ${INGESTION_WINDOW_SECONDS}
      ORDER BY "createdAt" DESC`
  );

  console.log(`${total} articles.`);
  console.log(
    `Pass 1: ${Number(needCaptured[0].n)} need capturedAt moved back to createdAt.`
  );
  console.log(
    `Pass 2: ${suspicious.length} carry a publishedAt within ${INGESTION_WINDOW_SECONDS}s of createdAt, which is the ingestion time rather than a publication date.`
  );

  for (const article of suspicious.slice(0, 12)) {
    let host = article.sourceUrl;
    try {
      host = new URL(article.sourceUrl).hostname;
    } catch {
      // Leave the raw value; a URL we cannot parse is worth seeing as it is.
    }
    console.log(
      `  ${article.publishedAt.toISOString().slice(0, 16)}  ${host.padEnd(28)} ${article.title.slice(0, 52)}`
    );
  }
  if (suspicious.length > 12) {
    console.log(`  and ${suspicious.length - 12} more`);
  }

  if (!APPLY) {
    console.log("\nDry run. Nothing was written. Pass --apply.");
    return;
  }

  const captured = await prisma.$executeRawUnsafe(
    `UPDATE "Article" SET "capturedAt" = "createdAt"
      WHERE abs(EXTRACT(EPOCH FROM ("capturedAt" - "createdAt"))) > 1`
  );
  console.log(`\nPass 1: ${captured} rows had capturedAt set to createdAt.`);

  const cleared = await prisma.$executeRawUnsafe(
    `UPDATE "Article" SET "publishedAt" = NULL
      WHERE "publishedAt" IS NOT NULL
        AND abs(EXTRACT(EPOCH FROM ("publishedAt" - "createdAt"))) < ${INGESTION_WINDOW_SECONDS}`
  );
  console.log(`Pass 2: ${cleared} rows had publishedAt cleared.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
