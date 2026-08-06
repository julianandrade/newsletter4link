/** Throwaway: the 8 cheapest processed emails, for testing the handover. Delete after. */
import { prisma } from "../lib/db";

async function main() {
  const rows = await prisma.$queryRaw<Array<{ id: string; from: string; bytes: number }>>`
    SELECT id, "from", LENGTH(html) AS bytes
    FROM "InboundEmail"
    WHERE status = 'PROCESSED' AND html IS NOT NULL
    ORDER BY LENGTH(html) ASC
    LIMIT 8
  `;

  for (const r of rows) {
    console.log(`${r.id}  ${Math.round(Number(r.bytes) / 1024)}kb  ${r.from}`);
  }
  console.log("\nIDS=" + rows.map((r) => r.id).join(" "));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
