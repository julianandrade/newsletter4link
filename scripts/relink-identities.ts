/**
 * Re-links `OrgUser` rows from Supabase subject ids to Identity Platform ones.
 *
 * Every identity provider issues its own subject id, so after the switch an existing member
 * signs in successfully and then looks like a stranger: the token is valid, and no `OrgUser`
 * row matches it. The symptom is being bounced to onboarding as though the account were new.
 *
 * Matching is by email, which is sound here and worth checking rather than assuming: measured
 * 15 August 2026 there are 3 rows, 3 distinct emails, and none empty. The script refuses to
 * run if that stops being true.
 *
 *   npx tsx scripts/relink-identities.ts --dry-run
 *   npx tsx scripts/relink-identities.ts
 *
 * POINT DATABASE_URL AT CLOUD SQL. That is the database Cloud Run reads; Supabase has diverged
 * since the Phase C cutover and rewriting it would update rows nothing serves from.
 *
 * Safe to run before anyone has signed in: an email with no Identity Platform user yet is
 * reported and skipped, so the usual sequence is to run it, have people sign in, and run it
 * again. It is idempotent, and a row already pointing at the right id is left alone.
 */

import "dotenv/config";
import { prisma } from "../lib/db";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";

const DRY = process.argv.includes("--dry-run");

/**
 * The part before the @, lowercased.
 *
 * Matching is on this rather than the whole address, and that is not sloppiness. Link is
 * moving from `linkconsulting.com` to `linkroad.com` and keeping both for a while, so the same
 * person is `julian.andrade@linkconsulting.com` in `OrgUser` and
 * `julian.andrade@linkroad.com` from Identity Platform. Matching the full address found
 * nothing at all, silently, which is the worst possible outcome for a script whose job is to
 * decide who somebody is.
 *
 * The narrowing is safe here because the check below refuses to run unless local parts are
 * unique across the table. If two people ever share one across domains, this stops rather than
 * guesses.
 */
function localPart(email: string): string {
  return email.trim().toLowerCase().split("@")[0] ?? "";
}

function admin() {
  if (getApps().length === 0) {
    const projectId = process.env.GCP_PROJECT_ID;
    if (!projectId) throw new Error("GCP_PROJECT_ID is not set.");
    initializeApp({ projectId, credential: applicationDefault() });
  }
  return getAuth();
}

async function main() {
  const rows = await prisma.orgUser.findMany({
    select: { id: true, email: true, supabaseUserId: true, name: true },
  });

  const emails = rows.map((r: { email: string }) => localPart(r.email));
  const blank = emails.filter((e: string) => !e).length;
  const distinct = new Set(emails).size;

  console.log(`rows ${rows.length}, distinct local parts ${distinct}, blank ${blank}`);

  // Refused rather than guessed at. Matching on the local part is only safe while it
  // identifies a row uniquely, and a duplicate would silently link two members to one
  // identity, which is an account takeover rather than a bug.
  if (blank > 0 || distinct !== rows.length) {
    throw new Error(
      "Email local parts are not unique and non-empty across OrgUser, so matching on them is " +
        "unsafe. Resolve the duplicates before re-linking."
    );
  }

  const auth = admin();
  let updated = 0;
  let already = 0;
  let missing = 0;

  // One pass over Identity Platform, indexed by local part, rather than a lookup per row.
  // `getUserByEmail` cannot help here: the address it would be given is the OLD domain.
  const byLocalPart = new Map<string, string>();
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (u.email) byLocalPart.set(localPart(u.email), u.uid);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`identity platform users: ${byLocalPart.size}`);

  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    const uid = byLocalPart.get(localPart(row.email));

    if (!uid) {
      console.log(`  no Identity Platform user yet for ${email}, skipping`);
      missing++;
      continue;
    }

    if (row.supabaseUserId === uid) {
      already++;
      continue;
    }

    if (DRY) {
      console.log(`  would relink ${email}: ${row.supabaseUserId} -> ${uid}`);
      updated++;
      continue;
    }

    await prisma.orgUser.update({ where: { id: row.id }, data: { supabaseUserId: uid } });
    console.log(`  relinked ${email}`);
    updated++;
  }

  console.log(
    `\n${DRY ? "dry run: " : ""}relinked ${updated}, already correct ${already}, not yet signed in ${missing}`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
