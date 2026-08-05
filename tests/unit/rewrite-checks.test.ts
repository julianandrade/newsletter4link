import { describe, expect, it } from "vitest";
import {
  checkRewrite,
  countWords,
  DEFAULT_LIMITS,
  describeCheck,
  extractNumbers,
  findLongQuotes,
  findUnsupportedNumbers,
  findVerbatimRun,
  longestSharedRun,
  shingles,
  words,
} from "@/lib/rewrite/checks";

/**
 * RQ-006_01's gate: the checks must provably reject a planted verbatim sentence and
 * a planted invented number. Those two are the first tests in the file.
 */

const SOURCE = `OpenAI said on Tuesday that it would begin rolling out its new agent
platform to enterprise customers in 14 countries, starting with a limited group of
about 2,500 organisations. The company reported that early pilots cut document
handling time by 38 percent, though it declined to name the participants. Pricing
starts at 240 dollars per seat per year and the rollout completes in March 2027.
Rivals including Anthropic and Google have announced comparable products in the
past six months.`;

describe("the gate: a planted verbatim sentence is rejected", () => {
  it("catches a lifted clause of eight words", () => {
    const output = `A OpenAI vai alargar a sua plataforma de agentes. The company
      reported that early pilots cut document handling time, o que interessa a quem
      faz gestao documental.`;

    const result = checkRewrite({ source: SOURCE, output });

    expect(result.ok).toBe(false);
    expect(result.failures.map((failure) => failure.code)).toContain("verbatim");
    expect(result.failures[0].detail).toContain("early pilots cut document");
  });

  it("still catches it when the punctuation is changed", () => {
    // A lifted clause with a comma moved is still a lifted clause, so punctuation
    // cannot be part of the identity of a phrase.
    const output = `Nota: it would begin rolling out its new agent platform, to
      enterprise customers.`;

    const result = checkRewrite({ source: SOURCE, output });

    expect(result.failures.map((f) => f.code)).toContain("verbatim");
  });

  it("still catches it when the case is changed", () => {
    const output = "IT WOULD BEGIN ROLLING OUT ITS NEW AGENT PLATFORM to clients.";

    expect(findVerbatimRun(SOURCE, output, 8)).not.toBeNull();
  });

  it("does not fire on ordinary shared phrasing under the limit", () => {
    // Seven words in common is normal writing, not reproduction.
    const output = `A empresa diz que os pilotos iniciais reduziram tempo. The company
      reported that early pilots cut tempo.`;

    expect(findVerbatimRun(SOURCE, output, 8)).toBeNull();
  });

  it("reports the longest shared run even when it passes", () => {
    const output = "A OpenAI abre a plataforma de agentes a clientes empresariais.";

    const result = checkRewrite({ source: SOURCE, output });

    // The evidence is the number, not the verdict: a piece whose longest shared run
    // is short is demonstrably not a reproduction.
    expect(result.ok).toBe(true);
    expect(result.stats.longestSharedRun).toBeLessThan(DEFAULT_LIMITS.shingleSize);
  });
});

