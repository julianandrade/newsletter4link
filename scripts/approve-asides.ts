/**
 * Move every pending closing-slot candidate to APPROVED.
 *
 * The bulk form of what the Pending tab does one row at a time. It exists because the
 * starter library arrives as 24 rows and clicking Approve 24 times is not a review, it is
 * a chore that looks like one.
 *
 * `source` is deliberately left alone. A line a model wrote stays marked MODEL for ever,
 * approved or not, so "did the ones people forwarded come from a person" keeps its answer.
 *
 * Approving does not send anything. An APPROVED row only becomes offerable in the send
 * screen's picker; an editor still chooses one and sends by hand.
 *
 * Run with:
 *   node --env-file=.env scripts/approve-asides.ts          # report only
 *   node --env-file=.env scripts/approve-asides.ts --apply  # actually approve
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
  log: ["error"],
});

const apply = process.argv.includes("--apply");

async function main() {
  const pending = await prisma.aside.findMany({
    where: { status: "PENDING" },
    select: { id: true, text: true, source: true, organizationId: true },
    orderBy: { createdAt: "asc" },
  });

  if (pending.length === 0) {
    console.log("Nothing pending.");
    return;
  }

  console.log(`${pending.length} pending:\n`);
  for (const aside of pending) {
    console.log(`  [${aside.source}] ${aside.text}`);
  }

  if (!apply) {
    console.log("\nReport only. Pass --apply to approve them.");
    return;
  }

  const result = await prisma.aside.updateMany({
    where: { status: "PENDING" },
    data: { status: "APPROVED" },
  });

  const approved = await prisma.aside.count({ where: { status: "APPROVED" } });

  console.log(`\n${result.count} approved. ${approved} now offerable in total.`);
  console.log("Nothing has been sent. An editor still picks one per edition.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
