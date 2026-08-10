/**
 * What a delete would destroy, counted.
 *
 * `Organization` cascades into 19 relations and this schema has no audit table, so the
 * confirmation dialog's numbers are the only warning anyone gets and the response body is
 * the only record of what went. They therefore have to be real counts rather than estimates,
 * and they have to be read before the delete, because afterwards there is nothing to count.
 *
 * Deliberately not on the list route. Nineteen counts per organization is nineteen times N
 * on a page load, and the number is only needed where it is acted on.
 */

import { prisma } from "@/lib/db";
import { CASCADING_RELATIONS, type CascadingRelation } from "@/lib/platform/delete-guard";

export type CascadeInventory = Record<CascadingRelation, number> & {
  /**
   * Editions already delivered, called out separately.
   *
   * This is the one number that represents mail in a real person's inbox, and deleting
   * destroys the record of it. It does not block the delete: in August 2026 nothing is in
   * production and wiping test organizations is the point. Once real editions ship, the
   * first rail in `canDeleteOrganization` should refuse any organization where this is
   * greater than zero.
   */
  sentEditions: number;
};

export async function countCascade(organizationId: string): Promise<CascadeInventory> {
  const where = { organizationId };

  /**
   * One `count` per relation, issued together.
   *
   * `Organization._count` cannot be used here: it does not cover every relation and it
   * cannot express the SENT subset. Nineteen parallel counts on one organization is a cost
   * paid once, on a screen someone opened deliberately.
   */
  const [
    editions,
    sentEditions,
    subscribers,
    articles,
    projects,
    asides,
    templates,
    rssSources,
    curationJobs,
    generationDrafts,
    mediaAssets,
    brandVoices,
    searchTopics,
    searchHistory,
    backgroundJobs,
    radarWatches,
    apiKeys,
    members,
    invites,
    settings,
  ] = await Promise.all([
    prisma.edition.count({ where }),
    prisma.edition.count({ where: { ...where, status: "SENT" } }),
    prisma.subscriber.count({ where }),
    prisma.article.count({ where }),
    prisma.project.count({ where }),
    prisma.aside.count({ where }),
    prisma.emailTemplate.count({ where }),
    prisma.rSSSource.count({ where }),
    prisma.curationJob.count({ where }),
    prisma.generationDraft.count({ where }),
    prisma.mediaAsset.count({ where }),
    prisma.brandVoice.count({ where }),
    prisma.searchTopic.count({ where }),
    prisma.searchHistory.count({ where }),
    prisma.backgroundJob.count({ where }),
    prisma.radarWatch.count({ where }),
    prisma.apiKey.count({ where }),
    prisma.orgUser.count({ where }),
    prisma.orgInvite.count({ where }),
    prisma.orgSettings.count({ where }),
  ]);

  const inventory: CascadeInventory = {
    editions,
    sentEditions,
    subscribers,
    articles,
    projects,
    asides,
    templates,
    rssSources,
    curationJobs,
    generationDrafts,
    mediaAssets,
    brandVoices,
    searchTopics,
    searchHistory,
    backgroundJobs,
    radarWatches,
    apiKeys,
    members,
    invites,
    settings,
  };

  /**
   * A relation added to `Organization` and to `CASCADING_RELATIONS` but not counted here
   * would otherwise be silently absent from the confirmation. This turns that into a visible
   * zero plus a warning rather than a number nobody notices is missing.
   */
  for (const relation of CASCADING_RELATIONS) {
    if (typeof inventory[relation] !== "number") {
      console.warn(`[PLATFORM] inventory has no count for the "${relation}" relation`);
      inventory[relation] = 0;
    }
  }

  return inventory;
}
