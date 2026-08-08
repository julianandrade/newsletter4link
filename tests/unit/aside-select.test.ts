import { describe, expect, it } from "vitest";
import { asidePickerQuery, toEmailAside } from "@/lib/asides/select";

describe("asidePickerQuery", () => {
  it("offers only approved, reusable rows in the asked-for kind and language", () => {
    const query = asidePickerQuery({ kind: "JOKE", language: "pt-PT" });

    expect(query.where).toEqual({
      status: "APPROVED",
      reusable: true,
      kind: "JOKE",
      language: "pt-PT",
    });
  });

  it("puts the never-used first, then the least recently used", () => {
    // nulls first is the point. Postgres sorts nulls last on an ascending order, so
    // without it a joke that has never gone out would be offered after one that went
    // out a year ago, which is backwards.
    const query = asidePickerQuery({ kind: "JOKE", language: "pt-PT" });

    expect(query.orderBy).toEqual([
      { lastUsedAt: { sort: "asc", nulls: "first" } },
      { createdAt: "asc" },
    ]);
  });

  it("never offers a pending suggestion", () => {
    const query = asidePickerQuery({ kind: "NOTE", language: "en" });

    expect(query.where.status).toBe("APPROVED");
  });

  it("never offers a one-off written at send time", () => {
    const query = asidePickerQuery({ kind: "NOTE", language: "pt-PT" });

    expect(query.where.reusable).toBe(true);
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
