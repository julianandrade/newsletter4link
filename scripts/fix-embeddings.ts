import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Count bad embeddings
  const result = await prisma.$queryRaw<[{count: number}]>`
    SELECT COUNT(*)::int as count FROM "Article" WHERE embedding::text = '{}'
  `;
  console.log('Articles with bad embeddings:', result[0].count);

  // Delete them
  const deleted = await prisma.$executeRaw`
    DELETE FROM "Article" WHERE embedding::text = '{}'
  `;
  console.log('Deleted:', deleted, 'articles');
}

main().catch(console.error).finally(() => prisma.$disconnect());
