import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { SEED_WATCHLIST } from "../lib/radar/watchlist";

/**
 * RQ-004 phase A: put the seed watchlist in the database, and have every
 * organization watch it.
 *
 * Idempotent on `slug`, so running it twice changes nothing and running it after a
 * query is edited in `lib/radar/watchlist.ts` updates that query.
 *
 * It does not touch measured precision or the active flag. Those are the validation
 * script's to write, and re-seeding must not quietly reactivate an entity that was
 * deactivated for being too noisy to count.
 *
 *     npx tsx scripts/radar-seed-watchlist.ts
 */

const pool = new Pool({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ["error"] });

async function main() {
  let created = 0;
  let updated = 0;

  for (const entity of SEED_WATCHLIST) {
    const existing = await prisma.radarEntity.findUnique({
      where: { slug: entity.slug },
      select: { id: true, hnQuery: true, arxivQuery: true },
    });

    if (existing) {
      const changed =
        existing.hnQuery !== entity.hnQuery || existing.arxivQuery !== entity.arxivQuery;

      await prisma.radarEntity.update({
        where: { slug: entity.slug },
        data: {
          name: entity.name,
          kind: entity.kind,
          hnQuery: entity.hnQuery,
          arxivQuery: entity.arxivQuery,
        },
      });

      if (changed) {
        updated += 1;
        console.log(`updated  ${entity.slug}`);
        // Worth saying out loud: the stored series was collected with the old query,
        // so a changed query means the series has a seam in it. SignalPoint keeps the
        // query it used for exactly this reason.
        console.log("         query changed, so earlier points used a different query");
      }
    } else {
      await prisma.radarEntity.create({
        data: {
          slug: entity.slug,
          name: entity.name,
          kind: entity.kind,
          hnQuery: entity.hnQuery,
          arxivQuery: entity.arxivQuery,
          precisionNotes: entity.note ?? null,
        },
      });
      created += 1;
      console.log(`created  ${entity.slug}`);
    }
  }

  // Every organization watches the seed list. The watchlist is editorial, so this is
  // a starting point rather than a permanent answer, and RadarWatch is what lets one
  // organization drop an entity without affecting anyone else's counts.
  const organizations = await prisma.organization.findMany({ select: { id: true, name: true } });
  const entities = await prisma.radarEntity.findMany({ select: { id: true } });

  let watches = 0;

  for (const organization of organizations) {
    for (const entity of entities) {
      const result = await prisma.radarWatch.upsert({
        where: {
          entityId_organizationId: {
            entityId: entity.id,
            organizationId: organization.id,
          },
        },
        create: { entityId: entity.id, organizationId: organization.id },
        update: {},
      });
      if (result) watches += 1;
    }
  }

  console.log(
    `\n${created} created, ${updated} updated, ${watches} watch rows across ${organizations.length} organization(s).`
  );
  console.log("Next: npx tsx scripts/radar-validate-queries.ts");
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
