import { describe, expect, it } from "vitest";
import {
  BUILTIN_TEMPLATE_ID,
  builtInTemplate,
  isBuiltInTemplateId,
  resolveTemplateForBuilder,
  resolveTemplateForSend,
} from "@/lib/email/builtin-template";

/**
 * RQ-003. The AI Radar edition is code, not a stored row, so it had no entry in
 * the Templates list and its flags have to be derived. These cover the
 * derivation, because getting it wrong means the screen lies about which
 * template a send will use, which is the defect being fixed.
 */

describe("isBuiltInTemplateId", () => {
  it("recognises the reserved id and nothing else", () => {
    expect(isBuiltInTemplateId(BUILTIN_TEMPLATE_ID)).toBe(true);
    expect(isBuiltInTemplateId("clx1234567890")).toBe(false);
    expect(isBuiltInTemplateId(null)).toBe(false);
    expect(isBuiltInTemplateId(undefined)).toBe(false);
    expect(isBuiltInTemplateId("")).toBe(false);
  });

  it("uses an id no stored template can collide with", () => {
    // Stored ids are cuids, which start with a letter and carry no hyphen.
    expect(BUILTIN_TEMPLATE_ID).toContain("-");
  });
});

describe("builtInTemplate", () => {
  it("holds both flags when no stored template does", () => {
    const builtIn = builtInTemplate(false, false);
    expect(builtIn.isActive).toBe(true);
    expect(builtIn.isDefault).toBe(true);
    expect(builtIn.builtIn).toBe(true);
  });

  it("yields the active flag to a stored template that holds it", () => {
    expect(builtInTemplate(true, false).isActive).toBe(false);
  });

  it("yields the default flag independently of the active one", () => {
    // The two are separate settings: a stored template can be preselected in
    // the builder while unnamed sends still use the built-in.
    const builtIn = builtInTemplate(false, true);
    expect(builtIn.isActive).toBe(true);
    expect(builtIn.isDefault).toBe(false);
  });

  it("carries a name and a description, which is why it exists", () => {
    const builtIn = builtInTemplate(false, false);
    expect(builtIn.name).toBe("AI Radar Weekly");
    expect(builtIn.description.length).toBeGreaterThan(40);
  });
});

describe("resolveTemplateForSend", () => {
  it("returns null for the built-in when nothing is active", () => {
    expect(resolveTemplateForSend([])).toBeNull();
    expect(
      resolveTemplateForSend([
        { id: "a", isActive: false },
        { id: "b", isActive: false },
      ])
    ).toBeNull();
  });

  it("returns the active stored template", () => {
    // This is what "Use this one" now means. Before, a send that named no
    // template always used the built-in and the switch did nothing.
    expect(
      resolveTemplateForSend([
        { id: "a", isActive: false },
        { id: "b", isActive: true },
      ])
    ).toBe("b");
  });

  it("takes the first active one if the exclusivity rule were ever broken", () => {
    expect(
      resolveTemplateForSend([
        { id: "a", isActive: true },
        { id: "b", isActive: true },
      ])
    ).toBe("a");
  });
});

describe("resolveTemplateForBuilder", () => {
  it("preselects the built-in when no stored template is the default", () => {
    expect(resolveTemplateForBuilder([])).toBe(BUILTIN_TEMPLATE_ID);
    expect(
      resolveTemplateForBuilder([{ id: "a", isDefault: false }])
    ).toBe(BUILTIN_TEMPLATE_ID);
  });

  it("preselects the stored default", () => {
    expect(
      resolveTemplateForBuilder([
        { id: "a", isDefault: false },
        { id: "b", isDefault: true },
      ])
    ).toBe("b");
  });

  it("returns an id rather than null, since the builder always shows a choice", () => {
    // Unlike the send path, where null means "use the built-in renderer", the
    // picker needs something selectable.
    expect(resolveTemplateForBuilder([])).toBeTruthy();
  });
});
