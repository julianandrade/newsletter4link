import { Prisma } from "@prisma/client";
import { parseSort } from "@/lib/list-sort";
import { parseListPage, type ListPage } from "@/lib/list-page";

/** The columns the projects table draws. */
export const PROJECT_SORT_FIELDS = [
  "name",
  "team",
  "projectDate",
  "createdAt",
  "featured",
] as const;

export interface ProjectListArgs {
  where: Prisma.ProjectWhereInput;
  orderBy: Prisma.ProjectOrderByWithRelationInput[];
  sort: ReturnType<typeof parseSort>;
  page: ListPage;
  idsOnly: boolean;
}

/**
 * What the projects list route asks the database, read out of the query string.
 *
 * The same shape as `lib/subscribers/list-query.ts`, including the rule that matters: a
 * request naming no page is not paged. Projects has no caller today that depends on that
 * the way the edition builder does for subscribers, and it follows the same rule anyway,
 * because two list routes that disagree about what an absent parameter means is how the
 * next caller gets it wrong.
 */
export function projectListArgs(params: URLSearchParams): ProjectListArgs {
  const where: Prisma.ProjectWhereInput = {};

  const search = params.get("search");
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { team: { contains: search, mode: "insensitive" } },
    ];
  }

  const team = params.get("team");
  if (team) where.team = team;

  const featured = params.get("featured");
  if (featured === "true") where.featured = true;
  else if (featured === "false") where.featured = false;

  const dateFrom = params.get("dateFrom");
  const dateTo = params.get("dateTo");
  if (dateFrom || dateTo) {
    where.projectDate = {};
    if (dateFrom) where.projectDate.gte = new Date(dateFrom);
    if (dateTo) {
      // The end of the named day, not its first instant. "Delivered to 8 August"
      // excluded everything shipped on 8 August.
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.projectDate.lte = end;
    }
  }

  const sort = parseSort(params, PROJECT_SORT_FIELDS, {
    field: "createdAt",
    direction: "desc",
  });

  // `name` is the second key throughout: every other field has duplicates in a list this
  // size, so without it a team of six projects comes back in an arbitrary order that
  // changes between two identical requests.
  const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
    sort.field === "name"
      ? [{ name: sort.direction }]
      : [{ [sort.field]: sort.direction }, { name: "asc" }];

  return {
    where,
    orderBy,
    sort,
    page: parseListPage(params),
    idsOnly: params.get("idsOnly") === "true",
  };
}
