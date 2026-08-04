import { describe, expect, it } from "vitest";
import { hasRoleAtLeast, isRoleName, ROLE_ORDER } from "@/lib/auth/roles";

describe("isRoleName", () => {
  it("accepts every role in the hierarchy", () => {
    for (const role of ROLE_ORDER) expect(isRoleName(role)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const value of [
      "viewer",
      "OWNER ",
      "SUPERUSER",
      "",
      null,
      undefined,
      0,
      {},
      ["OWNER"],
    ]) {
      expect(isRoleName(value)).toBe(false);
    }
  });
});

describe("hasRoleAtLeast", () => {
  it("grants a role its own level", () => {
    for (const role of ROLE_ORDER) expect(hasRoleAtLeast(role, role)).toBe(true);
  });

  it("grants everything below the role's level", () => {
    expect(hasRoleAtLeast("OWNER", "VIEWER")).toBe(true);
    expect(hasRoleAtLeast("OWNER", "EDITOR")).toBe(true);
    expect(hasRoleAtLeast("OWNER", "ADMIN")).toBe(true);
    expect(hasRoleAtLeast("ADMIN", "EDITOR")).toBe(true);
    expect(hasRoleAtLeast("EDITOR", "VIEWER")).toBe(true);
  });

  it("refuses everything above the role's level", () => {
    expect(hasRoleAtLeast("VIEWER", "EDITOR")).toBe(false);
    expect(hasRoleAtLeast("EDITOR", "ADMIN")).toBe(false);
    expect(hasRoleAtLeast("ADMIN", "OWNER")).toBe(false);
    // The one that matters for force delete: an ADMIN is not an OWNER.
    expect(hasRoleAtLeast("ADMIN", "OWNER")).toBe(false);
  });

  it("fails closed on an unknown role", () => {
    // The previous implementation compared indexOf results, so an unknown role
    // and an unknown minimum both gave -1 and `-1 >= -1` granted access.
    expect(hasRoleAtLeast("SUPERUSER", "VIEWER")).toBe(false);
    expect(hasRoleAtLeast("superuser", "OWNER")).toBe(false);
  });

  it("fails closed on an unknown minimum, which used to open the door", () => {
    expect(hasRoleAtLeast("OWNER", "EDTIOR" as never)).toBe(false);
    expect(hasRoleAtLeast("SUPERUSER", "SUPERUSER" as never)).toBe(false);
  });

  it("fails closed on an absent role", () => {
    expect(hasRoleAtLeast(null, "VIEWER")).toBe(false);
    expect(hasRoleAtLeast(undefined, "VIEWER")).toBe(false);
    expect(hasRoleAtLeast("", "VIEWER")).toBe(false);
  });

  it("is case sensitive, because the stored values are", () => {
    expect(hasRoleAtLeast("owner", "VIEWER")).toBe(false);
  });
});
