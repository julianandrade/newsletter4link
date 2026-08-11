import { beforeAll, describe, expect, it } from "vitest";
import {
  resolveArchiveAccess,
  resolveIndexAccess,
  type ArchiveLookups,
} from "@/lib/email/archive-access";
import { generateToken, generateUnsubscribeToken } from "@/lib/email/unsubscribe-token";

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret-not-a-real-one";
});

const SUBSCRIBER = "sub_1";
const EDITION = "ed_1";
const ORG = "org_1";

function lookups(overrides: Partial<ArchiveLookups> = {}): ArchiveLookups {
  return {
    findSubscriber: async (id) =>
      id === SUBSCRIBER ? { active: true, organizationId: ORG } : null,
    wasSentTo: async (subscriberId, editionId) =>
      subscriberId === SUBSCRIBER && editionId === EDITION,
    ...overrides,
  };
}

const validToken = () => generateToken("archive", SUBSCRIBER);

describe("resolveArchiveAccess", () => {
  it("allows a subscriber who received this edition", async () => {
    const access = await resolveArchiveAccess(validToken(), EDITION, lookups());

    expect(access).toEqual({
      allowed: true,
      subscriberId: SUBSCRIBER,
      organizationId: ORG,
    });
  });

  it("refuses a request with no token", async () => {
    const access = await resolveArchiveAccess(undefined, EDITION, lookups());
    expect(access).toEqual({ allowed: false, reason: "no-token" });
  });

  it("refuses an empty token", async () => {
    const access = await resolveArchiveAccess("", EDITION, lookups());
    expect(access).toEqual({ allowed: false, reason: "no-token" });
  });

  it("refuses a tampered signature", async () => {
    const token = validToken();
    const access = await resolveArchiveAccess(token.slice(0, -2), EDITION, lookups());
    expect(access).toEqual({ allowed: false, reason: "bad-signature" });
  });

  it("refuses an unsubscribe token, which is signed for another purpose", async () => {
    const access = await resolveArchiveAccess(
      generateUnsubscribeToken(SUBSCRIBER),
      EDITION,
      lookups()
    );
    expect(access).toEqual({ allowed: false, reason: "bad-signature" });
  });

  it("refuses a token for a subscriber who no longer exists", async () => {
    const access = await resolveArchiveAccess(
      generateToken("archive", "sub_deleted"),
      EDITION,
      lookups()
    );
    expect(access).toEqual({ allowed: false, reason: "unknown-subscriber" });
  });

  it("refuses an unsubscribed subscriber", async () => {
    const access = await resolveArchiveAccess(
      validToken(),
      EDITION,
      lookups({ findSubscriber: async () => ({ active: false, organizationId: ORG }) })
    );
    expect(access).toEqual({ allowed: false, reason: "inactive-subscriber" });
  });

  it("refuses an edition this subscriber never received", async () => {
    // The token proves one subscriber, not access to every edition that exists.
    const access = await resolveArchiveAccess(validToken(), "ed_someone_elses", lookups());
    expect(access).toEqual({
      allowed: false,
      reason: "not-sent-to-this-subscriber",
    });
  });

  it("does not consult the subscriber at all when the signature fails", async () => {
    // A failed signature must not become a way to probe which subscriber ids exist.
    let consulted = false;
    await resolveArchiveAccess(
      "garbage",
      EDITION,
      lookups({
        findSubscriber: async (_id) => {
          consulted = true;
          return { active: true, organizationId: ORG };
        },
      })
    );
    expect(consulted).toBe(false);
  });

  it("returns the organization from the subscriber, so the page can scope its read", async () => {
    // Without this the page would read the edition unscoped, and a valid token from one
    // organization could open another's edition whenever a SENT event happened to exist.
    const access = await resolveArchiveAccess(
      validToken(),
      EDITION,
      lookups({ findSubscriber: async () => ({ active: true, organizationId: "org_other" }) })
    );

    expect(access.allowed && access.organizationId).toBe("org_other");
  });
});

describe("resolveIndexAccess", () => {
  it("allows a valid token without asking about any edition", async () => {
    const access = await resolveIndexAccess(validToken(), {
      findSubscriber: async () => ({ active: true, organizationId: ORG }),
    });

    expect(access).toEqual({
      allowed: true,
      subscriberId: SUBSCRIBER,
      organizationId: ORG,
    });
  });

  it("refuses no token, a bad signature and an inactive subscriber", async () => {
    const found = { findSubscriber: async () => ({ active: true, organizationId: ORG }) };

    expect(await resolveIndexAccess(undefined, found)).toEqual({
      allowed: false,
      reason: "no-token",
    });
    expect(await resolveIndexAccess("garbage", found)).toEqual({
      allowed: false,
      reason: "bad-signature",
    });
    expect(
      await resolveIndexAccess(validToken(), {
        findSubscriber: async () => ({ active: false, organizationId: ORG }),
      })
    ).toEqual({ allowed: false, reason: "inactive-subscriber" });
  });
});
