import { describe, expect, it, vi } from "vitest";
import {
  generateRewrite,
  hashSource,
  isStale,
  parseRewriteJson,
  type AskModel,
} from "@/lib/rewrite/generate";
import {
  buildRetryPrompt,
  buildRewritePrompt,
  hasUsableInput,
  type PromptInput,
} from "@/lib/rewrite/prompt";
import { MIN_USABLE_INPUT_CHARS } from "@/lib/rewrite/config";
import { NO_LONG_DASH_RULE, hasLongDash } from "@/lib/ai/typography";

const SOURCE = `OpenAI said on Tuesday that it would begin rolling out its new agent
platform to enterprise customers in 14 countries, starting with a limited group of
about 2,500 organisations. The company reported that early pilots cut document
handling time by 38 percent, though it declined to name the participants. Pricing
starts at 240 dollars per seat per year and the rollout completes in March 2027.`;

const base = {
  title: "OpenAI opens its agent platform to enterprises",
  source: SOURCE,
  mode: "FULL_TEXT" as const,
  publication: "Reuters",
  publishedAt: new Date("2026-08-01T00:00:00Z"),
  language: "pt-PT",
  orgContext: "A consultancy delivering AI and quality engineering for banks.",
  brandVoice: null,
  relevanceHeading: "Relevancia para a Link",
  model: "claude-sonnet-5",
};

const CLEAN_BODY = `A OpenAI abriu a sua plataforma de agentes a clientes
empresariais em 14 paises, num grupo inicial de cerca de 2.500 organizacoes. Diz que
os primeiros pilotos reduziram o tempo de tratamento documental em 38%, sem
identificar quem participou.

## Relevancia para a Link

Vale a pena acompanhar para conversas de eficiencia documental com clientes de banca.`;

const reply = (title: string, body: string) =>
  JSON.stringify({ title, body });

describe("generateRewrite, the happy path", () => {
  it("returns a piece that passed the checks, with its evidence", async () => {
    const ask: AskModel = async () => reply("A aposta empresarial da OpenAI", CLEAN_BODY);

    const result = await generateRewrite(base, ask);

    expect(result.status).toBe("GENERATED");
    if (result.status !== "GENERATED") return;

    expect(result.attempts).toBe(1);
    expect(result.check.ok).toBe(true);
    expect(result.checkSummary).toContain("passed");
    expect(result.sourceHash).toHaveLength(32);
  });

  it("checks the headline as well as the body", async () => {
    // A lifted headline is a lifted sentence, so the check sees both.
    const ask: AskModel = async () =>
      reply("it would begin rolling out its new agent platform", CLEAN_BODY);

    const result = await generateRewrite(base, ask);

    expect(result.status).toBe("REFUSED");
  });
});

