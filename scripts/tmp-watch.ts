/** Throwaway: watch the backlog drain without touching it. Delete after. */
import { prisma } from "../lib/db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function snapshot() {
  const [received, claimed, processed, articles] = await Promise.all([
    prisma.inboundEmail.count({ where: { status: "RECEIVED" } }),
    prisma.inboundEmail.count({
      where: { status: "RECEIVED", NOT: { claimedAt: null } },
    }),
    prisma.inboundEmail.count({ where: { status: "PROCESSED" } }),
    prisma.article.count(),
  ]);
  return { received, claimed, processed, articles };
}

async function main() {
  const started = Date.now();

  for (let i = 0; i < 16; i += 1) {
    const s = await snapshot();
    const secs = Math.round((Date.now() - started) / 1000);
    console.log(
      `t+${String(secs).padStart(3)}s  RECEIVED=${s.received} (claimed ${s.claimed})  PROCESSED=${s.processed}  articles=${s.articles}`
    );

    if (s.received === 0) {
      console.log("\nbacklog drained with no further manual call");
      return;
    }

    await sleep(15_000);
  }

  console.log("\nstill draining after four minutes");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
