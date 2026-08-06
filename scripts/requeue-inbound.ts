/**
 * Put an inbound email back in the queue for phase two.
 *
 * Written for the four newsletters that were marked PROCESSED on 6 August 2026 having
 * produced nothing, because a failed extraction was indistinguishable from an empty one.
 * The code no longer does that, but those rows were already written, and nothing retries
 * a PROCESSED row.
 *
 * Safe to re-run. The content is already fetched, so this only resets the processing
 * status: `RECEIVED` is the state phase two selects on. Re-processing cannot duplicate
 * articles, because the curator checks by URL and by embedding before creating one.
 *
 *   npx tsx scripts/requeue-inbound.ts --failed
 *   npx tsx scripts/requeue-inbound.ts <id> [<id> ...]
 *   npx tsx scripts/requeue-inbound.ts --empty-processed   (produced nothing, no reason)
 */
import { prisma } from "../lib/db";

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("nothing to do: pass ids, --failed, or --empty-processed");
    return;
  }

  let ids: string[];

  if (args.includes("--failed")) {
    const rows = await prisma.inboundEmail.findMany({
      where: { status: "FAILED", NOT: { html: null } },
      select: { id: true },
    });
    ids = rows.map((r) => r.id);
  } else if (args.includes("--empty-processed")) {
    // The shape the bug left behind: processed, a body on file, and nothing to show.
    const rows = await prisma.inboundEmail.findMany({
      where: { status: "PROCESSED", error: null, NOT: { html: null } },
      select: { id: true },
    });
    ids = rows.map((r) => r.id);
  } else {
    ids = args.filter((a) => !a.startsWith("--"));
  }

  if (ids.length === 0) {
    console.log("no matching rows");
    return;
  }

  const before = await prisma.inboundEmail.findMany({
    where: { id: { in: ids } },
    select: { id: true, from: true, status: true, error: true },
  });

  console.log(`requeueing ${before.length} email(s):`);
  for (const row of before) {
    console.log(`  ${row.status} -> RECEIVED | ${row.from}`);
  }

  const updated = await prisma.inboundEmail.updateMany({
    where: { id: { in: ids } },
    data: { status: "RECEIVED", error: null, processedAt: null },
  });

  console.log(`\n${updated.count} row(s) updated. Run the ingest to process them:`);
  console.log(
    `  curl -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/email-ingest?limit=${updated.count}"`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