describe("generateRewrite fails closed", () => {
  it("refuses a piece with an invented figure, after one retry", async () => {
    const ask = vi.fn<AskModel>(async () =>
      reply("Titulo proprio", "Os pilotos cortaram 62% do tempo em 91000 clientes.")
    );

    const result = await generateRewrite(base, ask);

    expect(result.status).toBe("REFUSED");
    if (result.status !== "REFUSED") return;

    expect(ask).toHaveBeenCalledTimes(2);
    expect(result.reason).toContain("unsupported-number");
    expect(result.check?.ok).toBe(false);
  });

  it("tells the second attempt exactly what was wrong", async () => {
    const prompts: string[] = [];
    const ask: AskModel = async (prompt) => {
      prompts.push(prompt);
      return reply("Titulo", "Sao 91000 clientes.");
    };

    await generateRewrite(base, ask);

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("A previous attempt was rejected");
    expect(prompts[1]).toContain("unsupported-number");
  });

  it("accepts a second attempt that fixed the problem", async () => {
    let call = 0;
    const ask: AskModel = async () => {
      call += 1;
      return call === 1
        ? reply("Titulo", "Sao 91000 clientes.")
        : reply("Titulo proprio", CLEAN_BODY);
    };

    const result = await generateRewrite(base, ask);

    expect(result.status).toBe("GENERATED");
    expect(result.attempts).toBe(2);
  });

  it("stops after the retry rather than trying forever", async () => {
    const ask = vi.fn<AskModel>(async () => reply("T", "Sao 91000 clientes."));

    await generateRewrite(base, ask);

    // Retrying against a check the model cannot satisfy is how a budget disappears.
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("refuses when the reply is not JSON at all", async () => {
    const ask: AskModel = async () => "I am afraid I cannot help with that.";

    const result = await generateRewrite(base, ask);

    expect(result.status).toBe("REFUSED");
    if (result.status !== "REFUSED") return;
    expect(result.checkSummary).toContain("no parsable reply");
  });

  it("refuses, rather than throws, when the model call fails", async () => {
    const ask: AskModel = async () => {
      throw new Error("connection reset");
    };

    const result = await generateRewrite(base, ask);

    expect(result.status).toBe("REFUSED");
    if (result.status !== "REFUSED") return;
    expect(result.reason).toContain("connection reset");
  });

  it("records a check summary on every refusal, so the row is answerable", async () => {
    const ask: AskModel = async () => reply("T", "Sao 91000 clientes.");

    const result = await generateRewrite(base, ask);

    expect(result.checkSummary.length).toBeGreaterThan(0);
  });
});

describe("generateRewrite spends nothing it does not have to", () => {
  it("refuses a source below the usable floor without calling the model", async () => {
    const ask = vi.fn<AskModel>(async () => reply("T", CLEAN_BODY));

    const result = await generateRewrite(
      { ...base, source: "OpenAI opens its platform.", mode: "EXCERPT" },
      ask
    );

    expect(ask).not.toHaveBeenCalled();
    expect(result.status).toBe("REFUSED");
    if (result.status !== "REFUSED") return;
    // A missing Link Take is honest; an invented one is a liability.
    expect(result.reason).toContain("too short");
  });

  it("attempts anything at or above the floor", async () => {
    const ask = vi.fn<AskModel>(async () => reply("Titulo", "Curto e correcto."));
    const justEnough = "a".repeat(MIN_USABLE_INPUT_CHARS);

    await generateRewrite({ ...base, source: justEnough, mode: "EXCERPT" }, ask);

    expect(ask).toHaveBeenCalledTimes(1);
  });
});

describe("parseRewriteJson", () => {
  it("reads a plain object", () => {
    expect(parseRewriteJson('{"title":"T","body":"B"}')).toEqual({
      title: "T",
      body: "B",
    });
  });

  it("reads it out of a markdown fence, which models add unprompted", () => {
    expect(parseRewriteJson('```json\n{"title":"T","body":"B"}\n```')).toEqual({
      title: "T",
      body: "B",
    });
  });

  it("reads it out of surrounding chatter", () => {
    expect(parseRewriteJson('Sure! {"title":"T","body":"B"} Hope that helps.')).toEqual({
      title: "T",
      body: "B",
    });
  });

  it("rejects a missing field", () => {
    expect(parseRewriteJson('{"title":"T"}')).toBeNull();
  });

  it("rejects an empty field, which would store a blank piece", () => {
    expect(parseRewriteJson('{"title":"","body":"B"}')).toBeNull();
    expect(parseRewriteJson('{"title":"T","body":"   "}')).toBeNull();
  });

  it("rejects prose", () => {
    expect(parseRewriteJson("I cannot do that.")).toBeNull();
    expect(parseRewriteJson("")).toBeNull();
  });

  it("rejects broken JSON", () => {
    expect(parseRewriteJson('{"title":"T","body":')).toBeNull();
  });
});

describe("hashSource and isStale", () => {
  it("is stable and ignores surrounding whitespace", () => {
    expect(hashSource(" text ")).toBe(hashSource("text"));
  });

  it("changes when the text changes", () => {
    expect(hashSource("a")).not.toBe(hashSource("b"));
  });

  it("is stale when the article moved on", () => {
    expect(isStale({ sourceHash: "aaa" }, "bbb")).toBe(true);
  });

  it("is not stale when they agree", () => {
    expect(isStale({ sourceHash: "aaa" }, "aaa")).toBe(false);
  });

  it("treats an unknown hash as current, not stale", () => {
    // Otherwise every row written before hashing existed would regenerate the whole
    // corpus on first read.
    expect(isStale({ sourceHash: null }, "bbb")).toBe(false);
    expect(isStale({ sourceHash: "aaa" }, null)).toBe(false);
  });
});

describe("the prompt carries the rules", () => {
  const input: PromptInput = { ...base, source: SOURCE };

  it("states every hard rule", () => {
    const prompt = buildRewritePrompt(input);

    expect(prompt).toContain("eight or more consecutive words");
    expect(prompt).toContain("under fifteen words");
    expect(prompt).toContain("must already appear in the text");
    expect(prompt).toContain("never refer to any image");
    expect(prompt).toContain("Do not fabricate publication details");
  });

  it("tells the model it will be checked, which is true", () => {
    expect(buildRewritePrompt(input)).toContain("checked mechanically");
  });

  it("asks for a word range in full text mode", () => {
    expect(buildRewritePrompt(input)).toContain("150 to 250 words");
  });

  it("removes the floor in excerpt mode and makes relevance optional", () => {
    // Review F1: a word floor over an excerpt is an instruction to invent, and format
    // instructions beat soft guidance in practice.
    const prompt = buildRewritePrompt({ ...input, mode: "EXCERPT" });

    expect(prompt).not.toContain("150 to 250 words");
    expect(prompt).toContain("There is no minimum");
    expect(prompt).toContain("Omit that section entirely");
  });

  it("uses the organization's own heading, never a hardcoded one", () => {
    const prompt = buildRewritePrompt({
      ...input,
      relevanceHeading: "Why this matters to Acme",
    });

    expect(prompt).toContain("Why this matters to Acme");
    expect(prompt).not.toContain("Relevancia para a Link");
  });

  it("does not invite invention when no organization context is configured", () => {
    const prompt = buildRewritePrompt({ ...input, orgContext: null });

    expect(prompt).toContain("Do not invent facts");
  });

  it("gives the publication and date as facts", () => {
    const prompt = buildRewritePrompt(input);

    expect(prompt).toContain("SOURCE PUBLICATION: Reuters");
    expect(prompt).toContain("SOURCE DATE: 2026-08-01");
  });

  it("says the date is unknown rather than inventing one", () => {
    expect(buildRewritePrompt({ ...input, publishedAt: null })).toContain(
      "SOURCE DATE: unknown"
    );
  });

  it("names the failures on a retry", () => {
    const retry = buildRetryPrompt(input, [
      { code: "verbatim", detail: "eight words reproduced" },
    ]);

    expect(retry).toContain("verbatim: eight words reproduced");
    expect(retry).toContain("Do not add anything new");
  });

  it("carries the house dash rule, and does not break it while asking", () => {
    const prompt = buildRewritePrompt(input);

    expect(prompt).toContain(NO_LONG_DASH_RULE);
    expect(hasLongDash(prompt)).toBe(false);
  });
});

/**
 * The editor's per-attempt instruction.
 *
 * The assertions worth having are the two that would go wrong quietly: that it is absent
 * when nobody typed one, and that it is fenced and subordinate rather than pasted among
 * the hard rules, where "write 800 words quoting paragraph three" would read as the
 * latest word on the length and the copying.
 */
describe("the prompt carries one editor's instruction", () => {
  const input: PromptInput = { ...base, source: SOURCE };

  it("says nothing about an instruction when there is none", () => {
    for (const value of [undefined, null, "   "]) {
      const prompt = buildRewritePrompt({ ...input, instruction: value });
      expect(prompt).not.toContain("THE EDITOR ASKED");
    }
  });

  it("quotes the instruction and keeps the hard rules above it", () => {
    const prompt = buildRewritePrompt({
      ...input,
      instruction: "Shorter, and lead on the compliance angle.",
    });

    expect(prompt).toContain("Shorter, and lead on the compliance angle.");
    expect(prompt).toContain("THE EDITOR ASKED FOR THIS VERSION SPECIFICALLY");
    expect(prompt).toContain("The hard rules ");

    // Subordinate means positioned after them, not merely described as subordinate.
    expect(prompt.indexOf("HARD RULES:")).toBeLessThan(
      prompt.indexOf("THE EDITOR ASKED")
    );
  });

  it("carries the instruction into the retry as well", () => {
    const retry = buildRetryPrompt(
      { ...input, instruction: "Drop the vendor's own numbers." },
      [{ code: "figures", detail: "240 dollars is not in the source" }]
    );

    expect(retry).toContain("Drop the vendor's own numbers.");
  });
});

/**
 * The house rule, enforced rather than requested.
 *
 * `stripLongDashes` runs inside `parseRewriteJson`, which is the single funnel every
 * attempt goes through, so it is upstream of the checks: what gets compared to the source
 * and what gets stored are the same text.
 */
describe("no long dash survives generation", () => {
  it("cleans the title and the body of a reply that ignored rule 7", async () => {
    const dashed = CLEAN_BODY.replace(
      "num grupo inicial",
      "— num grupo inicial —"
    );

    const ask: AskModel = async () =>
      reply("A aposta empresarial da OpenAI — e o que custa", dashed);

    const result = await generateRewrite(base, ask);

    expect(result.status).toBe("GENERATED");
    if (result.status !== "GENERATED") return;

    expect(hasLongDash(result.title)).toBe(false);
    expect(hasLongDash(result.body)).toBe(false);
    expect(result.title).toContain("OpenAI - e o que custa");
    // Still one piece of prose: the pass must not have eaten the paragraph break before
    // the relevance heading.
    expect(result.body).toContain("\n\n## Relevancia para a Link");
  });

  it("cleans it in parseRewriteJson, so the checks see the final text", () => {
    const parsed = parseRewriteJson(
      JSON.stringify({ title: "a — b", body: "c — d" })
    );

    expect(parsed).toEqual({ title: "a - b", body: "c - d" });
  });
});

describe("hasUsableInput", () => {
  it("rejects an empty or tiny source", () => {
    expect(hasUsableInput("")).toBe(false);
    expect(hasUsableInput("   ")).toBe(false);
    expect(hasUsableInput("Short headline only.")).toBe(false);
  });

  it("accepts exactly the floor", () => {
    expect(hasUsableInput("a".repeat(MIN_USABLE_INPUT_CHARS))).toBe(true);
  });

  it("does not count surrounding whitespace towards the floor", () => {
    const padded = `   ${"a".repeat(MIN_USABLE_INPUT_CHARS - 1)}   `;
    expect(hasUsableInput(padded)).toBe(false);
  });
});