describe("the gate: a planted invented number is rejected", () => {
  it("catches a figure that is not in the source", () => {
    const output = `A OpenAI abre a plataforma a clientes em 14 paises, com cerca de
      2.500 organizacoes, e diz que os pilotos cortaram 62 por cento do tempo.`;

    const result = checkRewrite({ source: SOURCE, output });

    expect(result.ok).toBe(false);
    const failure = result.failures.find((f) => f.code === "unsupported-number");
    expect(failure?.detail).toContain("62");
  });

  it("accepts every figure that is in the source, in either notation", () => {
    // 2,500 in the source and 2.500 in a Portuguese rewrite are the same number, and
    // "38 percent" supports "38%".
    const output = `Sao 14 paises e cerca de 2.500 organizacoes. Os pilotos cortaram
      38% do tempo de tratamento documental. O preco comeca em 240 dolares e termina
      em marco de 2027.`;

    const result = checkRewrite({ source: SOURCE, output });

    expect(result.failures.find((f) => f.code === "unsupported-number")).toBeUndefined();
  });

  it("catches a year that was never mentioned", () => {
    const output = "A plataforma fica completa em 2028, segundo a empresa.";

    const result = checkRewrite({ source: SOURCE, output });

    expect(result.failures.find((f) => f.code === "unsupported-number")?.detail).toContain(
      "2028"
    );
  });

  it("lets small counting numbers through, because prose contains them", () => {
    // "three of the five", "two years": ordinary writing, not a copied quantity.
    const output = "Dois dos tres concorrentes ja anunciaram produtos parecidos.";

    expect(findUnsupportedNumbers(SOURCE, output)).toEqual([]);
  });

  it("does not let a large invented number through as if it were prose", () => {
    expect(findUnsupportedNumbers(SOURCE, "Sao 90000 clientes.")).toEqual(["90000"]);
  });
});

describe("extractNumbers", () => {
  it("drops thousands separators", () => {
    expect(extractNumbers("2,500 and 1.250.000")).toEqual(["2500", "1250000"]);
  });

  it("drops every separator in a multi-group figure, not just the first", () => {
    // A single pass turned 1.250.000 into 1250, which is the kind of error that
    // silently passes an invented figure as a supported one.
    expect(extractNumbers("1.250.000")).toEqual(["1250000"]);
    expect(extractNumbers("1,250,000")).toEqual(["1250000"]);
  });

  it("reads a grouped figure with a decimal tail", () => {
    expect(extractNumbers("1.250.000,75")).toEqual(["1250000.75"]);
    expect(extractNumbers("1,250,000.75")).toEqual(["1250000.75"]);
  });

  it("keeps a decimal, in either notation", () => {
    expect(extractNumbers("1,5 million")).toEqual(["1.5"]);
    expect(extractNumbers("1.5 million")).toEqual(["1.5"]);
  });

  it("ignores a symbol next to the figure", () => {
    expect(extractNumbers("38% and $240 and 240 dollars")).toEqual(["38", "240", "240"]);
  });

  it("does not swallow a sentence-ending full stop", () => {
    expect(extractNumbers("completes in March 2027. Rivals")).toEqual(["2027"]);
  });

  it("reads both ends of a range", () => {
    expect(extractNumbers("150 to 250 words")).toEqual(["150", "250"]);
  });

  it("finds nothing in prose without figures", () => {
    expect(extractNumbers("A empresa nao revelou os participantes.")).toEqual([]);
  });
});

describe("findLongQuotes", () => {
  it("allows a short quote", () => {
    const text = 'A empresa diz que houve "ganhos claros" nos pilotos.';
    expect(findLongQuotes(text, 15)).toEqual([]);
  });

  it("catches a quote over the limit", () => {
    const long =
      '"early pilots cut document handling time by thirty eight percent although the company declined to name any of the participants involved"';

    expect(findLongQuotes(long, 15)).toHaveLength(1);
  });

  it("reads curly and angle quotes, because the output language varies", () => {
    const curly = "“one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen”";
    const angle = "«one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen»";

    expect(findLongQuotes(curly, 15)).toHaveLength(1);
    expect(findLongQuotes(angle, 15)).toHaveLength(1);
  });

  it("counts each long quote separately", () => {
    const sixteen = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen";
    expect(findLongQuotes(`"${sixteen}" e depois "${sixteen}"`, 15)).toHaveLength(2);
  });
});

