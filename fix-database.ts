import { prisma } from "./lib/db";

async function fixDatabase() {
  try {
    console.log("Adding missing column to RSSSource table...");

    await prisma.$executeRaw`ALTER TABLE "RSSSource" ADD COLUMN IF NOT EXISTS "lastError" TEXT`;

    console.log("✅ Column added successfully!");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDatabase();
