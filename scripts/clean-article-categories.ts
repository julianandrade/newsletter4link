import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { resolveCategory, UNPLACED } from "../lib/ai/categories";

/**
 * Strip category values that are not in the taxonomy.
 *
 * `categorizeArticle` used to store whatever the model returned. Where the model
 * refused to categorise, and it often refused correctly because the article was
 * about solar output or a Linux CVE rather than AI, its prose refusal was split on
 * commas and stored as categories. That is where values like "Based on the title
 * and content provided" and "However" came from.
 *
 * The categoriser now validates its output, so nothing new arrives this way. This
 * script is for rows written before that.
 *
 * Dry run by default, because it rewrites curated data and there is no undo:
 *
 *     npx tsx scripts/clean-article-categories.ts           # report only
 *     npx tsx scripts/clean-article-categories.ts --apply   # write
 *
 * Articles with no category at all are out of scope and never touched: an empty
 * array means the categoriser never saw the article, which is true of most of the
 * corpus, and is a different fact from "could not be placed".
 *
 * An article whose every value is rejected gets the unplaced bucket, so it stays
 * distinguishable from one that was never categorised.
 */

const pool = new Pool({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ["error"] });

const APPLY = process.argv.includes("--apply");

async function main() {
  const articles = await prisma.article.findMany({
    select: { id: true, title: true, category: true },
  });

  /**
   * Only articles that actually carry a category are candidates.
   *
   * The first run of this script reported 3134 changes on 4418 articles, and 3128
   * of those were articles with an empty category array: collected, scored below
   * the threshold, never sent to the categoriser. Treating them as "could not be
   * placed" would state something untrue about 70% of the corpus and destroy the
   * one signal that says nothing has judged them yet.
   */
  const candidates = articles.filter((article) => article.category.length > 0);

  console.log(
    `${articles.length} articles, ${candidates.length} carry a category and are in scope. ` +
      `${articles.length - candidates.length} were never categorised and are left alone.`
  );

  const changes: Array<{
    id: string;
    title: string;
    before: string[];
    after: string[];
    dropped: string[];
  }> = [];

  for (const article of candidates) {
    const kept: string[] = [];
    const dropped: string[] = [];

    for (const value of article.category) {
      const resolved = resolveCategory(value);
      if (resolved && !kept.includes(resolved)) kept.push(resolved);
      else if (!resolved) dropped.push(value);
    }

    const after = kept.length > 0 ? kept : [UNPLACED];

    // Also catches a casing-only fix, such as "machine learning", and a duplicate
    // that collapsed, both of which are real changes worth reporting.
    const same =
      after.length === article.category.length &&
      after.every((value, index) => value === article.category[index]);

    if (!same) {
      changes.push({
        id: article.id,
        title: article.title,
        before: article.category,
        after,
        dropped,
      });
    }
  }

  console.log(`${changes.length} would change.`);

  const droppedCounts = new Map<string, number>();
  for (const change of changes) {
    for (const value of change.dropped) {
      droppedCounts.set(value, (droppedCounts.get(value) ?? 0) + 1);
    }
  }

  if (droppedCounts.size > 0) {
    console.log(`\n${droppedCounts.size} distinct values would be dropped:`);
    for (const [value, count] of [...droppedCounts].sort((a, b) => b[1] - a[1])) {
      const shown = value.length > 70 ? `${value.slice(0, 70)}...` : value;
      console.log(`  ${String(count).padStart(3)}  ${JSON.stringify(shown)}`);
    }
  }

  const emptied = changes.filter((change) => change.after[0] === UNPLACED && change.after.length === 1);
  if (emptied.length > 0) {
    console.log(
      `\n${emptied.length} article(s) would be left with no real category and get "${UNPLACED}":`
    );
    for (const change of emptied.slice(0, 20)) {
      console.log(`  ${change.title.slice(0, 80)}`);
    }
    if (emptied.length > 20) console.log(`  ... and ${emptied.length - 20} more`);
  }

  if (!APPLY) {
    console.log("\nDry run. Nothing was written. Pass --apply to write.");
    return;
  }

  let written = 0;
  for (const change of changes) {
    await prisma.article.update({
      where: { id: change.id },
      data: { category: change.after },
    });
    written += 1;
  }

  console.log(`\n${written} article(s) updated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
