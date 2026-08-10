# Superadmin: seeing every organization, and winding one down

> Design, 10 August 2026. Brainstormed with Julian, who approved all four sections and
> then delegated the remaining calls. Decisions taken without him are recorded in
> [docs/DECISIONS-2026-08-10-superadmin.md](../../DECISIONS-2026-08-10-superadmin.md).

## The problem

A newsletter administrator cannot see organizations they were never invited to, and there
is no way to wind one down.

The cause is one line. `getUserOrganizations()` in `lib/auth/context.ts:48` reads
`prisma.orgUser.findMany({ where: { supabaseUserId } })`, so the visible set of
organizations *is* the set you hold an `OrgUser` row for. The org switcher, the
`selected_org_id` cookie validation and `requireOrgContext()` all derive from that list.
An organization nobody invited you to is invisible everywhere, by construction rather than
by oversight.

There is no platform-level concept to hang an exception on. `OrgRole` is
`OWNER | ADMIN | EDITOR | VIEWER` and every value is scoped to a single organization
through `OrgUser`. `OWNER` is commented "Full access, can delete org", but only its own.
Nothing in `lib/auth/context.ts` sits above the organization line.

## What this builds

A superadmin can list every organization, edit its record, create one, archive it,
restore it, and permanently delete an archived one. Dependent data is read as counts and
is only ever written by the cascade on delete.

Cross-organization *content* editing is explicitly out of scope. To edit another
organization's articles or subscribers you press **Grant me membership**, which writes a
real `OrgUser` row, and then use the normal dashboard. One button instead of a second copy
of the application, and the resulting access is honestly attributed in every audit trail.

## The four decisions that shape it

**Superadmin is an environment allowlist, not a role and not a row.**
`SUPERADMIN_EMAILS` is a comma-separated list, read by `isSuperAdmin(email)` in
`lib/auth/superadmin.ts`, modelled on the existing `lib/auth/allowed-domains.ts`. The
application therefore cannot grant the permission that guards the application: a database
write cannot make anyone a superadmin, and neither can a compromised session. The cost is
that changing who holds it needs a Vercel environment change and a redeploy, which for a
permission this broad is a feature.

**The tenant guard never learns superadmin exists.**
`requireOrgContext()`, `OrgContext`, `getUserOrganizations()` and `createTenantClient()`
keep their current behaviour. No synthetic membership is fabricated, `ctx.membership` stays
a row that really exists, and the switcher keeps listing only real memberships. The
rejected alternative was returning every organization from `getUserOrganizations()` for a
superadmin, which requires inventing an `OrgUser` with `role: "OWNER"` for organizations
you are not in. That fake row then flows through `requireRole()` and every audit trail in
the product, and there is no longer any way to distinguish a real owner from a visitor.

**Archive first; hard delete only what is archived.**
`Organization` cascades into 19 relations: members, invites, settings, apiKeys, articles,
projects, editions, subscribers, rssSources, curationJobs, templates, brandVoices,
mediaAssets, searchTopics, searchHistory, backgroundJobs, generationDrafts, asides,
radarWatches. A single `prisma.organization.delete()` takes all of it, including the record
of editions already delivered to real inboxes. Archiving is reversible and is the normal
action; deleting is a second, deliberate step.

**Archiving stops the automation, not just the visibility.**
An organization that is hidden but still collecting is a bill with no reader. Archiving
takes it out of the scheduled loops and, as a consequence of the same filter, out of every
organization-scoped route.

## Architecture

Three new units, each with one purpose.

### `lib/auth/superadmin.ts`

```ts
export function isSuperAdmin(email: string | null | undefined, env = process.env): boolean
```

Pure, with the environment injected, so it is unit-testable without a session. Parses
`SUPERADMIN_EMAILS` as a comma-separated list, trims, lowercases both sides, and ignores
empty entries.

**Fails closed.** An unset, empty or whitespace-only variable means nobody is a
superadmin. A misconfigured deployment locks the door rather than opening it, which is the
same choice `authorizeCron()` makes when `CRON_SECRET` is absent.

