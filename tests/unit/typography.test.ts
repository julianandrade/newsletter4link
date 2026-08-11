import { describe, expect, it } from "vitest";
import {
  NO_LONG_DASH_RULE,
  hasLongDash,
  stripLongDashes,
  stripLongDashesFrom,
} from "@/lib/ai/typography";

/**
 * The rule that every prose prompt carries, and the pass that makes it true.
 *
 * The cases here are the ones that made the naive version wrong: a range closed up, a
 * signed number, a dash used as a bullet, and a dash at the end of a line, which a `\s*`
 * pattern turned into a joined paragraph.
 */

describe("stripLongDashes", () => {
  it("replaces a spaced em dash with a spaced hyphen", () => {
    expect(stripLongDashes("um aviso — e um facto")).toBe(
      "um aviso - e um facto"
    );
  });

  it("handles every dash wider than a hyphen", () => {
    for (const character of ["‒", "–", "—", "―", "−"]) {
      const output = stripLongDashes(`antes ${character} depois`);
      expect(output).toBe("antes - depois");
      expect(hasLongDash(output)).toBe(false);
    }
  });

  it("closes up a range instead of spacing it out", () => {
    expect(stripLongDashes("2020–2024")).toBe("2020-2024");
    expect(stripLongDashes("de 2020 — 2024")).toBe("de 2020-2024");
  });

  it("keeps a signed number a signed number", () => {
    expect(stripLongDashes("desceu −5 pontos")).toBe("desceu -5 pontos");
  });

  it("treats a dash opening a line as the bullet it was meant to be", () => {
    expect(stripLongDashes("— um item\n— outro item")).toBe(
      "- um item\n- outro item"
    );
  });

  it("never joins two paragraphs", () => {
    expect(stripLongDashes("fim da frase —\n\nnovo parágrafo")).toBe(
      "fim da frase -\n\nnovo parágrafo"
    );
  });

  it("closes up a dash with no space around it", () => {
    expect(stripLongDashes("palavra—palavra")).toBe("palavra - palavra");
  });

  it("leaves a hyphen and a double hyphen alone", () => {
    // The double hyphen stays: `--force` in a story about tooling is not a dash.
    const text = "duas infraestruturas - uma variável, com --force";
    expect(stripLongDashes(text)).toBe(text);
  });

  it("is idempotent and safe on nothing", () => {
    const once = stripLongDashes("a — b – c");
    expect(stripLongDashes(once)).toBe(once);
    expect(stripLongDashes("")).toBe("");
  });

  it("does the same to every line of a list", () => {
    expect(stripLongDashesFrom(["a — b", "c"])).toEqual(["a - b", "c"]);
  });
});

describe("NO_LONG_DASH_RULE", () => {
  it("does not itself contain a long dash", () => {
    expect(hasLongDash(NO_LONG_DASH_RULE)).toBe(false);
  });

  it("names the substitutes, so the model has somewhere to go", () => {
    expect(NO_LONG_DASH_RULE).toMatch(/comma/);
    expect(NO_LONG_DASH_RULE).toMatch(/hyphen/);
    expect(NO_LONG_DASH_RULE).toMatch(/colon/);
  });
});
