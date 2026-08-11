import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * RQ-002 Q6, at the four places that used to swallow it.
 *
 * The decision on record is to fail the run rather than substitute another model. Curation
 * did that. Everywhere else `rethrowIfModelRejected` was imported and never called, so a
 * withdrawn model produced a quietly worse product instead of a failure: planning fell back
 * to the simple planner, a search ran with the query unexpanded, and every search result was
 * scored 5 with the note "Analysis error".
 *
 * These tests drive the provider's own answer for an unknown model id through each path, so
 * a future edit that restores the fallback fails here rather than in production.
 */

const create = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

const { UnusableModelError } = await import("@/lib/ai/model");
const { processQuery } = await import("@/lib/search/query-processor");
const { planNewsletter } = await import("@/lib/generation/content-planner");
const { analyzeResult, analyzeResults, batchAnalyzeResults } = await import(
  "@/lib/search/result-analyzer"
);

/** What the provider actually answers for a model id it does not serve. */
function refusal() {
  return Object.assign(new Error("model: claude-retired-9 not found"), {
    status: 404,
    error: { error: { type: "not_found_error", message: "model not found" } },
  });
}

/** A failure that is not about the model, which must keep its existing handling. */
function outage() {
  return Object.assign(new Error("Overloaded"), { status: 529 });
}

const MODEL = "claude-retired-9";

function article(id: string) {
  return {
    id,
    title: `Story ${id}`,
    content: "A body long enough to look like an article.",
    summary: "A summary.",
    sourceUrl: `https://example.com/${id}`,
    category: ["ai"],
    relevanceScore: 8,
  };
}

function result(url: string) {
  return { title: "A result", url, snippet: "A snippet.", source: "example.com" };
}

beforeEach(() => {
  create.mockReset();
});

describe("processQuery", () => {
  it("fails on a refused model rather than searching unexpanded", async () => {
    create.mockRejectedValue(refusal());

    await expect(processQuery("agentic ai in banking", MODEL)).rejects.toBeInstanceOf(
      UnusableModelError
    );
  });

  it("still degrades to the plain query when the provider is merely down", async () => {
    // The distinction the whole feature rests on: a 529 is not a bad model, and taking the
    // search down for one would be worse than running it unexpanded.
    create.mockRejectedValue(outage());

    const expansion = await processQuery("agentic ai in banking", MODEL);

    expect(expansion.expanded).toBe("agentic ai in banking");
    expect(expansion.analysis.intent).toBe("general");
  });
});

describe("planNewsletter", () => {
  const articles = [article("a"), article("b"), article("c"), article("d")];

  it("fails on a refused model rather than falling back to simple planning", async () => {
    create.mockRejectedValue(refusal());

    await expect(planNewsletter(articles, MODEL)).rejects.toBeInstanceOf(
      UnusableModelError
    );
  });

  it("still falls back when the failure is not about the model", async () => {
    create.mockRejectedValue(outage());

    const plan = await planNewsletter(articles, MODEL);

    expect(plan.heroArticle).toBeDefined();
    expect(plan.totalArticles).toBe(articles.length);
  });
});

describe("the search analyzer", () => {
  it("fails on a refused model rather than scoring everything 5", async () => {
    create.mockRejectedValue(refusal());

    await expect(
      analyzeResult(result("https://example.com/1"), "a query", null, MODEL)
    ).rejects.toBeInstanceOf(UnusableModelError);
  });

  it("stops the whole loop, rather than counting it as one bad result", async () => {
    create.mockRejectedValue(refusal());

    await expect(
      analyzeResults(
        [result("https://example.com/1"), result("https://example.com/2")],
        "a query",
        null,
        undefined,
        MODEL
      )
    ).rejects.toBeInstanceOf(UnusableModelError);

    // One call, not one per result: the loop stopped instead of repeating the rejection.
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("keeps scoring the rest when one result merely fails", async () => {
    create.mockRejectedValue(outage());

    const analyzed = await analyzeResults(
      [result("https://example.com/1"), result("https://example.com/2")],
      "a query",
      null,
      undefined,
      MODEL
    );

    expect(analyzed).toHaveLength(2);
    expect(analyzed[0].aiScore).toBe(5);
  });

  it("fails the batch path too, which is one call for a whole page", async () => {
    create.mockRejectedValue(refusal());

    await expect(
      batchAnalyzeResults(
        Array.from({ length: 6 }, (_unused, i) => result(`https://example.com/${i}`)),
        "a query",
        null,
        MODEL
      )
    ).rejects.toBeInstanceOf(UnusableModelError);
  });
});

describe("the model that was refused is named", () => {
  it("travels on the error, so a screen does not have to guess", async () => {
    create.mockRejectedValue(refusal());

    await expect(processQuery("a query", MODEL)).rejects.toMatchObject({
      name: "UnusableModelError",
      model: MODEL,
    });
  });
});
