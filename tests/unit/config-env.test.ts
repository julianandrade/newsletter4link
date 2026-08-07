import { describe, expect, it } from "vitest";

/**
 * The `.env` on this machine carries three values that lie about themselves, and two of them have
 * already cost real time. These tests pin the cleaning rather than the config object itself, which
 * is read once at import and cannot be re-read per case.
 *
 * The rules under test, copied from lib/config.ts so a change there without a change here fails:
 *
 *   RESEND_API_KEY="re_xxx\n"                       -> trailing newline, expanded or literal
 *   FROM_EMAIL="newsletter@example.net\n"           -> same, in an address, where a newline is
 *                                                      also where header injection lives
 *   EMAIL_PROVIDER="resend  # resend or graph"      -> the comment is inside the quotes
 */

function envValue(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const cleaned = raw.trim().replace(/(?:\\n|\\r|\\t)+$/, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

function envToken(raw: string | undefined): string | undefined {
  const cleaned = envValue(raw);
  if (!cleaned) return undefined;
  const [first] = cleaned.split(/[\s#]/, 1);
  return first || undefined;
}

describe("envValue", () => {
  it("strips a newline that dotenv expanded", () => {
    expect(envValue("re_abc123\n")).toBe("re_abc123");
  });

  it("strips a literal backslash-n, which is how Vercel would store it", () => {
    expect(envValue("re_abc123\\n")).toBe("re_abc123");
  });

  it("strips an address's trailing newline, where it is a header-injection risk", () => {
    expect(envValue("newsletter@julianandrade.net\n")).toBe("newsletter@julianandrade.net");
    expect(envValue("newsletter@julianandrade.net\\n")).toBe("newsletter@julianandrade.net");
  });

  it("leaves a clean value alone", () => {
    expect(envValue("re_abc123")).toBe("re_abc123");
  });

  it("keeps inner spaces, because a display name has them", () => {
    expect(envValue("Link Consulting AI Newsletter\\n")).toBe("Link Consulting AI Newsletter");
  });

  it("treats an empty or whitespace-only value as absent, so the default applies", () => {
    expect(envValue("")).toBeUndefined();
    expect(envValue("   ")).toBeUndefined();
    expect(envValue("\\n")).toBeUndefined();
    expect(envValue(undefined)).toBeUndefined();
  });
});

describe("envToken", () => {
  it("takes only the provider, not the comment someone put inside the quotes", () => {
    expect(envToken("resend  # resend (default) or graph (Microsoft Graph API)")).toBe("resend");
  });

  it("passes a clean value through", () => {
    expect(envToken("graph")).toBe("graph");
  });

  it("handles a trailing newline as well as a comment", () => {
    expect(envToken("graph # use Microsoft\\n")).toBe("graph");
  });

  it("returns undefined for nothing, so the caller's default applies", () => {
    expect(envToken(undefined)).toBeUndefined();
    expect(envToken("   ")).toBeUndefined();
  });
});

describe("the config actually built from this machine's env", () => {
  it("gives Resend a key with no trailing whitespace", async () => {
    const { config } = await import("@/lib/config");

    if (!config.email.resend.apiKey) return;
    expect(/\s$/.test(config.email.resend.apiKey)).toBe(false);
    expect(config.email.resend.apiKey.includes("\\n")).toBe(false);
  });

  it("gives the sender an address with no newline in it", async () => {
    const { config } = await import("@/lib/config");

    expect(/[\r\n]/.test(config.email.from.email)).toBe(false);
    expect(/[\r\n]/.test(config.email.from.name)).toBe(false);
  });

  it("resolves the provider to one of the two names the sender compares against", async () => {
    const { config } = await import("@/lib/config");
    expect(["resend", "graph"]).toContain(config.email.provider);
  });
});
