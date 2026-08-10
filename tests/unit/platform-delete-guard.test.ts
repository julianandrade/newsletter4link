import { describe, expect, it } from "vitest";
import {
  CASCADING_RELATIONS,
  canDeleteOrganization,
} from "@/lib/platform/delete-guard";

const archived = new Date("2026-08-10T09:00:00.000Z");

describe("canDeleteOrganization", () => {
  it("allows a delete of an archived organization with the slug typed exactly", () => {
    expect(
      canDeleteOrganization({
        archivedAt: archived,
        slug: "experience",
        confirmSlug: "experience",
      })
    ).toEqual({ ok: true });
  });

  /**
   * Order matters: knowing the slug is not permission to delete a live organization, so
   * the archive check has to come first or the two-step can be skipped through the API.
   */
  it("refuses a live organization with 409, even when the slug is correct", () => {
    const verdict = canDeleteOrganization({
      archivedAt: null,
      slug: "experience",
      confirmSlug: "experience",
    });

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.status).toBe(409);
    expect(verdict.reason).toBe("not-archived");
  });

  it("refuses a wrong, missing or empty slug with 400", () => {
    for (const confirmSlug of ["Experience", "experienc", "", null, undefined]) {
      const verdict = canDeleteOrganization({
        archivedAt: archived,
        slug: "experience",
        confirmSlug,
      });

      expect(verdict.ok, `confirmSlug=${JSON.stringify(confirmSlug)}`).toBe(false);
      if (verdict.ok) continue;
      expect(verdict.status).toBe(400);
      expect(verdict.reason).toBe("slug-mismatch");
    }
  });

  it("names the slug in the refusal, so the dialog can say what to type", () => {
    const verdict = canDeleteOrganization({
      archivedAt: archived,
      slug: "link-consulting",
      confirmSlug: "wrong",
    });

    if (verdict.ok) throw new Error("expected a refusal");
    expect(verdict.message).toContain("link-consulting");
  });

  it("forgives whitespace from a copy and paste but not a different case", () => {
    expect(
      canDeleteOrganization({
        archivedAt: archived,
        slug: "experience",
        confirmSlug: "  experience  ",
      })
    ).toEqual({ ok: true });

    expect(
      canDeleteOrganization({
        archivedAt: archived,
        slug: "experience",
        confirmSlug: "EXPERIENCE",
      }).ok
    ).toBe(false);
  });

  /**
   * An ISO string is what arrives when the row has been through JSON, which is how the
   * client sends it back. It must count as archived, not as live.
   */
  it("treats an ISO string archivedAt as archived", () => {
    expect(
      canDeleteOrganization({
        archivedAt: "2026-08-10T09:00:00.000Z",
        slug: "experience",
        confirmSlug: "experience",
      })
    ).toEqual({ ok: true });
  });
});

describe("CASCADING_RELATIONS", () => {
  it("covers all 19 relations that vanish with an organization", () => {
    expect(CASCADING_RELATIONS).toHaveLength(19);
    expect(new Set(CASCADING_RELATIONS).size).toBe(19);
  });

  it("leads with editions, the one that can mean mail already sent", () => {
    expect(CASCADING_RELATIONS[0]).toBe("editions");
  });
});
