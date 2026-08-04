import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import Anthropic from "@anthropic-ai/sdk";
import {
  sampleArxiv,
  sampleHackerNews,
  RATE_LIMIT_MS,
} from "../lib/radar/sources";
import { PRECISION_THRESHOLD, SEED_WATCHLIST } from "../lib/radar/watchlist";

/**
 * RQ-004_02: measure the precision of every watchlist query, before a single day is
 * collected.
 *
 * This is the deliverable finding F1 asks for, and it comes first for a reason the
 * forward-only decision makes sharp: a query that is wrong on day one cannot be
 * fixed at week twelve, because there is no archive to re-query. Getting "MCP" wrong
 * on the first day means the whole series is worthless when it is finally read.
 *
 * Method: sample up to 20 recent hits per query, ask Claude to judge each one for
 * whether it actually refers to the entity, and record the fraction that do. The
 * judge sees only the titles, which is what a reader of a trend report would see.
 *
 * A judgement by a model is not a substitute for a human reading them, which is why
 * every sample and verdict is printed. The numbers are stored so the decision is
 * reviewable rather than asserted.
 *
 *     npx tsx scripts/radar-validate-queries.ts            # measure and print
 *     npx tsx scripts/radar-validate-queries.ts --write    # also store on the entity
 */

const pool = new Pool({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool), log: ["error"] });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const WRITE = process.argv.includes("--write");
const SAMPLE_SIZE = 20;

/** Haiku, deliberately: judging 20 short titles is not work that needs a larger
 *  model, and this runs 40 times. */
const JUDGE_MODEL = "claude-haiku-4-5";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Judgement {
  precision: number;
  verdicts: Array<{ title: string; refers: boolean }>;
}

