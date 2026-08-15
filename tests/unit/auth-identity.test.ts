import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The identity seam is what makes Phase F a one-file change instead of a five-file one, so
 * the thing worth testing is that it normalises what the provider returns rather than passing
 * a vendor shape through.
 *
 * `name` is the case that matters: it exists only because one route wrote
 * `user_metadata.full_name` to `OrgUser.name` on first join. That is Supabase's own shape, and
 * a typechecker caught it after a grep did not, which is the argument for narrowing the type
 * rather than re-exporting the SDK's.
 */

const getUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

afterEach(() => {
  delete process.env.NEXT_PUBLIC_GCIP_API_KEY;
  vi.clearAllMocks();
});

describe("getCurrentIdentity", () => {
  it("returns null when there is no session, rather than throwing", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const { getCurrentIdentity } = await import("@/lib/auth/identity");
    expect(await getCurrentIdentity()).toBeNull();
  });

  it("narrows to id, email and name", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "abc",
          email: "julian.andrade@linkconsulting.com",
          user_metadata: { full_name: "Julian Andrade" },
          // Fields no caller reads. They must not leak through.
          aud: "authenticated",
          app_metadata: { provider: "azure" },
        },
      },
    });

    const { getCurrentIdentity } = await import("@/lib/auth/identity");
    const identity = await getCurrentIdentity();

    expect(identity).toEqual({
      id: "abc",
      email: "julian.andrade@linkconsulting.com",
      name: "Julian Andrade",
    });
  });

  it("treats a missing or empty full_name as no name", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "a", email: "a@b.com", user_metadata: { full_name: "" } } },
    });
    const { getCurrentIdentity } = await import("@/lib/auth/identity");
    expect((await getCurrentIdentity())?.name).toBeNull();

    getUser.mockResolvedValue({ data: { user: { id: "a", email: "a@b.com" } } });
    expect((await getCurrentIdentity())?.name).toBeNull();
  });

  it("tolerates a provider that gives no email", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "a" } } });
    const { getCurrentIdentity } = await import("@/lib/auth/identity");
    expect(await getCurrentIdentity()).toEqual({ id: "a", email: null, name: null });
  });
});

describe("identityProvider", () => {
  it("reports supabase until Identity Platform is configured", async () => {
    const { identityProvider } = await import("@/lib/auth/identity");
    expect(identityProvider()).toBe("supabase");
  });

  it("reports identity-platform once its API key is present", async () => {
    process.env.NEXT_PUBLIC_GCIP_API_KEY = "AIza-test";
    const { identityProvider } = await import("@/lib/auth/identity");
    expect(identityProvider()).toBe("identity-platform");
  });
});
