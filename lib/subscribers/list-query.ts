import { Prisma } from "@prisma/client";
import { parseSort } from "@/lib/list-sort";
import { parseListPage, type ListPage } from "@/lib/list-page";

/** The columns the subscribers table draws. `variant` orders by language then style. */
export const SUBSCRIBER_SORT_FIELDS = [
  "email",
  "name",
  "variant",
  "active",
  "createdAt",
] as const;

export interface SubscriberListArgs {
  where: Prisma.SubscriberWhereInput;
  orderBy: Prisma.SubscriberOrderByWithRelationInput[];
  sort: ReturnType<typeof parseSort>;
  page: ListPage;
  /** The caller wants every matching id rather than a page of subscribers. */
  idsOnly: boolean;
}

/**
 * What the list route asks the database, read out of the query string.
 *
 * Lifted out of the route so the rules can be tested without a database, and because one of
 * them is load-bearing well beyond this screen: a request that names no page is not paged,
 * because the edition builder asks this route for its recipients with no parameters at all.
 */
export function subscriberListArgs(params: URLSearchParams): SubscriberListArgs {
  const showAll = params.get("all") === "true";
  const search = params.get("search")?.trim();

  const where: Prisma.SubscriberWhereInput = {};
  if (!showAll) where.active = true;
  if (search) {
    where.OR = [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  const sort = parseSort(params, SUBSCRIBER_SORT_FIELDS, {
    field: "createdAt",
    direction: "desc",
  });

  // Email is the second key because it is the only column guaranteed to be distinct: two
  // people with no name and the same variant would otherwise swap places between loads.
  const orderBy: Prisma.SubscriberOrderByWithRelationInput[] =
    sort.field === "variant"
      ? [
          { preferredLanguage: sort.direction },
          { preferredStyle: sort.direction },
          { email: "asc" },
        ]
      : sort.field === "email"
        ? [{ email: sort.direction }]
        : [
            // A subscriber with no name goes to the end of the column rather than to the
            // top of it, matching how every other list here treats a missing value.
            sort.field === "name"
              ? { name: { sort: sort.direction, nulls: "last" } }
              : { [sort.field]: sort.direction },
            { email: "asc" },
          ];

  return {
    where,
    orderBy,
    sort,
    page: parseListPage(params),
    idsOnly: params.get("idsOnly") === "true",
  };
}
