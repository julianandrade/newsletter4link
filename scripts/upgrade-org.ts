import { prisma } from "../lib/db";

async function main() {
  const updated = await prisma.organization.update({
    where: { id: "default-org-001" },
    data: {
      plan: "PROFESSIONAL",
      subscriberLimit: 25000, // Professional plan limit
      customDomain: "linkconsulting.com"
    }
  });
  console.log("Updated organization:", JSON.stringify(updated, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
