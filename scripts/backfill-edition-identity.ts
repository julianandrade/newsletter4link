import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { isoWeekStart } from "../lib/radar/week";
import { weeklySlotFor } from "../lib/editions/identity";

/**
 * Fill publishDate, weeklySlot and kind on editions written before those columns existed.
 *
 *     npx tsx scripts/backfill-edition-identity.ts           # report only
 *     npx tsx scripts/backfill-edition-identity.ts --apply   # write
 *
 * Every existing edition is a weekly one: the only two ways to create an edition before
 * this change were the weekly schedule and a dialog that asked for a week number. So each
 * row gets kind WEEKLY and the slot for the week it already claims.
 *
 * publishDate is the Monday of that week, not sentAt. A sent edition's sentAt is when the
 * job ran, which is a different fact and would put two editions of one week on different
 * weekdays for no reason. The Monday is what the week/year pair already meant.
 */

const pool = new Pool({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ["error"] });

const APPLY = process.argv.includes("--apply");

async function main() {
  const editions = await prisma.edition.findMany({
    select: {
      id: true,
      week: true,
      year: true,
      status: true,
      organizationId: true,
      weeklySlot: true,
      publishDate: true,
    },
    orderBy: [{ year: "asc" }, { week: "asc" }],
  });

  console.log(`${editions.length} editions found.`);

  /**
   * A row that already has a slot has been through this script, or was created after the
   * change. Skipped rather than rewritten: rewriting would overwrite a title-bearing
   * special edition's null slot with a week slot and make it collide with its weekly.
   */
  const needSlot = editions.filter((edition) => edition.weeklySlot === null);

  console.log(
    `${needSlot.length} need a slot. ${editions.length - needSlot.length} already carry one and are left alone.`
  );

  /**
   * Two editions of one organization claiming one week would break the new unique index.
   * The old index made that impossible, so finding one means something else is wrong and
   * the script must stop rather than pick a winner.
   */
  const seen = new Map<string, string>();
  const collisions: string[] = [];

  for (const edition of needSlot) {
    const key = `${edition.organizationId}:${weeklySlotFor(edition.week, edition.year)}`;
    const first = seen.get(key);
    if (first) {
      collisions.push(`${key} is claimed by both ${first} and ${edition.id}`);
      continue;
    }
    seen.set(key, edition.id);
  }

  if (collisions.length > 0) {
    console.error("Refusing to write. Two editions claim one week:");
    for (const line of collisions) console.error(`  ${line}`);
    process.exitCode = 1;
    return;
  }

  for (const edition of needSlot) {
    const slot = weeklySlotFor(edition.week, edition.year);
    const publishDate = isoWeekStart(edition.week, edition.year);

    console.log(
      `  ${edition.id}  week ${edition.week} of ${edition.year}  ->  slot ${slot}, publishDate ${publishDate.toISOString().slice(0, 10)}, kind WEEKLY`
    );

    if (!APPLY) continue;

    await prisma.edition.update({
      where: { id: edition.id },
      data: { weeklySlot: slot, publishDate, kind: "WEEKLY" },
    });
  }

  console.log(
    APPLY
      ? `Wrote ${needSlot.length} editions.`
      : "Dry run. Nothing was written. Pass --apply."
  );
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