### `lib/auth/platform-context.ts`

```ts
export interface PlatformContext { supabaseUserId: string; email: string; db: PrismaClient }
export async function requirePlatformContext(): Promise<PlatformContext>
export async function getPlatformContext(): Promise<PlatformContext | null>
```

The sibling of `requireOrgContext()`. It reads the Supabase user, applies the existing
domain allowlist via `isAllowedEmail`, then checks `isSuperAdmin`. It returns the **raw**
`prisma` client rather than a `TenantClient`, because reading across tenants is the entire
purpose. `getPlatformContext()` is the non-throwing form, for the layout and for deciding
whether to render a nav entry.

Nothing outside `/dashboard/platform` and `/api/platform` calls it.

### `app/dashboard/platform/` and `app/api/platform/`

The new surface. The permission check lives in `app/dashboard/platform/layout.tsx` so no
child page can forget it, and additionally in every route handler, because a route handler
is reachable without the layout.

The layout uses the **non-throwing** `getPlatformContext()` and calls Next's `notFound()`
when it returns null, because the required answer is a 404 rather than an exception. Route
handlers use `requirePlatformContext()` and map the thrown error to a 404 in their catch.

**Not in middleware.** `middleware.ts` runs on every matched request and the check needs
the allowlist plus the session; the existing role checks are in routes and layouts for the
same reason. `/dashboard/platform` is already covered by the middleware's `/dashboard`
prefix for the session requirement.

## Data model

One nullable column on `Organization`:

```prisma
archivedAt DateTime?   // null means live

@@index([archivedAt])
```

No new table, no enum, and no status field that can disagree with `archivedAt`. Archive and
restore are the same write in opposite directions, which is why restore needs no second
endpoint, validator or test.

## Where the archived filter goes

Four call sites, all of them enumerated. This list is the security-relevant part of the
change: a missed site means an archived organization keeps working.

| File | Change |
|---|---|
| `lib/auth/context.ts:50` | `orgUser.findMany` gains `organization: { archivedAt: null }` |
| `app/api/cron/daily-collection/route.ts:43` | `organization.findMany` gains `where: { archivedAt: null }` |
| `app/api/cron/weekly-proposal/route.ts:49` | same; this one creates and finalizes editions, so it matters most |
| `lib/inbound/process.ts:138` | the cross-organization EMAIL source query excludes sources whose organization is archived |

**`radar-collect` needs no change.** `lib/radar/collect.ts:21` documents itself: "Nothing
here reads or writes anything organization-scoped." It counts global Hacker News and arXiv
signals per `RadarEntity`, which is shared world data. Only `RadarWatch` is
organization-scoped, and no cron reads it.

### Refusing sends comes for free

Once `getUserOrganizations()` excludes archived organizations, an archived organization can
never become `currentOrg`. Every organization-scoped route already calls
`requireOrgContext()`, so all of them refuse it without a single new guard. There is
therefore no per-route send check to write, and none to forget on a route added later.

### The cookie needs a fallback

`getAuthContext()` resolves `selected_org_id` with `organizations.find(...)`. If the
selected organization is archived while you are in it, that returns `undefined`,
`currentOrg` becomes null, and the user sees a bare "Unauthorized: No organization
selected".

It must instead fall back to the first live organization and rewrite the cookie. If there
are no live organizations at all, `/onboarding` is the existing destination for a user with
no organization, so the worst case is a redirect rather than a broken dashboard.

## The platform surface

### Screens

- **`/dashboard/platform`** lists every organization, live and archived, with plan, created
  date, and three counts. Archived rows are marked, not hidden: hiding them here would
  recreate the original problem one level up.
- **`/dashboard/platform/[id]`** shows the editable record, the full inventory, and the
  archive, restore and delete actions.

### Endpoints

