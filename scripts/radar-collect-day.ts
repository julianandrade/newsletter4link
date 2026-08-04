import "dotenv/config";
import { collectDay, findMissingDays } from "../lib/radar/collect";

/**
 * Collect one day of radar signals by hand.
 *
 * The schedule does this daily; this is for the day the schedule missed, which
 * matters more here than in most places: collection is forward-only, so a day
 * nobody collected is gone rather than recoverable later.
 *
 *     npx tsx scripts/radar-collect-day.ts              # yesterday, as the cron does
 *     npx tsx scripts/radar-collect-day.ts 2026-08-04   # a specific day, UTC
 *
 * Safe to repeat: the unique key is (entity, source, day), and pairs already
 * collected are skipped without a request.
 */

const argument = process.argv[2];

async function main() {
  if (argument && !/^\d{4}-\d{2}-\d{2}$/.test(argument)) {
    console.error("Give a date as YYYY-MM-DD, or nothing for yesterday.");
    process.exitCode = 1;
    return;
  }

  const result = await collectDay({
    date: argument ? new Date(`${argument}T12:00:00Z`) : undefined,
  });

  console.log(JSON.stringify(result, null, 2));

  const missing = await findMissingDays(14);
  if (missing.length > 0) {
    console.log("\nDays in the last fortnight that are still incomplete:");
    for (const day of missing) {
      console.log(`  ${day.date}  ${day.missing} counts missing`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
