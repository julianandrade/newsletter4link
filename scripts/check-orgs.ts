import { prisma } from "../lib/db";

async function main() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, slug: true, plan: true, customDomain: true }
  });
  console.log("Organizations:", JSON.stringify(orgs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
