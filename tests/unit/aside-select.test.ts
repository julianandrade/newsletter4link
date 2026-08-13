import { describe, expect, it } from "vitest";
import { asidePickerQuery, toEmailAside } from "@/lib/asides/select";

describe("asidePickerQuery", () => {
  it("offers only approved, reusable rows in the asked-for kind", () => {
    const query = asidePickerQuery({ kind: "JOKE" });

    expect(query.where).toEqual({
      status: "APPROVED",
      reusable: true,
      kind: "JOKE",
    });
  });

  /**
   * The filter this deliberately does not have.
   *
   * Language used to be in the where clause, and it excluded rather than narrowed: an aside
   * written in anything but the hardcoded "pt-PT" was stored, listed in the library, and
   * never once offered on the send screen, with nothing saying why. An aside goes into an
   * edition whatever language it is written in.
   */
  it("does not filter by language, so any language is offerable", () => {
    expect(asidePickerQuery({ kind: "JOKE" }).where).not.toHaveProperty("language");
  });

  it("puts the never-used first, then the least recently used", () => {
    // nulls first is the point. Postgres sorts nulls last on an ascending order, so
    // without it a joke that has never gone out would be offered after one that went
    // out a year ago, which is backwards.
    const query = asidePickerQuery({ kind: "JOKE" });

    expect(query.orderBy).toEqual([
      { lastUsedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
    ]);
  });

  it("never offers a pending suggestion", () => {
    expect(asidePickerQuery({ kind: "NOTE" }).where.status).toBe("APPROVED");
  });

  it("never offers a one-off written at send time", () => {
    expect(asidePickerQuery({ kind: "NOTE" }).where.reusable).toBe(true);
  });

  it("carries the kind through, so the tab decides what is listed", () => {
    expect(asidePickerQuery({ kind: "SPOTLIGHT" }).where.kind).toBe("SPOTLIGHT");
  });
});

describe("toEmailAside", () => {
  it("drops nulls, because the email type uses optional and not nullable", () => {
    expect(
      toEmailAside({
        kind: "JOKE",
        text: "A one-liner.",
        imageUrl: null,
        attribution: null,
      })
    ).toEqual({ kind: "JOKE", text: "A one-liner." });
  });

  it("carries the image and the attribution when they are set", () => {
    expect(
      toEmailAside({
        kind: "SPOTLIGHT",
        text: "The team shipped it.",
        imageUrl: "https://example.supabase.co/a.png",
        attribution: "AI practice",
      })
    ).toEqual({
      kind: "SPOTLIGHT",
      text: "The team shipped it.",
      imageUrl: "https://example.supabase.co/a.png",
      attribution: "AI practice",
    });
  });

  it("keeps the kind, which the block uses and a later design may style by", () => {
    expect(toEmailAside({ kind: "NOTE", text: "x", imageUrl: null, attribution: null }).kind).toBe(
      "NOTE"
    );
  });
});
