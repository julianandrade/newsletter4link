import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DIRECT_URL,
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ["error", "warn"],
});

const DEFAULT_ORG_ID = "default-org-001";

async function addUserToDefaultOrg() {
  // Get the Supabase user ID from command line or prompt
  const supabaseUserId = process.argv[2];
  const email = process.argv[3] || "user@example.com";
  const name = process.argv[4] || "Admin User";

  if (!supabaseUserId) {
    console.log("Usage: npx tsx scripts/add-user-to-default-org.ts <supabase-user-id> [email] [name]");
    console.log("\nTo find your Supabase user ID:");
    console.log("1. Open your browser's dev tools");
    console.log("2. Look for the auth request or check localStorage");
    console.log("3. Or check the Supabase dashboard under Authentication > Users");

    // List existing OrgUsers for reference
    const existingUsers = await prisma.orgUser.findMany({
      include: { organization: true },
    });

    if (existingUsers.length > 0) {
      console.log("\nExisting organization members:");
      existingUsers.forEach((u) => {
        console.log(`  - ${u.email || u.supabaseUserId} (${u.role}) in ${u.organization.name}`);
      });
    } else {
      console.log("\nNo organization members found yet.");
    }

    await prisma.$disconnect();
    process.exit(1);
  }

  try {
    // Check if user already exists in the org
    const existingMember = await prisma.orgUser.findFirst({
      where: {
        supabaseUserId,
        organizationId: DEFAULT_ORG_ID,
      },
    });

    if (existingMember) {
      console.log("User is already a member of the default organization.");
      console.log(`  Role: ${existingMember.role}`);
      await prisma.$disconnect();
      return;
    }

    // Check if the default org exists
    const org = await prisma.organization.findUnique({
      where: { id: DEFAULT_ORG_ID },
    });

    if (!org) {
      console.error("Default organization not found. Run the migration first.");
      await prisma.$disconnect();
      process.exit(1);
    }

    // Add user to the organization as OWNER
    const newMember = await prisma.orgUser.create({
      data: {
        supabaseUserId,
        email,
        name,
        role: "OWNER",
        organizationId: DEFAULT_ORG_ID,
      },
    });

    console.log("✅ User added to default organization successfully!");
    console.log(`  Organization: ${org.name} (${org.slug})`);
    console.log(`  User ID: ${supabaseUserId}`);
    console.log(`  Email: ${email}`);
    console.log(`  Role: OWNER`);
    console.log(`\nYou can now refresh the app and should be redirected to the dashboard.`);
  } catch (error) {
    console.error("Error adding user:", error);
  } finally {
    await prisma.$disconnect();
  }
}

addUserToDefaultOrg();
