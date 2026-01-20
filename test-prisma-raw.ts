import { prisma } from "./lib/db";

async function testPrismaRaw() {
  try {
    console.log("Testing Prisma with raw SQL...\n");

    // Test with raw SQL
    const sources = await prisma.$queryRaw`SELECT * FROM "RSSSource" LIMIT 3`;
    console.log("✓ Raw SQL query successful:", sources);

    console.log("\n✅ Prisma connection working!");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testPrismaRaw();
