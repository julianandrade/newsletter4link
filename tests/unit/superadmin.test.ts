import { describe, expect, it } from "vitest";
import {
  isSuperAdmin,
  parseSuperAdminEmails,
} from "@/lib/auth/superadmin";

/**
 * The environment is passed in rather than mutated, because `process.env` is shared across
 * everything in a Vitest worker and a test that sets it leaks into whatever runs next.
 */
const withList = (SUPERADMIN_EMAILS: string) => ({ SUPERADMIN_EMAILS });

describe("parseSuperAdminEmails", () => {
  it("splits, trims and lowercases", () => {
    expect(parseSuperAdminEmails(" A@Link.com , b@link.com ")).toEqual([
      "a@link.com",
      "b@link.com",
    ]);
  });

  it("drops empty entries so a trailing comma adds nobody", () => {
    expect(parseSuperAdminEmails("a@link.com,")).toEqual(["a@link.com"]);
    expect(parseSuperAdminEmails(",")).toEqual([]);
    expect(parseSuperAdminEmails(",,  ,")).toEqual([]);
  });

  it("treats absent and blank as an empty list", () => {
    expect(parseSuperAdminEmails(undefined)).toEqual([]);
    expect(parseSuperAdminEmails(null)).toEqual([]);
    expect(parseSuperAdminEmails("")).toEqual([]);
    expect(parseSuperAdminEmails("   ")).toEqual([]);
  });
});

describe("isSuperAdmin", () => {
  const env = withList("julian.andrade@linkconsulting.com,ops@linkroad.com");

  it("accepts an allowlisted address", () => {
    expect(isSuperAdmin("julian.andrade@linkconsulting.com", env)).toBe(true);
    expect(isSuperAdmin("ops@linkroad.com", env)).toBe(true);
  });

  it("refuses an address that is not on the list", () => {
    expect(isSuperAdmin("someone.else@linkconsulting.com", env)).toBe(false);
  });

  it("ignores case and surrounding whitespace on both sides", () => {
    expect(isSuperAdmin("  Julian.Andrade@LinkConsulting.com  ", env)).toBe(true);
    expect(
      isSuperAdmin("julian.andrade@linkconsulting.com", withList("JULIAN.ANDRADE@LINKCONSULTING.COM"))
    ).toBe(true);
  });

  /**
   * The failure that matters. A capability that silently opens is worse than one that
   * silently disappears, so every unusable configuration means nobody.
   */
  it("fails closed when the list is unset, empty or blank", () => {
    expect(isSuperAdmin("julian.andrade@linkconsulting.com", {})).toBe(false);
    expect(isSuperAdmin("julian.andrade@linkconsulting.com", withList(""))).toBe(false);
    expect(isSuperAdmin("julian.andrade@linkconsulting.com", withList("   "))).toBe(false);
    expect(isSuperAdmin("julian.andrade@linkconsulting.com", withList(","))).toBe(false);
  });

  it("refuses a missing email even when the list is populated", () => {
    expect(isSuperAdmin(null, env)).toBe(false);
    expect(isSuperAdmin(undefined, env)).toBe(false);
    expect(isSuperAdmin("", env)).toBe(false);
  });

  /**
   * An empty entry must never match an empty email. Without the filter in
   * parseSuperAdminEmails, `SUPERADMIN_EMAILS=","` would make `""` a superadmin.
   */
  it("does not let a blank entry match a blank email", () => {
    expect(isSuperAdmin("", withList("a@link.com,"))).toBe(false);
    expect(isSuperAdmin("   ", withList("a@link.com,,"))).toBe(false);
  });
});
