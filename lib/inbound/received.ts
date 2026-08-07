import { prisma } from "@/lib/db";
import type { InboundEmailStatus } from "@prisma/client";

/**
 * Finding D2: the emails that arrived, and what each one produced.
 *
 * There was no screen over `InboundEmail` at all. Fifty-seven real emails had been
 * received, read and processed in production and none of them was visible in the product:
 * the only view over the table was the unknown-senders panel, which is the complement,
 * showing the ones that matched nothing.
 *
 * ## Scoped to the organization, which was not possible before
 *
 * `InboundEmail` has no `organizationId`, deliberately: mail arriving at a shared address
 * belongs to no tenant until a source claims it. The unknown-senders panel is restricted
 * to an OWNER for exactly that reason, and its docblock records the alternative that was
 * rejected as too expensive: "recording which organization claimed a matched email".
 *
 * `Article.inboundEmailId`, added for finding D1, is that record. An email is this
 * organization's when it produced an article here, or when its sender matches one of this
 * organization's own email sources. Both are answerable now, so this view needs no OWNER
 * restriction and shows nobody else's mail.
 */

export interface ReceivedEmail {
  id: string;
  from: string;
  subject: string | null;
  receivedAt: string;
  processedAt: string | null;
  status: InboundEmailStatus;
  error: string | null;
  /** The source that claims this sender, when one does. */
  sourceId: string | null;
  sourceName: string | null;
  /** How many articles this email produced for this organization. */
  articleCount: number;
  /** How many of those carry a link that could not be unwrapped. Finding D4. */
  unresolvedCount: number;
  /** Whether a body was ever fetched, which is what makes the counts meaningful. */
  hasContent: boolean;
}

export interface ReceivedArticle {
  id: string;
  title: string;
  sourceUrl: string;
  status: string;
  relevanceScore: number | null;
  sourceUnresolved: boolean;
  capturedAt: string;
}

/**
 * The emails belonging to this organization, newest first.
 *
 * A limit rather than pagination: the useful question is "what has arrived lately", and
 * fifty-seven rows after four months of one address means a page is a long way off. The
 * cap is stated in the response so a screen can say it is showing a window.
 */
export async function getReceivedEmails(
  organizationId: string,
  limit = 100
): Promise<{ emails: ReceivedEmail[]; total: number; limit: number }> {
  const sources = await prisma.rSSSource.findMany({
    where: { organizationId, type: "EMAIL" },
    select: { id: true, name: true, senderAddress: true },
  });

  /**
   * Matched by sender address, lowercased on both sides.
   *
   * `senderAddress` is the primary match key the ingest itself uses, so this view groups
   * emails the same way the processing does rather than inventing a second rule.
   */
  const bySender = new Map(
    sources
      .filter((source) => source.senderAddress)
      .map((source) => [source.senderAddress!.toLowerCase(), source])
  );

  const where = {
    OR: [
      // It produced something here, which is the strongest claim available.
      { articles: { some: { organizationId } } },
      // Or its sender is one of ours, which covers an email that produced nothing:
      // every item a duplicate, or an extraction that failed. Those are the ones worth
      // looking at, so a view that dropped them would hide its most useful rows.
      { from: { in: [...bySender.keys()], mode: "insensitive" as const } },
    ],
  };

  const [total, rows] = await Promise.all([
    prisma.inboundEmail.count({ where }),
    prisma.inboundEmail.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: {
        id: true,
        from: true,
        subject: true,
        receivedAt: true,
        processedAt: true,
        status: true,
        error: true,
        html: true,
        text: true,
        articles: {
          where: { organizationId },
          select: { id: true, sourceUnresolved: true },
        },
      },
    }),
  ]);

  const emails = rows.map((row) => {
    const source = bySender.get(row.from.toLowerCase()) ?? null;

    return {
      id: row.id,
      from: row.from,
      subject: row.subject,
      receivedAt: row.receivedAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null,
      status: row.status,
      error: row.error,
      sourceId: source?.id ?? null,
      sourceName: source?.name ?? null,
      articleCount: row.articles.length,
      unresolvedCount: row.articles.filter((a) => a.sourceUnresolved).length,
      // Selected only to be reduced to a boolean: a newsletter's html runs to hundreds of
      // kilobytes and no list needs it.
      hasContent: Boolean(row.html || row.text),
    };
  });

  return { emails, total, limit };
}

/**
 * What one email produced for this organization.
 *
 * Scoped twice: the articles by organization, and the email by whether it produced any.
 * Without the second check a member could read the article list of another tenant's mail
 * by guessing an id, which is the hole the platform-wide unknown-senders panel documents.
 */
export async function getEmailArticles(
  organizationId: string,
  emailId: string
): Promise<ReceivedArticle[] | null> {
  const email = await prisma.inboundEmail.findFirst({
    where: {
      id: emailId,
      OR: [
        { articles: { some: { organizationId } } },
        {
          from: {
            in: (
              await prisma.rSSSource.findMany({
                where: { organizationId, type: "EMAIL", senderAddress: { not: null } },
                select: { senderAddress: true },
              })
            ).map((source) => source.senderAddress!),
            mode: "insensitive",
          },
        },
      ],
    },
    select: { id: true },
  });

  // Null, not an empty list: "not yours or not there" and "yours and produced nothing"
  // are different answers and the caller has to be able to tell them apart.
  if (!email) return null;

  // Discarded rows are out. See lib/db/tenant.ts.
  const articles = await prisma.article.findMany({
    where: { discardedAt: null, inboundEmailId: emailId, organizationId },
    orderBy: [{ relevanceScore: { sort: "desc", nulls: "last" } }, { capturedAt: "desc" }],
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      status: true,
      relevanceScore: true,
      sourceUnresolved: true,
      capturedAt: true,
    },
  });

  return articles.map((article) => ({
    ...article,
    capturedAt: article.capturedAt.toISOString(),
  }));
}
