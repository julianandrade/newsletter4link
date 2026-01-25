/**
 * Script to delete HTML-only templates (templates without designJson)
 * These templates can't be edited in the Unlayer WYSIWYG editor
 * Run with: npx tsx scripts/cleanup-html-templates.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Finding HTML-only templates (no designJson)...\n");

  // Get all templates and filter those without designJson
  const allTemplates = await prisma.emailTemplate.findMany({
    select: { id: true, name: true, designJson: true },
  });

  const htmlOnlyTemplates = allTemplates.filter((t) => !t.designJson);

  if (htmlOnlyTemplates.length === 0) {
    console.log("No HTML-only templates found. Nothing to delete.");
    console.log(`Total templates: ${allTemplates.length}`);
    return;
  }

  console.log(`Found ${htmlOnlyTemplates.length} HTML-only template(s):`);
  for (const t of htmlOnlyTemplates) {
    console.log(`  - ${t.name} (${t.id})`);
  }

  // Delete them by ID
  const idsToDelete = htmlOnlyTemplates.map((t) => t.id);
  const result = await prisma.emailTemplate.deleteMany({
    where: { id: { in: idsToDelete } },
  });

  console.log(`\nDeleted ${result.count} HTML-only template(s).`);
  console.log("Done! You can now create new templates using the WYSIWYG editor.");
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
