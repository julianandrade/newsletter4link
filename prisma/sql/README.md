# Hand-run SQL, superseded by the migration baseline

These files were applied by hand in the Supabase SQL editor, back when this project's only
schema tool was `prisma db push`. **They are history. Do not run them.**

Since the baseline at `prisma/migrations/0_init/migration.sql`, schema changes go through
Prisma Migrate. See the database section of `CLAUDE.md`.

| File | What it did | Now |
|---|---|---|
| `init-database.sql` | Created the original single-tenant schema and seeded RSS sources | Superseded by `0_init`, which is multi-tenant: every domain table carries an `organizationId` |
| `add-missing-column.sql` | Added `RSSSource.lastError` out of band | Part of the model, and of `0_init` |
| `2026-08-07-article-discard.sql` | Added the discard columns behind the Articles screen | Part of `0_init` |
| `2026-08-07-sent-snapshot.sql` | Added the sent-edition snapshot columns | Part of `0_init` |
| `2026-08-13-edition-article-use-link-take.sql` | Added `useLinkTake` to the edition-article join | Part of `0_init` |

They are kept rather than deleted because the plan documents under
`docs/superpowers/plans/` cite these paths, and a record of past work should still resolve.

Verified on 14 August 2026, before the baseline was recorded: `prisma migrate diff`
between the live database and the schema came back empty, so every change these files made
by hand is reflected in `schema.prisma` and therefore in `0_init`. Nothing here is a
pending change.
