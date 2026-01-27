import { prisma } from "@/lib/db";
import { TenantClient } from "@/lib/db/tenant";
import { ArticleStatus } from "@prisma/client";

// ==================== Article Queries ====================

/**
 * Get all pending articles for review (tenant-scoped)
 */
export async function getPendingArticles(db: TenantClient) {
  return await db.article.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: [
      { relevanceScore: "desc" },
      { publishedAt: "desc" },
    ],
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      author: true,
      publishedAt: true,
      relevanceScore: true,
      summary: true,
      category: true,
      status: true,
      createdAt: true,
    },
  });
}

/**
 * Get article by ID (tenant-scoped)
 */
export async function getArticleById(db: TenantClient, id: string) {
  return await db.article.findUnique({
    where: { id },
  });
}

/**
 * Update article status (uses raw prisma - verify ownership before calling)
 */
export async function updateArticleStatus(id: string, status: ArticleStatus) {
  return await prisma.article.update({
    where: { id },
    data: { status },
  });
}

/**
 * Update article summary (uses raw prisma - verify ownership before calling)
 */
export async function updateArticleSummary(id: string, summary: string) {
  return await prisma.article.update({
    where: { id },
    data: { summary },
  });
}

// ==================== Edition Queries ====================

/**
 * Get current week's edition or create if not exists (tenant-scoped)
 */
export async function getCurrentEdition(db: TenantClient) {
  const now = new Date();
  const week = getWeekNumber(now);
  const year = now.getFullYear();

  let edition = await db.edition.findFirst({
    where: { week, year },
    include: {
      articles: {
        include: { article: true },
        orderBy: { order: "asc" },
      },
      projects: {
        include: { project: true },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!edition) {
    edition = await db.edition.create({
      data: {
        week,
        year,
        status: "DRAFT",
      } as any,
      include: {
        articles: {
          include: { article: true },
          orderBy: { order: "asc" },
        },
        projects: {
          include: { project: true },
          orderBy: { order: "asc" },
        },
      },
    });
  }

  return edition;
}

/**
 * Add article to edition
 */
export async function addArticleToEdition(
  db: TenantClient,
  editionId: string,
  articleId: string,
  order: number
) {
  return await db.editionArticle.createMany({
    data: [{ editionId, articleId, order }],
  });
}

/**
 * Add project to edition
 */
export async function addProjectToEdition(
  db: TenantClient,
  editionId: string,
  projectId: string,
  order: number
) {
  return await db.editionProject.createMany({
    data: [{ editionId, projectId, order }],
  });
}

/**
 * Finalize edition (uses raw prisma - verify ownership before calling)
 */
export async function finalizeEdition(editionId: string) {
  return await prisma.edition.update({
    where: { id: editionId },
    data: {
      status: "FINALIZED",
      finalizedAt: new Date(),
    },
  });
}

/**
 * Mark edition as sent (uses raw prisma - verify ownership before calling)
 */
export async function markEditionAsSent(editionId: string) {
  return await prisma.edition.update({
    where: { id: editionId },
    data: {
      status: "SENT",
      sentAt: new Date(),
    },
  });
}

// ==================== Project Queries ====================

/**
 * Get all projects (tenant-scoped)
 */
export async function getAllProjects(db: TenantClient) {
  return await db.project.findMany({
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get featured projects (tenant-scoped)
 */
export async function getFeaturedProjects(db: TenantClient) {
  return await db.project.findMany({
    where: { featured: true },
    orderBy: { projectDate: "desc" },
  });
}

/**
 * Create project (tenant-scoped)
 */
export async function createProject(
  db: TenantClient,
  data: {
    name: string;
    description: string;
    team: string;
    projectDate: Date;
    impact?: string;
    imageUrl?: string;
  }
) {
  return await db.project.create({
    data: data as any,
  });
}

/**
 * Update project (uses raw prisma - verify ownership before calling)
 */
export async function updateProject(
  id: string,
  data: {
    name?: string;
    description?: string;
    team?: string;
    projectDate?: Date;
    impact?: string;
    imageUrl?: string;
    featured?: boolean;
  }
) {
  return await prisma.project.update({
    where: { id },
    data,
  });
}

/**
 * Delete project (uses raw prisma - verify ownership before calling)
 */
export async function deleteProject(id: string) {
  return await prisma.project.delete({
    where: { id },
  });
}

// ==================== Subscriber Queries ====================

/**
 * Get all active subscribers (tenant-scoped)
 */
export async function getActiveSubscribers(db: TenantClient) {
  return await db.subscriber.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Create subscriber (tenant-scoped)
 */
export async function createSubscriber(
  db: TenantClient,
  data: {
    email: string;
    name?: string;
    preferredLanguage?: string;
    preferredStyle?: string;
  }
) {
  return await db.subscriber.create({
    data: data as any,
  });
}

/**
 * Unsubscribe user and record the unsubscribe event
 */
export async function unsubscribeUser(id: string) {
  return await prisma.$transaction(async (tx) => {
    // Update subscriber to inactive
    const subscriber = await tx.subscriber.update({
      where: { id },
      data: { active: false },
    });

    // Find the subscriber's most recent SENT event to get the editionId
    const lastSentEvent = await tx.emailEvent.findFirst({
      where: {
        subscriberId: id,
        eventType: "SENT",
      },
      orderBy: { timestamp: "desc" },
    });

    // Only create unsubscribe event if we have an editionId to link to
    if (lastSentEvent) {
      await tx.emailEvent.create({
        data: {
          subscriberId: id,
          editionId: lastSentEvent.editionId,
          eventType: "UNSUBSCRIBED",
          metadata: { source: "unsubscribe_link" },
        },
      });
    }

    return subscriber;
  });
}

// ==================== Utility Functions ====================

/**
 * Get ISO week number
 */
export function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
