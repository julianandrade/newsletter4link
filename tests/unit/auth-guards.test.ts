import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";
import {
  ALLOWED_EMAIL_DOMAINS,
  allowedDomainsLabel,
  isAllowedEmail,
} from "@/lib/auth/allowed-domains";
import {
  isPasswordIdentity,
  isValidTotpCode,
  resolveMfaRequirement,
  verifiedTotpFactors,
} from "@/lib/auth/mfa";

function user(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    email: "someone@linkconsulting.com",
    ...overrides,
  } as User;
}

describe("isAllowedEmail", () => {
  it("accepts both permitted domains, in any case", () => {
    expect(isAllowedEmail("julian.andrade@linkconsulting.com")).toBe(true);
    expect(isAllowedEmail("Julian.Andrade@LinkConsulting.com")).toBe(true);
    expect(isAllowedEmail("someone@linkroad.com")).toBe(true);
    expect(isAllowedEmail("  someone@linkroad.com  ")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isAllowedEmail("someone@gmail.com")).toBe(false);
    expect(isAllowedEmail("someone@example.org")).toBe(false);
  });

  it("is not fooled by a domain that merely ends with a permitted one", () => {
    // The reason this is an exact match rather than endsWith.
    expect(isAllowedEmail("attacker@evil-linkroad.com")).toBe(false);
    expect(isAllowedEmail("attacker@notlinkconsulting.com")).toBe(false);
    expect(isAllowedEmail("attacker@linkroad.com.evil.net")).toBe(false);
  });

  it("rejects subdomains, which no real address here uses", () => {
    expect(isAllowedEmail("someone@mail.linkroad.com")).toBe(false);
  });

  it("rejects addresses that are not addresses", () => {
    expect(isAllowedEmail("")).toBe(false);
    expect(isAllowedEmail(null)).toBe(false);
    expect(isAllowedEmail(undefined)).toBe(false);
    expect(isAllowedEmail("linkroad.com")).toBe(false);
    expect(isAllowedEmail("@linkroad.com")).toBe(false);
    expect(isAllowedEmail("someone@")).toBe(false);
    // Two @ signs: an address like this must not slip through on a split.
    expect(isAllowedEmail("someone@evil.com@linkroad.com")).toBe(false);
  });

  it("names both domains in the copy shown to users", () => {
    const label = allowedDomainsLabel();
    for (const domain of ALLOWED_EMAIL_DOMAINS) {
      expect(label).toContain(domain);
    }
  });
});

describe("isPasswordIdentity", () => {
  it("is true for an email identity", () => {
    expect(isPasswordIdentity(user())).toBe(true);
  });

  it("is false for an Office 365 identity", () => {
    expect(
      isPasswordIdentity(
        user({ app_metadata: { provider: "azure", providers: ["azure"] } })
      )
    ).toBe(false);
  });

  it("is true when a password is linked alongside Azure", () => {
    // Such an account is still only as strong as the password, so it owes a
    // second factor even though Azure is also linked.
    expect(
      isPasswordIdentity(
        user({ app_metadata: { provider: "azure", providers: ["azure", "email"] } })
      )
    ).toBe(true);
  });

  it("falls back to the singular provider field", () => {
    expect(isPasswordIdentity(user({ app_metadata: { provider: "email" } }))).toBe(
      true
    );
  });

  it("is false for no user at all", () => {
    expect(isPasswordIdentity(null)).toBe(false);
  });
});

describe("verifiedTotpFactors", () => {
  it("ignores an enrollment that was never verified", () => {
    const withUnverified = user({
      factors: [
        { id: "f1", factor_type: "totp", status: "unverified" },
      ] as User["factors"],
    });
    expect(verifiedTotpFactors(withUnverified)).toHaveLength(0);
  });

  it("counts a verified totp factor", () => {
    const withVerified = user({
      factors: [{ id: "f1", factor_type: "totp", status: "verified" }] as User["factors"],
    });
    expect(verifiedTotpFactors(withVerified)).toHaveLength(1);
  });
});

describe("resolveMfaRequirement", () => {
  const aal1 = { currentLevel: "aal1", nextLevel: "aal1" };
  const aal1WithFactor = { currentLevel: "aal1", nextLevel: "aal2" };
  const aal2 = { currentLevel: "aal2", nextLevel: "aal2" };

  it("makes a password account with no factor enroll", () => {
    expect(resolveMfaRequirement(user(), aal1)).toEqual({ kind: "enroll" });
  });

  it("challenges a password account that has a verified factor", () => {
    const enrolled = user({
      factors: [{ id: "f1", factor_type: "totp", status: "verified" }] as User["factors"],
    });
    expect(resolveMfaRequirement(enrolled, aal1WithFactor)).toEqual({
      kind: "challenge",
    });
  });

  it("is satisfied once the session reaches aal2", () => {
    const enrolled = user({
      factors: [{ id: "f1", factor_type: "totp", status: "verified" }] as User["factors"],
    });
    expect(resolveMfaRequirement(enrolled, aal2)).toEqual({ kind: "satisfied" });
  });

  it("does not ask an Office 365 identity for a second factor", () => {
    // Entra applies the tenant's own MFA before Supabase sees the identity.
    const azure = user({ app_metadata: { provider: "azure", providers: ["azure"] } });
    expect(resolveMfaRequirement(azure, aal1)).toEqual({ kind: "satisfied" });
  });

  it("still asks an Azure account that also has a password", () => {
    const both = user({
      app_metadata: { provider: "azure", providers: ["azure", "email"] },
    });
    expect(resolveMfaRequirement(both, aal1)).toEqual({ kind: "enroll" });
  });

  it("is satisfied for no user, so the caller's own auth check decides", () => {
    expect(resolveMfaRequirement(null, null)).toEqual({ kind: "satisfied" });
  });

  it("requires enrollment when the assurance level is unavailable", () => {
    // Fail closed: a missing AAL must not read as "already stepped up".
    expect(resolveMfaRequirement(user(), null)).toEqual({ kind: "enroll" });
  });
});

describe("isValidTotpCode", () => {
  it("accepts exactly six digits", () => {
    expect(isValidTotpCode("123456")).toBe(true);
    expect(isValidTotpCode(" 123456 ")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidTotpCode("12345")).toBe(false);
    expect(isValidTotpCode("1234567")).toBe(false);
    expect(isValidTotpCode("12345a")).toBe(false);
    expect(isValidTotpCode("")).toBe(false);
  });
});
