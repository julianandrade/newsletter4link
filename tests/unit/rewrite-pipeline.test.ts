import { describe, expect, it, vi } from "vitest";
import { publicationOf, rewriteArticle } from "@/lib/rewrite/pipeline";
import { EAGER_DAILY_CAP, ON_OPEN_DAILY_CAP } from "@/lib/rewrite/config";
import type { AskModel } from "@/lib/rewrite/generate";

const SOURCE = `OpenAI said on Tuesday that it would begin rolling out its new agent
platform to enterprise customers in 14 countries, starting with a limited group of about
2,500 organisations. The company reported that early pilots cut document handling time by
38 percent, though it declined to name the participants. Pricing starts at 240 dollars per
seat per year and the rollout completes in March 2027. Rivals including Anthropic and
Google have announced comparable products in the past six months, and analysts expect the
enterprise agent market to consolidate quickly as procurement teams standardise on one
vendor rather than several.`;

const CLEAN = JSON.stringify({
  title: "A aposta empresarial da OpenAI",
  body: "A OpenAI abriu a plataforma de agentes a empresas em 14 paises.",
});

/**
 * A stand-in tenant client. Records what it was asked and holds rows in memory, so the
 * order of refusals, which is the part that decides spend, is testable without a database.
 */
function fakeDb(options: {
  article?: Record<string, unknown> | null;
  rewrites?: Array<Record<string, unknown>>;
  settings?: Record<string, unknown> | null;
  countToday?: number;
} = {}) {
  const rewrites = [...(options.rewrites ?? [])];
  const created: Array<Record<string, unknown>> = [];

  const article =
    options.article === undefined
      ? {
          id: "a1",
          title: "OpenAI opens its agent platform",
          content: SOURCE,
          sourceUrl: "https://www.reuters.com/tech/openai-agents",
          publishedAt: new Date("2026-08-01T00:00:00Z"),
          contentHash: null,
          summary: "A summary.",
        }
      : options.article;

  const db = {
    organizationId: "org-1",
    article: {
      findUnique: async () => article,
    },
    orgSettings: {
      findUnique: async () =>
        options.settings === undefined
          ? { rewriteLanguage: "pt-PT", orgContextPrompt: "A consultancy.", relevanceHeading: "Relevancia para a Link", brandVoicePrompt: null }
          : options.settings,
    },
    articleRewrite: {
      findFirst: async () => rewrites.find((row) => row.supersededAt === null) ?? null,
      findMany: async () => rewrites,
      count: async () => options.countToday ?? 0,
    },
    $raw: {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          articleRewrite: {
            updateMany: async () => {
              for (const row of rewrites) row.supersededAt = new Date();
              return { count: rewrites.length };
            },
            create: async (args: { data: Record<string, unknown> }) => {
              const row = { ...args.data, id: `r${created.length + 1}`, generatedAt: new Date(), supersededAt: null };
              created.push(row);
              rewrites.push(row);
              return { id: row.id };
            },
          },
        }),
    },
  } as never;

  return { db, created, rewrites };
}

vi.mock("@/lib/ai/model", () => ({
  resolveAiModels: async () => ({ model: "claude-sonnet-5" }),
  rethrowIfModelRejected: () => {},
}));

const ask = (reply: string): AskModel => async () => reply;

describe("rewriteArticle, the happy path", () => {
  it("generates, stores and returns the stored row", async () => {
    const { db, created } = fakeDb();

    const outcome = await rewriteArticle(db, "a1", "approval", { ask: ask(CLEAN) });

    expect(outcome.status).toBe("generated");
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe("GENERATED");
    expect(created[0].checksPassed).toBe(true);
    // The evidence is stored, not just the prose.
    expect(created[0].checkSummary).toContain("passed");
    expect(created[0].longestSharedRun).toBeTypeOf("number");
  });

  it("records which model and language were used", async () => {
    const { db, created } = fakeDb();

    await rewriteArticle(db, "a1", "approval", { ask: ask(CLEAN) });

    expect(created[0].model).toBe("claude-sonnet-5");
    expect(created[0].language).toBe("pt-PT");
  });
});

