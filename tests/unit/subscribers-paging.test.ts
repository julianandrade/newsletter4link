import { describe, expect, it } from "vitest";
import { subscriberListArgs } from "@/lib/subscribers/list-query";
import { projectListArgs } from "@/lib/projects/list-query";

/**
 * The route's filter and order, lifted out so the rules can be read without a database.
 *
 * The first test is the one with consequences. `app/dashboard/send/[id]/page.tsx` asks this
 * route for subscribers with no parameters and makes the recipients of an edition out of
 * the answer, so an unpaged request has to stay unpaged. Everything else here is ordinary.
 */
describe("subscriberListArgs", () => {
  it("does not page a request that asked for no page", () => {
    const args = subscriberListArgs(new URLSearchParams(""));

    expect(args.page.paged).toBe(false);
    expect(args.idsOnly).toBe(false);
  });

  it("pages one that did", () => {
    const args = subscriberListArgs(new URLSearchParams("page=3&pageSize=25"));

    expect(args.page.paged).toBe(true);
    expect(args.page.page).toBe(3);
    expect(args.page.pageSize).toBe(25);
  });

  it("shows active subscribers only, unless all is asked for", () => {
    expect(subscriberListArgs(new URLSearchParams("")).where).toEqual({ active: true });
    expect(subscriberListArgs(new URLSearchParams("all=true")).where).toEqual({});
  });

  it("searches the email and the name together", () => {
    const { where } = subscriberListArgs(new URLSearchParams("search=ana&all=true"));

    expect(where.OR).toEqual([
      { email: { contains: "ana", mode: "insensitive" } },
      { name: { contains: "ana", mode: "insensitive" } },
    ]);
  });

  it("orders a variant by both of the columns behind it", () => {
    const { orderBy } = subscriberListArgs(
      new URLSearchParams("sortBy=variant&sortOrder=asc")
    );

    expect(orderBy).toEqual([
      { preferredLanguage: "asc" },
      { preferredStyle: "asc" },
      { email: "asc" },
    ]);
  });

  it("sends a subscriber with no name to the end of the column", () => {
    const { orderBy } = subscriberListArgs(
      new URLSearchParams("sortBy=name&sortOrder=asc")
    );

    expect(orderBy[0]).toEqual({ name: { sort: "asc", nulls: "last" } });
  });

  it("breaks every tie on email, the one column guaranteed distinct", () => {
    const { orderBy } = subscriberListArgs(
      new URLSearchParams("sortBy=createdAt&sortOrder=desc")
    );

    expect(orderBy[orderBy.length - 1]).toEqual({ email: "asc" });
  });

  it("reads idsOnly, for a selection that means the whole filter", () => {
    expect(subscriberListArgs(new URLSearchParams("idsOnly=true")).idsOnly).toBe(true);
    expect(subscriberListArgs(new URLSearchParams("idsOnly=yes")).idsOnly).toBe(false);
  });
});

/**
 * The same shape for projects. Two list routes that disagree about what an absent `page`
 * means is how the next caller gets it wrong, so they agree.
 */
describe("projectListArgs", () => {
  it("does not page a request that asked for no page", () => {
    expect(projectListArgs(new URLSearchParams("")).page.paged).toBe(false);
  });

  it("pages one that did", () => {
    const args = projectListArgs(new URLSearchParams("page=2&pageSize=100"));

    expect(args.page.paged).toBe(true);
    expect(args.page.page).toBe(2);
    expect(args.page.pageSize).toBe(100);
  });

  it("searches the name, the description and the team", () => {
    const { where } = projectListArgs(new URLSearchParams("search=radar"));

    expect(where.OR).toHaveLength(3);
  });

  it("reads featured as three states, not two", () => {
    expect(projectListArgs(new URLSearchParams("featured=true")).where.featured).toBe(true);
    expect(projectListArgs(new URLSearchParams("featured=false")).where.featured).toBe(
      false
    );
    expect(projectListArgs(new URLSearchParams("")).where.featured).toBeUndefined();
  });

  it("includes the whole of the last named day, not its first instant", () => {
    const { where } = projectListArgs(new URLSearchParams("dateTo=2026-08-08"));
    const end = (where.projectDate as { lte: Date }).lte;

    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it("breaks every tie on name, so two identical requests agree", () => {
    const { orderBy } = projectListArgs(new URLSearchParams("sortBy=team&sortOrder=asc"));

    expect(orderBy[orderBy.length - 1]).toEqual({ name: "asc" });
  });
});
