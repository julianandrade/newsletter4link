/**
 * Clear the feed-fetcher state the RSS collector wrote onto EMAIL sources.
 *
 * `getActiveRSSSources` selected on `active` and `organizationId` but not on `type`, so the
 * daily collection picked up every EMAIL source, handed its sender address to the feed
 * parser, and then recorded the failure with `updateRSSSourceFetchedAt`. On 8 August 2026
 * all thirty of this project's newsletters carried
 * `Failed to fetch RSS feed <name>: connect ECONNREFUSED 127.0.0.1`, written that morning.
 *
 * The query is filtered now, so nothing new is written. This clears what was already
 * there, because the sources screen reads `lastError` to show a source's health and would
 * keep displaying thirty working newsletters as broken until somebody looked into it.
 *
 * `lastReceivedAt` is deliberately untouched: that one is real, written by the email
 * ingest, and it is what an email source's health should actually be judged on.
 *
 *   npx tsx --env-file=.env scripts/clear-email-source-feed-errors.ts          (report)
 *   npx tsx --env-file=.env scripts/clear-email-source-feed-errors.ts --apply
 */
import { prisma } from "../lib/db";

async function main() {
  const apply = process.argv.includes("--apply");

  const affected = await prisma.rSSSource.findMany({
    where: {
      type: "EMAIL",
      OR: [{ lastError: { not: null } }, { lastFetchedAt: { not: null } }],
    },
    select: { id: true, name: true, lastError: true },
  });

  console.log(`EMAIL sources carrying feed-fetcher state: ${affected.length}`);

  if (!apply) {
    affected.slice(0, 10).forEach((s) =>
      console.log(`  ${s.name.padEnd(28)} ${(s.lastError ?? "(no error, only a timestamp)").slice(0, 60)}`)
    );
    if (affected.length > 10) console.log(`  … and ${affected.length - 10} more`);
    console.log("\nreport only. Re-run with --apply to clear.");
    return;
  }

  const result = await prisma.rSSSource.updateMany({
    where: { id: { in: affected.map((s) => s.id) } },
    data: { lastError: null, lastFetchedAt: null },
  });

  console.log(`cleared ${result.count} source(s)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
