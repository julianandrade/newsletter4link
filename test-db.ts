import { prisma } from "./lib/db";

async function testDatabase() {
  try {
    console.log("Testing database connection...");

    // Test 1: Check RSS sources
    const sources = await prisma.rSSSource.findMany();
    console.log(`✓ Found ${sources.length} RSS sources`);

    // Test 2: Check articles table
    const articles = await prisma.article.findMany({ take: 5 });
    console.log(`✓ Found ${articles.length} articles`);

    // Test 3: Check subscribers table
    const subscribers = await prisma.subscriber.findMany();
    console.log(`✓ Found ${subscribers.length} subscribers`);

    // Test 4: Check projects table
    const projects = await prisma.project.findMany();
    console.log(`✓ Found ${projects.length} projects`);

    console.log("\n✅ Database connection successful!");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();
