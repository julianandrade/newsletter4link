# Every call taken without Julian: superadmin

> 10 August 2026. Julian approved all four design sections, said he would follow my
> recommendations, and went to lunch with "assume and register them for me to check after".
> This is that register. Design is in
> [docs/superpowers/specs/2026-08-10-superadmin-design.md](superpowers/specs/2026-08-10-superadmin-design.md).

**Read these two first**, because they are the ones with consequences outside the branch.

## 1. I applied a schema change to the shared production database

`archivedAt DateTime?` and an index on `Organization`, via `prisma db push`.

I checked the generated SQL before running it, with
`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`,
and it was exactly two statements: one `ADD COLUMN` of a nullable column, one
`CREATE INDEX`. No drift, nothing destructive, and backward compatible with the code
currently deployed, which simply ignores a column it does not know about.

**Reversible** with `ALTER TABLE "Organization" DROP COLUMN "archivedAt";` while nothing has
been archived. Once rows carry a timestamp, dropping it silently un-archives them.

## 2. Deleting an organization with SENT editions is warned about, not blocked

Your recommendation, taken as approved. The confirmation shows the sent count in its own
warning callout and the delete proceeds.

**This is the right trade today and the wrong one later.** Nothing is in production and
wiping test organizations is the point of the feature. Once a real edition ships to real
readers, `canDeleteOrganization` in `lib/platform/delete-guard.ts` should gain a rail
refusing any organization where `sentEditions > 0`. It is one `if` and the count is already
computed. The spec says this too, in the same words, so it survives this file being lost.

---

## Calls I made where the design left room

**Superadmin composes with the domain allowlist rather than replacing it.**
`getPlatformContext()` checks `isAllowedEmail` *and* `isSuperAdmin`. Being on the superadmin
list is not a way around the Linkroad domain restriction. Reverse it only if a superadmin
ever needs an outside address, which would be a strange thing to want.

**The nav link is a server-computed boolean, not a client-side check.**
`SUPERADMIN_EMAILS` is read in `app/dashboard/layout.tsx` and only `isSuperAdmin: true|false`
crosses to the browser. Making the variable `NEXT_PUBLIC_` would have been one line and would
have published the list of platform administrators into the JS bundle.

**`PlatformForbiddenError` is a named class, not a matched message.**
Route handlers answer 404 on that specific type. Matching on `error.message` would mean any
future error that happened to contain the same wording silently returns 404 and hides a real
fault.

**Archiving twice keeps the original timestamp.** `archivedAt` is set to
`existing.archivedAt ?? new Date()`, so a double click does not move the date and "when was
this wound down" survives.

**"Grant me membership" never changes an existing role.** It is an `upsert` with `update: {}`.
If you already hold a real EDITOR membership, pressing the button leaves it EDITOR rather
than quietly promoting you to OWNER as a side effect of a button about access.

**It refuses on an archived organization.** A membership on something that cannot appear in
the switcher would be a grant that silently does nothing, so it returns 409 and says to
restore first.

**The cookie correction is best effort.** `getAuthContext()` writes the corrected
`selected_org_id` inside a `.catch(() => {})`, because Next refuses a cookie write during a
server-component render and `getAuthContext` is called from both renders and route handlers.
The fallback has already chosen a usable organization, so the only cost of the write failing
is repeating the resolution next request. Without the catch, every read-only page would throw.

**A user with no cookie is not given one.** `resolveSelectedOrg` only reports
`rewriteCookie: true` when a cookie existed and was unusable, so first-visit behaviour is
byte-for-byte what it was before this change.

**The cookie is left alone when nothing can be selected.** Clearing it would lose the user's
last choice, which is exactly what they want back if the organization is restored.

**Slug validation is stricter than before.** `^[a-z0-9]+(?:-[a-z0-9]+)*$` on create and on
rename. The slug appears in URLs and is what must be typed to delete an organization, so it
should not be able to contain a space.

**Delete confirmation trims but does not lowercase.** A trailing space from a copy and paste
is not a different intent; a different case is a different string. Slugs here are already
lowercase.

**`CASCADING_RELATIONS` is a hand-written list, not derived from the Prisma schema.**
So adding a cascading relation to `Organization` without adding it here shows up as a
missing number in the confirmation, plus a `console.warn` from `countCascade`, rather than as
a silent omission from the only warning anyone gets.

**The inventory is not on the list screen.** Nineteen counts per organization would be
nineteen times N on every page load. The list uses Prisma `_count` on three relations, which
is one query; the full inventory is paid once, on a detail screen someone opened
deliberately.

---

## Facts worth keeping

**`radar-collect` needed no change, and I said otherwise while designing.**
`lib/radar/collect.ts:21` documents itself: "Nothing here reads or writes anything
organization-scoped." It counts global Hacker News and arXiv signals per `RadarEntity`.
Only `RadarWatch` is organization-scoped and no cron reads it. I listed radar-collect as one
of three jobs archiving should stop, in the question you answered, and that was wrong.

**Refusing sends from an archived organization cost zero code.** Once
`getUserOrganizations()` filters archived rows, an archived organization can never become
`currentOrg`, so every organization-scoped route already refuses it through the
`requireOrgContext()` it calls today. There is no per-route send guard, and none to forget on
a route added later.

---

## What is verified, and what is not

**Verified**
- `tsc --noEmit` clean; **1368 unit tests passing**, up from 1345
- `npm run build` clean, with all five new routes in the output
- The four archive filters, against the real database: a throwaway organization was created,
  confirmed visible to all three org-enumerating queries, archived, confirmed invisible to
  all three while still visible to the platform area and with its data intact, restored,
  confirmed visible again, then deleted and confirmed to have cascaded. **14 assertions, all
  passing**, and the throwaway organization removed.

**Not verified, and needs you**
- **The 404 for a non-superadmin.** I cannot hold a second session, so nobody has confirmed
  that a normal user hitting `/dashboard/platform` gets a 404 rather than a render. The code
  path is `getPlatformContext()` returning null then `notFound()`, and `isSuperAdmin` is
  covered by nine unit tests including every fail-closed case, but the end-to-end answer is
  unobserved.
- **Every screen.** Neither platform page has been rendered in a browser. They are gated by a
  real session, and the `/radar-preview` harness bypasses layouts, so it would have proved
  nothing about the gate.
- **`SUPERADMIN_EMAILS` in Vercel.** Added to the worktree `.env` only. Until it is set on the
  Vercel project, `/dashboard/platform` answers 404 to everyone in production, which is the
  correct fail-closed behaviour and not a bug.
