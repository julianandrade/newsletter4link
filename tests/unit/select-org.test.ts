import { describe, expect, it } from "vitest";
import { resolveSelectedOrg } from "@/lib/auth/select-org";

const org = (id: string) => ({ organization: { id }, membership: { role: "OWNER" } });

const a = org("org-a");
const b = org("org-b");

describe("resolveSelectedOrg", () => {
  it("honours a cookie that names an available organization", () => {
    expect(resolveSelectedOrg([a, b], "org-b")).toEqual({
      selected: b,
      rewriteCookie: false,
    });
  });

  it("takes the first organization when there is no cookie, and writes nothing", () => {
    expect(resolveSelectedOrg([a, b], null)).toEqual({
      selected: a,
      rewriteCookie: false,
    });
    expect(resolveSelectedOrg([a, b], undefined).rewriteCookie).toBe(false);
    expect(resolveSelectedOrg([a, b], "").rewriteCookie).toBe(false);
  });

  /**
   * The case archiving introduced. Before this existed, a cookie pointing at an archived
   * organization left currentOrg null and the user saw "Unauthorized: No organization
   * selected" on a screen that worked a second earlier.
   */
  it("falls forward and corrects the cookie when it names something unavailable", () => {
    expect(resolveSelectedOrg([a], "org-b")).toEqual({
      selected: a,
      rewriteCookie: true,
    });
  });

  it("returns nothing selected when the user has no organizations", () => {
    expect(resolveSelectedOrg([], "org-a")).toEqual({
      selected: null,
      rewriteCookie: false,
    });
    expect(resolveSelectedOrg([], null)).toEqual({
      selected: null,
      rewriteCookie: false,
    });
  });

  /**
   * Deliberate: the cookie is left alone rather than cleared, so a restored organization
   * returns the user to where they were instead of to an arbitrary first entry.
   */
  it("leaves the cookie alone when there is nothing to select", () => {
    expect(resolveSelectedOrg([], "org-archived").rewriteCookie).toBe(false);
  });

  it("does not mutate the list it is given", () => {
    const list = [a, b];
    resolveSelectedOrg(list, "org-b");
    expect(list).toEqual([a, b]);
  });
});