describe("the word cap", () => {
  it("rejects a body over the hard cap", () => {
    const output = Array.from({ length: 301 }, () => "palavra").join(" ");

    const result = checkRewrite({ source: SOURCE, output });

    expect(result.failures.find((f) => f.code === "too-long")?.detail).toContain("301");
  });

  it("accepts a body at the cap", () => {
    const output = Array.from({ length: 300 }, () => "palavra").join(" ");

    expect(checkRewrite({ source: SOURCE, output }).ok).toBe(true);
  });

  it("has no floor, because an excerpt cannot support one", () => {
    // RQ-006 F1: asking for 150 words from a 40-word excerpt is asking the model to
    // invent, so a valid rewrite may be very short.
    const result = checkRewrite({
      source: "OpenAI opens its agent platform to enterprise customers.",
      output: "A OpenAI abriu a plataforma de agentes a empresas.",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects an empty body", () => {
    const result = checkRewrite({ source: SOURCE, output: "   " });

    expect(result.ok).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain("empty");
  });
});

describe("words and shingles", () => {
  it("strips accents, so a Portuguese rewrite compares against an English source", () => {
    expect(words("gestão documental")).toEqual(["gestao", "documental"]);
    expect(words("Relevância")).toEqual(["relevancia"]);
  });

  it("keeps digits, since figures are compared too", () => {
    expect(words("cerca de 2500 clientes")).toEqual(["cerca", "de", "2500", "clientes"]);
  });

  it("produces one shingle per starting position", () => {
    expect(shingles("one two three four", 2)).toEqual([
      "one two",
      "two three",
      "three four",
    ]);
  });

  it("produces nothing when the text is shorter than the window", () => {
    expect(shingles("one two", 8)).toEqual([]);
  });

  it("counts words without punctuation", () => {
    expect(countWords("Um, dois; tres.")).toBe(3);
  });
});

describe("longestSharedRun", () => {
  it("is zero when nothing is shared", () => {
    expect(longestSharedRun("alpha beta", "gamma delta")).toBe(0);
  });

  it("is zero against an empty text", () => {
    expect(longestSharedRun("", "gamma")).toBe(0);
    expect(longestSharedRun("alpha", "")).toBe(0);
  });

  it("finds a run in the middle of both texts", () => {
    expect(
      longestSharedRun("aa bb one two three cc", "dd one two three ee")
    ).toBe(3);
  });

  it("finds the whole text when it is reproduced entirely", () => {
    expect(longestSharedRun("one two three", "one two three")).toBe(3);
  });
});

describe("checkRewrite", () => {
  it("passes a rewrite that says less, differently", () => {
    const output = `A OpenAI abriu a sua plataforma de agentes a clientes
      empresariais em 14 paises, para um grupo inicial de cerca de 2.500
      organizacoes. Diz que os primeiros pilotos reduziram o tempo de tratamento
      documental em 38%, sem identificar quem participou.`;

    const result = checkRewrite({ source: SOURCE, output });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports every failure at once rather than the first", () => {
    const output = `it would begin rolling out its new agent platform to enterprise
      customers, e sao 91000 clientes.`;

    const result = checkRewrite({ source: SOURCE, output });

    const codes = result.failures.map((f) => f.code);
    expect(codes).toContain("verbatim");
    expect(codes).toContain("unsupported-number");
  });

  it("has no warning state: any failure is a failure", () => {
    const output = "Sao 91000 clientes.";
    const result = checkRewrite({ source: SOURCE, output });

    // With no guaranteed human read, a warning is a failure that shipped.
    expect(result.ok).toBe(false);
  });

  it("takes limits from the caller", () => {
    const output = "The company reported that early pilots cut";

    expect(checkRewrite({ source: SOURCE, output, limits: { shingleSize: 8 } }).ok).toBe(
      true
    );
    expect(checkRewrite({ source: SOURCE, output, limits: { shingleSize: 5 } }).ok).toBe(
      false
    );
  });

  it("describes itself in one line, for the record", () => {
    const passing = checkRewrite({
      source: SOURCE,
      output: "A OpenAI abriu a plataforma a empresas.",
    });
    expect(describeCheck(passing)).toContain("passed");

    const failing = checkRewrite({ source: SOURCE, output: "Sao 91000 clientes." });
    expect(describeCheck(failing)).toContain("unsupported-number");
  });
});