All under `/api/platform/orgs`, each calling `requirePlatformContext()` as its first
statement.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | list with cheap counts |
| `POST` | `/` | create, delegating to `createOrganization()` |
| `GET` | `/[id]` | detail with the full 19-relation inventory |
| `PATCH` | `/[id]` | name, slug, plan, industry, limits, and `archivedAt` set or cleared |
| `DELETE` | `/[id]` | hard delete; archived only; slug in the body |
| `POST` | `/[id]/membership` | write a real `OrgUser` row for the caller |

### Counting is split by cost

The list uses Prisma's `_count` on three relations only, articles, subscribers and
editions, which is one query for the whole page. The full 19-relation inventory is computed
only when an organization detail is opened, because doing it per row on the list is 19
counts times N organizations on every page load. The expensive query belongs where the
number is actually needed, which is the delete confirmation.

### Creation reuses the existing path

`POST /` delegates to `createOrganization()` in `lib/auth/context.ts:222`, which already
enforces slug uniqueness and creates the `OrgSettings` row. The new code is the permission
wrapper, not a second way for an organization to be born, so a future change to how
organizations are created cannot leave the platform area behind.

## Error handling

**A non-superadmin gets `404`, from both the page and the API.** A `403` confirms the
platform area exists and names it as a target. This matches the signed edition archive,
which already answers the same 404 for every distinct failure by deliberate design.

**Four rails on delete, in order:**

1. **Archived only.** Deleting a live organization is `409` with a message saying to
   archive first, so the two-step cannot be skipped by calling the API directly.
2. **Inventory first.** The confirmation shows live counts across all 19 relations, not
   estimates.
3. **Exact slug match.** The request body must carry the slug; a mismatch is `400`. Typing
   a display name is muscle memory, typing a slug is a decision.
4. **Zero organizations is survivable.** Deleting down to nothing resolves `currentOrg`
   null, and `/onboarding` already handles that user.

**SENT editions are surfaced, not blocked.** The inventory shows how many of an
organization's editions have been sent, and deleting destroys the record of mail already
delivered. This is the correct trade in August 2026, when nothing is in production and the
point of the feature is wiping test organizations. **It is the wrong trade once real
editions ship**, and whoever reads this after that happens should change rail 1 to refuse
deletion of any organization with a SENT edition.

**Logging.** Archive, restore and delete log the actor's email, the organization id and
slug, and the counts destroyed. No subscriber data in the log line, per the project's A09
guidance. There is no audit table in this schema and this design does not add one, so
**hard delete leaves no permanent record** once Vercel's one-hour Hobby retention expires.
That is one more reason archive is the default action.

**Every route handler gets try/catch** returning a sanitized message, per Constitutional
Principle 4, with no stack traces reaching the client.

## Testing

Unit tests, in the style of the existing suites, which favour pure functions with the
environment or input passed in:

- **`isSuperAdmin`**: an allowlisted address; a non-allowlisted address; case and
  whitespace insensitivity; a null and an undefined email; unset, empty and
  whitespace-only `SUPERADMIN_EMAILS` all returning false; an entry that is a bare comma.
- **Delete precondition**: a pure `canDeleteOrganization({ archivedAt, confirmSlug, slug })`
  helper returning a discriminated result, so the three refusal reasons are asserted
  without a database. This keeps the rails testable rather than buried in a route.
- **Archived filter shape**: assert the `where` clause each of the four call sites builds,
  the same way `tests/unit/aside-select.test.ts` asserts a query shape rather than running
  it.
- **Cookie fallback**: a pure `resolveSelectedOrg(organizations, cookieOrgId)` returning
  the organization to use and whether the cookie needs rewriting, covering the archived,
  missing and empty cases.

What tests cannot cover, and so must be checked by hand before this is trusted: the `404`
for a non-superadmin, and one real archive followed by one real restore.

## Out of scope

- Cross-organization editing of articles, subscribers, editions, feeds or templates.
- An audit table.
- Exporting an organization before deletion.
- Managing who is a superadmin from inside the application, which is prevented by design.
