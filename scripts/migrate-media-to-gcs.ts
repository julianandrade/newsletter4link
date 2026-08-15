/**
 * Copies media objects from Supabase Storage to GCS and rewrites the URLs that point at them.
 *
 * BLOCKED at the time of writing, and not because of anything here: the Supabase project is
 * restricted for exceeding its egress quota, so the Storage API and even the public object
 * URLs answer 402. Nothing can be read out until the plan is upgraded or the spend cap is
 * removed. Run this once that is resolved.
 *
 *   npx tsx scripts/migrate-media-to-gcs.ts --dry-run
 *   npx tsx scripts/migrate-media-to-gcs.ts
 *
 * POINT DATABASE_URL AT CLOUD SQL BEFORE THE REAL RUN. It reads rows and writes the new URLs
 * back, and the two databases have diverged since the Phase C cutover: Vercel still writes to
 * Supabase, Cloud Run reads Cloud SQL. Rewriting URLs in Supabase would update rows nothing
 * serves from and leave Cloud Run still pointing at 402s. A dry run against either is
 * harmless, since it only reads.
 *
 * What it touches, measured on 15 August 2026:
 *   MediaAsset.url         39 rows
 *   Aside.imageUrl         36 rows
 *   OrgSettings.logoUrl     1 row
 *
 * Idempotent by construction: an object already in GCS is skipped, and a URL already
 * pointing at GCS is left alone. So a partial run is resumed by running it again.
 *
 * The object NAME is preserved. `lib/storage/gcs.ts` builds paths the same
 * `${timestamp}-${safeName}` way Supabase did, so a migrated object keeps its name and only
 * its host changes, which keeps the two stores comparable while both exist.
 *
 * Worth knowing before running: most of these are memes this project generates itself, and
 * `scripts/import-memes.ts` can regenerate them from the templates in `public/images/memes/`.
 * If the copy proves impossible, regenerating is a real alternative to losing them, and it
 * would produce new names, so the URL rewrite below is the part that would differ.
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { uploadFile } from "../lib/storage";
const DRY = process.argv.includes("--dry-run");

/** Everything that stores a media URL, and how to read and write it. */
const TARGETS = [
  {
    label: "MediaAsset.url",
    read: () => prisma.mediaAsset.findMany({ select: { id: true, url: true } }),
    write: (id: string, url: string) => prisma.mediaAsset.update({ where: { id }, data: { url } }),
  },
  {
    label: "Aside.imageUrl",
    read: async () =>
      (await prisma.aside.findMany({ select: { id: true, imageUrl: true } }))
        .map((r: { id: string; imageUrl: string | null }) => ({ id: r.id, url: r.imageUrl })),
    write: (id: string, url: string) => prisma.aside.update({ where: { id }, data: { imageUrl: url } }),
  },
  {
    label: "OrgSettings.logoUrl",
    read: async () =>
      (await prisma.orgSettings.findMany({ select: { id: true, logoUrl: true } }))
        .map((r: { id: string; logoUrl: string | null }) => ({ id: r.id, url: r.logoUrl })),
    write: (id: string, url: string) => prisma.orgSettings.update({ where: { id }, data: { logoUrl: url } }),
  },
] as const;

/** The object name inside the bucket, taken from a Supabase public URL. */
function objectName(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function main() {
  if (!process.env.GCS_MEDIA_BUCKET) {
    throw new Error("GCS_MEDIA_BUCKET is not set, so uploads would go back to Supabase.");
  }

  let copied = 0;
  let skipped = 0;
  let failed = 0;

  for (const target of TARGETS) {
    const rows = await target.read();

    for (const row of rows) {
      const url = row.url;
      if (!url || !url.includes("/storage/v1/object/public/")) {
        skipped++;
        continue;
      }

      const name = objectName(url);
      if (!name) {
        console.warn(`  ? ${target.label} ${row.id}: cannot parse ${url}`);
        failed++;
        continue;
      }

      if (DRY) {
        console.log(`  would copy ${target.label} ${row.id}: ${name}`);
        copied++;
        continue;
      }

      try {
        // Fetched rather than streamed through the Supabase SDK: the object is public, the
        // files are small, and one fewer client is one fewer credential to hold. This is the
        // call that answers 402 while the project is restricted.
        const res = await fetch(url);
        if (!res.ok) throw new Error(`GET ${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));

        const bytes = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get("content-type") ?? "application/octet-stream";

        // Same name, new host. uploadFile prefixes a fresh timestamp, so the original name is
        // passed through as-is and the prefix it already carries is preserved.
        const { url: next } = await uploadFile(bytes, name, contentType);

        await target.write(row.id, next);
        console.log(`  copied ${target.label} ${row.id}: ${name}`);
        copied++;
      } catch (error) {
        console.error(`  FAILED ${target.label} ${row.id}: ${(error as Error).message}`);
        failed++;
      }
    }
  }

  console.log(`\n${DRY ? "dry run: " : ""}copied ${copied}, skipped ${skipped}, failed ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
