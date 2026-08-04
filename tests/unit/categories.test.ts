import { describe, expect, it } from "vitest";
import {
  ARTICLE_CATEGORIES,
  MAX_CATEGORIES_PER_ARTICLE,
  parseCategories,
  promptCategoryList,
  resolveCategory,
  UNPLACED,
} from "@/lib/ai/categories";

describe("resolveCategory", () => {
  it("accepts every member of the taxonomy exactly", () => {
    for (const category of ARTICLE_CATEGORIES) {
      expect(resolveCategory(category)).toBe(category);
    }
  });

  it("forgives casing and spacing, which the model varies", () => {
    expect(resolveCategory("cloud ai")).toBe("Cloud AI");
    expect(resolveCategory("  Large   Language  Models ")).toBe(
      "Large Language Models"
    );
    expect(resolveCategory("AI REGULATION")).toBe("AI Regulation");
  });

  it("maps the few abbreviations seen in practice", () => {
    expect(resolveCategory("LLM")).toBe("Large Language Models");
    expect(resolveCategory("llms")).toBe("Large Language Models");
    expect(resolveCategory("NLP")).toBe("Natural Language Processing");
  });

  it("rejects the tail that polluted the field", () => {
    // Every one of these is a real value the unvalidated categoriser stored.
    for (const junk of [
      "2026",
      "reporting",
      "display sizes",
      "Snapdragon 8 Elite chip",
      "Samsung Galaxy S25 release",
      "phone specifications",
    ]) {
      expect(resolveCategory(junk)).toBeNull();
    }
  });

  it("does not guess at a near miss", () => {
    // A wrong category is worse than none: it puts an article inside a filter
    // somebody trusts.
    expect(resolveCategory("Artificial Intelligence")).toBeNull();
    expect(resolveCategory("AI")).toBeNull();
    expect(resolveCategory("Deep Learning")).toBeNull();
  });

  it("rejects nothing at all", () => {
    expect(resolveCategory("")).toBeNull();
    expect(resolveCategory("   ")).toBeNull();
  });
});

describe("parseCategories", () => {
  it("reads a well-formed answer", () => {
    expect(parseCategories("Large Language Models, AI Tools")).toEqual({
      categories: ["Large Language Models", "AI Tools"],
      rejected: [],
    });
  });

  it("keeps what is valid and reports what is not", () => {
    expect(
      parseCategories("Large Language Models, Snapdragon 8 Elite chip, AI Tools")
    ).toEqual({
      categories: ["Large Language Models", "AI Tools"],
      rejected: ["Snapdragon 8 Elite chip"],
    });
  });

  it("collapses a duplicate rather than spending a slot on it", () => {
    const parsed = parseCategories("LLM, Large Language Models, AI Ethics");

    expect(parsed.categories).toEqual(["Large Language Models", "AI Ethics"]);
  });

  it("caps at the maximum", () => {
    const parsed = parseCategories(
      "AI Tools, AI Ethics, AI Research, Cloud AI, Robotics"
    );

    expect(parsed.categories).toHaveLength(MAX_CATEGORIES_PER_ARTICLE);
    expect(parsed.categories).toEqual(["AI Tools", "AI Ethics", "AI Research"]);
  });

  it("returns nothing usable for prose, so the caller can fall back", () => {
    const parsed = parseCategories(
      "This article is about a new phone from Samsung"
    );

    expect(parsed.categories).toEqual([]);
    expect(parsed.rejected.length).toBeGreaterThan(0);
  });

  it("handles the NONE answer the prompt asks for", () => {
    const parsed = parseCategories("NONE");

    expect(parsed.categories).toEqual([]);
    expect(parsed.rejected).toEqual(["NONE"]);
  });

  it("survives an empty answer", () => {
    expect(parseCategories("")).toEqual({ categories: [], rejected: [] });
    expect(parseCategories(", ,")).toEqual({ categories: [], rejected: [] });
  });
});

describe("promptCategoryList", () => {
  it("offers every category except the unplaced bucket", () => {
    const list = promptCategoryList();

    for (const category of ARTICLE_CATEGORIES) {
      if (category === UNPLACED) continue;
      expect(list).toContain(`- ${category}`);
    }
  });

  it("does not offer the unplaced bucket, which would become the easy answer", () => {
    expect(promptCategoryList()).not.toContain(UNPLACED);
  });

  it("still accepts the unplaced bucket when parsing, because rows already carry it", () => {
    expect(resolveCategory(UNPLACED)).toBe(UNPLACED);
  });
});
