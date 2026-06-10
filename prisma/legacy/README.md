# Legacy SQL Scripts (Archived)

These ad-hoc SQL scripts predate the Prisma migration workflow and are **superseded by
the baseline migration** at `prisma/migrations/0_init/migration.sql`.

They are kept for historical reference only. **Do not run them against the current
database** — the live schema (multi-tenant, `Organization`-scoped) has diverged
significantly from what these scripts describe.

| File | Original purpose | Superseded by |
|------|------------------|---------------|
| `init-database.sql` | Manual Supabase SQL-editor initialization of the original single-tenant schema (`Article`, `Project`, `Edition`, `Subscriber`, etc.) plus RSS seed data. | `prisma/migrations/0_init` (the current multi-tenant baseline). RSS source seeding should now be handled via a seed script, not raw SQL. |
| `add-missing-column.sql` | One-off `ALTER TABLE "RSSSource" ADD COLUMN "lastError"` patch applied out-of-band. | The `lastError` column is now part of the `RSSSource` model in `schema.prisma` and the baseline migration. |

## Why these are no longer authoritative

- They reflect a **single-tenant** schema. The current schema is multi-tenant: every
  domain table carries an `organizationId` and additional models exist (`Organization`,
  `OrgUser`, `OrgSettings`, `ApiKey`, `BrandVoice`, `SearchTopic`, `BackgroundJob`, etc.).
- They use enum values (e.g. `ARCHIVED`, `COMPLAINED`) and columns
  (e.g. `Subscriber.subscribedAt`, `EmailEvent.articleId`) that no longer match the
  current `schema.prisma`.
- Schema evolution is now tracked declaratively through Prisma migrations.

For the current workflow see the "Database" section of `SETUP.md` and `CLAUDE.md`.
