import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { buildEditionEmail } from "@/lib/email/edition-data";
import { renderEditionEmail } from "@/lib/email/edition-template";
import { renderSourceFor } from "@/lib/editions/sent-snapshot";
import { resolveArchiveAccess } from "@/lib/email/archive-access";
import { buildArchiveUrl, buildEditionIndexUrl } from "@/lib/email/archive-url";
import { buildUnsubscribeUrl } from "@/lib/email/unsubscribe-token";

/**
 * One edition, read in a browser by the subscriber it was sent to.
 *
 * Not public. The link carries an HMAC bound to one subscriber and to the `archive` purpose, so
 * an unsubscribe link cannot be replayed here and an archive link cannot unsubscribe anyone.
 * For an internal newsletter citing paid sources that is the right level of trust: whoever
 * received the email, and nobody else, with no login and no second factor.
 *
 * The raw prisma client, not the tenant-scoped `db`. A public route has no session and therefore
 * no organization context, exactly as `app/api/unsubscribe/route.ts` already does. The scoping
 * is carried here instead, from the verified subscriber's own organization: without it a valid
 * token from one organization would open another's edition whenever a SENT event happened to
 * exist, and the token proves one subscriber, not one tenant.
 *
 * Every failure answers the same notFound(). A bad signature, a deleted subscriber, an edition
 * never sent to them and an edition in another organization must be indistinguishable, or the
 * response reports which editions exist.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditionArchivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;

  const access = await resolveArchiveAccess(t, id, {
    findSubscriber: (subscriberId) =>
      prisma.subscriber.findUnique({
        where: { id: subscriberId },
        select: { active: true, organizationId: true },
      }),
    // Proof this subscriber actually received this edition, rather than merely holding a valid
    // token for some edition.
    wasSentTo: async (subscriberId, editionId) =>
      (await prisma.emailEvent.count({
        where: { subscriberId, editionId, eventType: "SENT" },
      })) > 0,
  });

  // One answer for every refusal. See resolveArchiveAccess for why they are not distinguished.
  if (!access.allowed) notFound();

  const { subscriberId } = access;

  const edition = await prisma.edition.findFirst({
    where: { id, organizationId: access.organizationId },
    select: {
      id: true,
      title: true,
      week: true,
      year: true,
      // The frozen copy. When it is there it is the whole answer, and the joins below are
      // read only for editions sent before this column existed.
      sentSnapshot: true,
      articles: {
        orderBy: { order: "asc" },
        select: {
          article: {
            select: {
              title: true,
              summary: true,
              sourceUrl: true,
              category: true,
              relevanceScore: true,
              // Only the lead's is read, to find the top story's image.
              content: true,
            },
          },
        },
      },
      projects: {
        select: {
          project: {
            select: { name: true, description: true, team: true, impact: true },
          },
        },
      },
    },
  });
  if (!edition) notFound();

  /**
   * The snapshot wins whenever there is one.
   *
   * Without this the archive re-rendered from the live `Article` rows, so an edit to a
   * summary rewrote a newsletter that had already been delivered, and discarding an
   * article removed the story from it entirely.
   */
  const source = renderSourceFor(edition);

  const email = buildEditionEmail({
    articles: source.articles,
    projects: source.projects,
    week: source.week,
    year: source.year,
    label: source.label,
    unsubscribeUrl: buildUnsubscribeUrl(subscriberId),
    archiveUrl: buildArchiveUrl(edition.id, subscriberId),
    portalUrl: buildEditionIndexUrl(subscriberId),
  });

  /**
   * The email's own HTML, in an iframe.
   *
   * The alternative is a second rendering of the same content for the web, which is a second
   * thing to keep in step with the design. The edition is table HTML with its own dark-mode
   * rules, and an iframe is what lets it keep them without its styles reaching the page around
   * it. `sandbox` without `allow-scripts`, because nothing here needs to run.
   */
  return (
    <main className="min-h-screen bg-[#eceeed]">
      <iframe
        title="This edition"
        srcDoc={renderEditionEmail(email)}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        className="h-screen w-full border-0"
      />
    </main>
  );
}
