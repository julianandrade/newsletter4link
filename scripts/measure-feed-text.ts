import "dotenv/config";

/**
 * How much text each active feed actually gives, and therefore how much of the corpus
 * a Link Take can be written from.
 *
 * Read-only: it fetches the feeds, applies the same cleaning the collector applies, and
 * saves nothing. No AI calls, no writes, so it costs nothing to run and answers the one
 * question that decides whether fetching publishers' pages is needed at all.
 *
 *     npx tsx scripts/measure-feed-text.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { fetchRSSFeed } from "../lib/curation/rss-collector";
import { FULL_TEXT_CHARS } from "../lib/rewrite/input";
import { MIN_USABLE_INPUT_CHARS } from "../lib/rewrite/config";

const pool = new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ["error"] });

async function main() {
  const sources = await prisma.rSSSource.findMany({
    where: { active: true },
    select: { name: true, url: true },
    distinct: ["url"],
    orderBy: { name: "asc" },
  });

  let all = 0, full = 0, excerpt = 0, below = 0;

  console.log("feed".padEnd(30) + "items".padStart(6) + "median".padStart(8) + "full".padStart(6) + "exc".padStart(5) + "under".padStart(7));

  for (const source of sources) {
    try {
      const items = await fetchRSSFeed(source.url, source.name);
      const lengths = items.map((i) => i.content.length).sort((a, b) => a - b);
      if (lengths.length === 0) { console.log(source.name.slice(0, 29).padEnd(30) + "0".padStart(6)); continue; }

      const median = lengths[Math.floor(lengths.length / 2)];
      const f = lengths.filter((n) => n >= FULL_TEXT_CHARS).length;
      const e = lengths.filter((n) => n >= MIN_USABLE_INPUT_CHARS && n < FULL_TEXT_CHARS).length;
      const u = lengths.filter((n) => n < MIN_USABLE_INPUT_CHARS).length;

      all += lengths.length; full += f; excerpt += e; below += u;

      console.log(source.name.slice(0, 29).padEnd(30) + String(lengths.length).padStart(6) + String(median).padStart(8) + String(f).padStart(6) + String(e).padStart(5) + String(u).padStart(7));
    } catch {
      console.log(source.name.slice(0, 29).padEnd(30) + " failed to fetch");
    }
  }

  console.log("");
  console.log("total items          :", all);
  console.log("full text (>=1500)   :", full, `(${Math.round((full / all) * 100)}%)`);
  console.log("excerpt (200..1499)  :", excerpt, `(${Math.round((excerpt / all) * 100)}%)`);
  console.log("under the floor      :", below, `(${Math.round((below / all) * 100)}%)`);
  console.log("");
  console.log("would get a Link Take:", full + excerpt, `(${Math.round(((full + excerpt) / all) * 100)}%)`);
}

main().catch(console.error).finally(async () => { await prisma.$disconnect(); await pool.end(); });
