import { prisma } from "@/lib/db";
import { cosineSimilarity } from "@/lib/ai/embeddings";
import { config } from "@/lib/config";

/**
 * Check if an article is a duplicate based on URL
 */
export async function isDuplicateByUrl(url: string): Promise<boolean> {
  const existing = await prisma.article.findUnique({
    where: { sourceUrl: url },
  });

  return existing !== null;
}

/**
 * Find similar articles based on embedding similarity
 */
export async function findSimilarArticles(
  embedding: number[],
  threshold: number = config.curation.vectorSimilarityThreshold
): Promise<Array<{ id: string; title: string; similarity: number }>> {
  // Get all articles from the last 30 days (to limit comparison set)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentArticles = await prisma.article.findMany({
    where: {
      createdAt: {
        gte: thirtyDaysAgo,
      },
      embedding: {
        isEmpty: false,
      },
    },
    select: {
      id: true,
      title: true,
      embedding: true,
    },
  });

  const similarArticles: Array<{
    id: string;
    title: string;
    similarity: number;
  }> = [];

  for (const article of recentArticles) {
    if (article.embedding && article.embedding.length > 0) {
      const similarity = cosineSimilarity(embedding, article.embedding);

      if (similarity >= threshold) {
        similarArticles.push({
          id: article.id,
          title: article.title,
          similarity,
        });
      }
    }
  }

  // Sort by similarity (highest first)
  similarArticles.sort((a, b) => b.similarity - a.similarity);

  return similarArticles;
}

/**
 * Check if an article is a duplicate based on content similarity
 */
export async function isDuplicateByContent(
  embedding: number[]
): Promise<{
  isDuplicate: boolean;
  similarArticles: Array<{ id: string; title: string; similarity: number }>;
}> {
  const similarArticles = await findSimilarArticles(embedding);

  // Consider it a duplicate if there's a very similar article (0.85+ similarity)
  const isDuplicate = similarArticles.length > 0;

  return {
    isDuplicate,
    similarArticles,
  };
}

/**
 * Comprehensive duplicate check (URL + content)
 */
export async function checkForDuplicates(
  url: string,
  embedding: number[],
  threshold?: number
): Promise<{
  isDuplicate: boolean;
  reason?: "url" | "content";
  similarArticles?: Array<{ id: string; title: string; similarity: number }>;
}> {
  // First check URL (fast)
  const urlDuplicate = await isDuplicateByUrl(url);
  if (urlDuplicate) {
    return {
      isDuplicate: true,
      reason: "url",
    };
  }

  // Then check content similarity (slower)
  const similarArticles = await findSimilarArticles(embedding, threshold);
  if (similarArticles.length > 0) {
    return {
      isDuplicate: true,
      reason: "content",
      similarArticles,
    };
  }

  return {
    isDuplicate: false,
  };
}

/**
 * Remove old articles to keep database size manageable
 * Keeps articles from last 90 days only
 */
export async function cleanupOldArticles(): Promise<number> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const result = await prisma.article.deleteMany({
    where: {
      createdAt: {
        lt: ninetyDaysAgo,
      },
      status: "REJECTED", // Only delete rejected articles
    },
  });

  return result.count;
}