describe("rewriteArticle spends nothing it does not have to", () => {
  it("reuses a current passing rewrite without calling the model", async () => {
    const asked = vi.fn<AskModel>(async () => CLEAN);
    const { db } = fakeDb({
      rewrites: [
        {
          id: "r0",
          status: "GENERATED",
          checksPassed: true,
          supersededAt: null,
          sourceHash: null,
          generatedAt: new Date(),
        },
      ],
    });

    const outcome = await rewriteArticle(db, "a1", "on-open", { ask: asked });

    expect(outcome.status).toBe("reused");
    expect(asked).not.toHaveBeenCalled();
  });

  it("does not retry a refusal on every read", async () => {
    // Whatever made it refuse is still true a minute later, and retrying turns one wasted
    // pair of calls into an unbounded number.
    const asked = vi.fn<AskModel>(async () => CLEAN);
    const { db } = fakeDb({
      rewrites: [
        {
          id: "r0",
          status: "FAILED",
          checksPassed: false,
          supersededAt: null,
          sourceHash: null,
          error: "the source text is too short",
          generatedAt: new Date(),
        },
      ],
    });

    const outcome = await rewriteArticle(db, "a1", "on-open", { ask: asked });

    expect(outcome.status).toBe("skipped");
    expect(asked).not.toHaveBeenCalled();
    if (outcome.status !== "skipped") return;
    expect(outcome.reason).toContain("too short");
  });

  it("regenerates when forced, even over a passing rewrite", async () => {
    const asked = vi.fn<AskModel>(async () => CLEAN);
    const { db } = fakeDb({
      rewrites: [
        {
          id: "r0",
          status: "GENERATED",
          checksPassed: true,
          supersededAt: null,
          sourceHash: null,
          generatedAt: new Date(),
        },
      ],
    });

    const outcome = await rewriteArticle(db, "a1", "on-open", {
      ask: asked,
      force: true,
    });

    expect(asked).toHaveBeenCalled();
    expect(outcome.status).toBe("generated");
  });

  it("stops at the approval cap", async () => {
    const asked = vi.fn<AskModel>(async () => CLEAN);
    const { db } = fakeDb({ countToday: EAGER_DAILY_CAP });

    const outcome = await rewriteArticle(db, "a1", "approval", { ask: asked });

    expect(outcome.status).toBe("skipped");
    expect(asked).not.toHaveBeenCalled();
    if (outcome.status !== "skipped") return;
    expect(outcome.reason).toContain(String(EAGER_DAILY_CAP));
  });

  it("holds reads to their own, looser cap", async () => {
    // A person opening one article is not the runaway case, and should not hit a wall
    // because a collection run was busy.
    const { db } = fakeDb({ countToday: EAGER_DAILY_CAP });

    const outcome = await rewriteArticle(db, "a1", "on-open", { ask: ask(CLEAN) });

    expect(outcome.status).toBe("generated");
    expect(ON_OPEN_DAILY_CAP).toBeGreaterThan(EAGER_DAILY_CAP);
  });

  it("stops at the read cap too", async () => {
    const asked = vi.fn<AskModel>(async () => CLEAN);
    const { db } = fakeDb({ countToday: ON_OPEN_DAILY_CAP });

    const outcome = await rewriteArticle(db, "a1", "on-open", { ask: asked });

    expect(outcome.status).toBe("skipped");
    expect(asked).not.toHaveBeenCalled();
  });

  it("checks the cap before resolving the input, and the input before the model", async () => {
    // Cheapest refusal first: nothing here should spend before it has to.
    const asked = vi.fn<AskModel>(async () => CLEAN);
    const { db, created } = fakeDb({
      article: {
        id: "a1",
        title: "Tiny",
        content: "Too short to write from.",
        sourceUrl: "https://techcrunch.com/a",
        publishedAt: new Date(),
        contentHash: null,
      },
    });

    const outcome = await rewriteArticle(db, "a1", "approval", { ask: asked });

    expect(asked).not.toHaveBeenCalled();
    expect(outcome.status).toBe("refused");
    // The reason is stored rather than thrown away: "why is there no Link Take" is a
    // question somebody will ask.
    expect(created[0].status).toBe("FAILED");
    expect(String(created[0].error)).toContain("floor");
  });
});

describe("rewriteArticle records refusals", () => {
  it("stores a FAILED row when the checks refuse the output", async () => {
    const invented = JSON.stringify({
      title: "Titulo",
      body: "Sao 91000 clientes em 62 paises.",
    });
    const { db, created } = fakeDb();

    const outcome = await rewriteArticle(db, "a1", "approval", { ask: ask(invented) });

    expect(outcome.status).toBe("refused");
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe("FAILED");
    expect(created[0].checksPassed).toBe(false);
    expect(created[0].checkFailures).toBeDefined();
  });

  it("skips an article that does not exist in this organization", async () => {
    const { db } = fakeDb({ article: null });

    const outcome = await rewriteArticle(db, "nope", "approval", { ask: ask(CLEAN) });

    expect(outcome.status).toBe("skipped");
    if (outcome.status !== "skipped") return;
    expect(outcome.reason).toContain("no such article");
  });

  it("falls back to a default heading when settings are absent", async () => {
    const { db, created } = fakeDb({ settings: null });

    await rewriteArticle(db, "a1", "approval", { ask: ask(CLEAN) });

    expect(created[0].language).toBe("pt-PT");
  });
});

describe("publicationOf", () => {
  it("reads the publication from the URL", () => {
    expect(publicationOf("https://www.reuters.com/tech/a")).toBe("reuters.com");
  });

  it("keeps a meaningful subdomain", () => {
    expect(publicationOf("https://news.ycombinator.com/item?id=1")).toBe(
      "news.ycombinator.com"
    );
  });

  it("says unknown rather than throwing", () => {
    expect(publicationOf("not a url")).toBe("unknown");
  });
});