async function judge(
  entityName: string,
  titles: string[]
): Promise<Judgement | null> {
  if (titles.length === 0) return null;

  const numbered = titles.map((title, index) => `${index + 1}. ${title}`).join("\n");

  const message = await anthropic.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are checking whether a search query returned results about the right thing.

The entity being tracked is: ${entityName}

Below are titles returned by the query. For each one, decide whether it is about ${entityName} or not.

Count as YES:
- the entity itself, in any version or size
- work that builds on, fine-tunes, extends, attacks, benchmarks or evaluates it
- a derivative that carries its name
- work that uses it as one of several systems compared, or as a baseline, or as the
  model behind an experiment, even in passing

Count as NO:
- something unrelated that merely shares a word or an abbreviation
- a different technology with a similar name
- a title too vague to tell either way

The purpose is measuring how often the entity is talked about, so a paper that fine-tunes it is talking about it. Only reject a title when the match is a coincidence of wording.

Answer with one line per title, in the form "<number>: yes" or "<number>: no". No other text.

${numbered}`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  const verdicts = titles.map((title, index) => {
    const match = text.match(new RegExp(`^\\s*${index + 1}\\s*:\\s*(yes|no)`, "im"));
    // An unparsed line counts as "no": an unreadable verdict must not inflate
    // precision, which is the number deciding whether the entity is trusted.
    return { title, refers: match ? match[1].toLowerCase() === "yes" : false };
  });

  const hits = verdicts.filter((verdict) => verdict.refers).length;

  return { precision: hits / verdicts.length, verdicts };
}

async function main() {
  const results: Array<{
    slug: string;
    name: string;
    source: "HN" | "ARXIV";
    query: string;
    sampled: number;
    precision: number | null;
    verdicts: Judgement["verdicts"];
  }> = [];

  for (const entity of SEED_WATCHLIST) {
    for (const source of ["HN", "ARXIV"] as const) {
      const query = source === "HN" ? entity.hnQuery : entity.arxivQuery;
      if (!query) continue;

      let titles: string[] = [];

      try {
        if (source === "HN") {
          const hits = await sampleHackerNews(query, SAMPLE_SIZE);
          titles = hits.map((hit) => hit.title).filter((title) => title.length > 0);
        } else {
          const hits = await sampleArxiv(query, SAMPLE_SIZE);
          // Title plus the head of the abstract. An `abs:` query matches the
          // abstract, so judging on the title alone rejected real mentions whenever
          // the title did not name the entity: it put Claude at 15% on a sample
          // whose papers were mostly benchmarking Claude in their abstracts.
          // The whole abstract, not a head of it. Truncating to 320 characters put
          // Claude at 45% on a sample whose papers mostly did benchmark Claude: the
          // name simply appeared after the cut, so the judge saw no mention and said
          // no. A measurement that depends on where a word falls in a paragraph is
          // measuring the wrong thing.
          titles = hits
            .map((hit) =>
              hit.summary ? `${hit.title}. ${hit.summary.slice(0, 1400)}` : hit.title
            )
            .filter((entry) => entry.length > 0);
        }
      } catch (error) {
        console.error(
          `  ${entity.slug} ${source}: could not sample (${error instanceof Error ? error.message : "unknown"})`
        );
        results.push({
          slug: entity.slug,
          name: entity.name,
          source,
          query,
          sampled: 0,
          precision: null,
          verdicts: [],
        });
        await sleep(RATE_LIMIT_MS[source]);
        continue;
      }

      const judged = await judge(entity.name, titles);

      results.push({
        slug: entity.slug,
        name: entity.name,
        source,
        query,
        sampled: titles.length,
        precision: judged?.precision ?? null,
        verdicts: judged?.verdicts ?? [],
      });

      const shown =
        judged === null
          ? "no sample"
          : `${(judged.precision * 100).toFixed(0)}% of ${titles.length}`;

      console.log(`${entity.slug.padEnd(32)} ${source.padEnd(6)} ${shown}`);

      await sleep(RATE_LIMIT_MS[source]);
    }
  }

  console.log("\n=== below the threshold, and why ===");
  const failing = results.filter(
    (result) => result.precision !== null && result.precision < PRECISION_THRESHOLD
  );

  if (failing.length === 0) {
    console.log("none");
  }

  for (const result of failing) {
    console.log(
      `\n${result.slug} ${result.source}: ${((result.precision ?? 0) * 100).toFixed(0)}% for query ${JSON.stringify(result.query)}`
    );
    for (const verdict of result.verdicts.filter((v) => !v.refers)) {
      console.log(`   not it: ${verdict.title.slice(0, 120)}`);
    }
  }

  console.log("\n=== nothing sampled at all ===");
  const empty = results.filter((result) => result.sampled === 0);
  console.log(empty.length === 0 ? "none" : empty.map((r) => `${r.slug} ${r.source}`).join(", "));

  if (!WRITE) {
    console.log("\nMeasured only. Pass --write to store these on the entities.");
    return;
  }

  const measuredAt = new Date();

  for (const entity of SEED_WATCHLIST) {
    const hn = results.find((r) => r.slug === entity.slug && r.source === "HN");
    const arxiv = results.find((r) => r.slug === entity.slug && r.source === "ARXIV");

    const notes = [entity.note, hn && `HN sampled ${hn.sampled}`, arxiv && `arXiv sampled ${arxiv.sampled}`]
      .filter(Boolean)
      .join(" | ");

    /**
     * A query below the bar is dropped, not the entity.
     *
     * Deactivating the whole entity because one source was noisy throws away a good
     * series to punish a bad one: vLLM is unambiguous on Hacker News and collides
     * with Vision LLM on arXiv, and there is no reason for the first fact to lose to
     * the second. The entity only goes inactive when nothing is left to count.
     */
    const failed = (result?: { precision: number | null }) =>
      result !== undefined &&
      result.precision !== null &&
      result.precision < PRECISION_THRESHOLD;

    const keepHn = entity.hnQuery !== null && !failed(hn);
    const keepArxiv = entity.arxivQuery !== null && !failed(arxiv);

    const dropped = [
      !keepHn && entity.hnQuery ? "HN dropped for precision" : null,
      !keepArxiv && entity.arxivQuery ? "arXiv dropped for precision" : null,
    ].filter(Boolean);

    await prisma.radarEntity.update({
      where: { slug: entity.slug },
      data: {
        hnQuery: keepHn ? entity.hnQuery : null,
        arxivQuery: keepArxiv ? entity.arxivQuery : null,
        hnPrecision: hn?.precision ?? null,
        arxivPrecision: arxiv?.precision ?? null,
        precisionMeasured: measuredAt,
        precisionNotes: [notes, ...dropped].filter(Boolean).join(" | ") || null,
        active: keepHn || keepArxiv,
      },
    });
  }

  console.log("\nStored. Entities below the threshold are now inactive.");
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
