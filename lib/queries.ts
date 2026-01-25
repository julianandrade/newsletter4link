import { prisma } from "@/lib/db";
import { ArticleStatus, EditionStatus } from "@prisma/client";

// ==================== Article Queries ====================

/**
 * Get all pending articles for review
 */
export async function getPendingArticles() {
  return await prisma.article.findMany({
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
 * Get article by ID with full details
 */
export async function getArticleById(id: string) {
  return await prisma.article.findUnique({
    where: { id },
  });
}

/**
 * Update article status
 */
export async function updateArticleStatus(id: string, status: ArticleStatus) {
  return await prisma.article.update({
    where: { id },
    data: { status },
  });
}

/**
 * Update article summary
 */
export async function updateArticleSummary(id: string, summary: string) {
  return await prisma.article.update({
    where: { id },
    data: { summary },
  });
}

// ==================== Edition Queries ====================

/**
 * Get current week's edition or create if not exists
 */
export async function getCurrentEdition() {
  const now = new Date();
  const week = getWeekNumber(now);
  const year = now.getFullYear();

  let edition = await prisma.edition.findUnique({
    where: {
      week_year: { week, year },
    },
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
    edition = await prisma.edition.create({
      data: {
        week,
        year,
        status: "DRAFT",
      },
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
  editionId: string,
  articleId: string,
  order: number
) {
  return await prisma.editionArticle.create({
    data: {
      editionId,
      articleId,
      order,
    },
  });
}

/**
 * Add project to edition
 */
export async function addProjectToEdition(
  editionId: string,
  projectId: string,
  order: number
) {
  return await prisma.editionProject.create({
    data: {
      editionId,
      projectId,
      order,
    },
  });
}

/**
 * Finalize edition
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
 * Mark edition as sent
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
 * Get all projects
 */
export async function getAllProjects() {
  return await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get featured projects
 */
export async function getFeaturedProjects() {
  return await prisma.project.findMany({
    where: { featured: true },
    orderBy: { projectDate: "desc" },
  });
}

/**
 * Create project
 */
export async function createProject(data: {
  name: string;
  description: string;
  team: string;
  projectDate: Date;
  impact?: string;
  imageUrl?: string;
}) {
  return await prisma.project.create({
    data,
  });
}

/**
 * Update project
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
 * Delete project
 */
export async function deleteProject(id: string) {
  return await prisma.project.delete({
    where: { id },
  });
}

// ==================== Subscriber Queries ====================

/**
 * Get all active subscribers
 */
export async function getActiveSubscribers() {
  return await prisma.subscriber.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Create subscriber
 */
export async function createSubscriber(data: {
  email: string;
  name?: string;
  preferredLanguage?: string;
  preferredStyle?: string;
}) {
  return await prisma.subscriber.create({
    data,
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
function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
