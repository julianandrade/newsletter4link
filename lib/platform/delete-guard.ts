/**
 * The rails on permanently deleting an organization.
 *
 * `Organization` cascades into 19 relations: members, invites, settings, apiKeys,
 * articles, projects, editions, subscribers, rssSources, curationJobs, templates,
 * brandVoices, mediaAssets, searchTopics, searchHistory, backgroundJobs,
 * generationDrafts, asides and radarWatches. One `prisma.organization.delete()` takes all
 * of it, including the record of editions already delivered to real inboxes, and there is
 * no audit table in this schema to say it happened.
 *
 * A pure function rather than checks inline in the route, so the three refusal reasons can
 * be asserted without a database. A rail nobody can test is a rail nobody should trust.
 */

export type DeleteRefusal =
  | { ok: false; status: 409; reason: "not-archived"; message: string }
  | { ok: false; status: 400; reason: "slug-mismatch"; message: string };

export type DeleteVerdict = { ok: true } | DeleteRefusal;

export interface DeleteRequest {
  /** `null` means the organization is live. */
  archivedAt: Date | string | null;
  /** The organization's real slug. */
  slug: string;
  /** What the caller typed, which must equal the slug exactly. */
  confirmSlug: string | null | undefined;
}

export function canDeleteOrganization({
  archivedAt,
  slug,
  confirmSlug,
}: DeleteRequest): DeleteVerdict {
  /**
   * Archive first, always.
   *
   * Checked before the slug so that calling the API directly cannot skip the two-step:
   * knowing the slug is not permission to delete a live organization. Archiving is
   * reversible and stops the automation, so the safe action is always available.
   */
  if (archivedAt === null) {
    return {
      ok: false,
      status: 409,
      reason: "not-archived",
      message: "Archive this organization before deleting it permanently.",
    };
  }

  /**
   * The slug, exactly.
   *
   * Not the display name: typing a name people say out loud is muscle memory, typing a
   * slug is a decision. Trimmed, because a trailing space from a copy and paste is not a
   * different intent, but not lowercased, since slugs here are already lowercase and
   * accepting a different case would be accepting a different string.
   */
  if (!confirmSlug || confirmSlug.trim() !== slug) {
    return {
      ok: false,
      status: 400,
      reason: "slug-mismatch",
      message: `Type the organization's slug (${slug}) to confirm deletion.`,
    };
  }

  return { ok: true };
}

/**
 * The relations that vanish with an organization, in the order shown to whoever is about
 * to destroy them.
 *
 * Named here rather than derived from the Prisma schema at runtime, so that adding a
 * cascading relation to `Organization` without adding it here shows up as a number missing
 * from the confirmation rather than as a silent omission. `editions` is first because it is
 * the one that can represent mail already sent to a real person.
 */
export const CASCADING_RELATIONS = [
  "editions",
  "subscribers",
  "articles",
  "projects",
  "asides",
  "templates",
  "rssSources",
  "curationJobs",
  "generationDrafts",
  "mediaAssets",
  "brandVoices",
  "searchTopics",
  "searchHistory",
  "backgroundJobs",
  "radarWatches",
  "apiKeys",
  "members",
  "invites",
  "settings",
] as const;

export type CascadingRelation = (typeof CASCADING_RELATIONS)[number];
