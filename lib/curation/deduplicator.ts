import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import { isStorableEmbedding, toVectorLiteral } from "@/lib/db/embedding";

/**
 * Check if an article is a duplicate based on URL (within an organization)
 */
export async function isDuplicateByUrl(url: string, organizationId: string): Promise<boolean> {
  const existing = await prisma.article.findUnique({
    where: {
      sourceUrl_organizationId: {
        sourceUrl: url,
        organizationId,
      },
    },
  });

  return existing !== null;
}

/**
 * Find similar articles based on embedding similarity (within an organization)
 */
export async function findSimilarArticles(
  embedding: number[],
  organizationId: string,
  threshold: number = config.curation.vectorSimilarityThreshold
): Promise<Array<{ id: string; title: string; similarity: number }>> {
  // Wrong-dimension/empty embeddings can't be compared against the vector
  // column — treat them as having no matches.
  if (!isStorableEmbedding(embedding)) {
    return [];
  }

  // Limit the comparison set to the last 30 days. Similarity is cosine
  // similarity (1 - cosine distance); the HNSW index serves the ORDER BY.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const vectorLiteral = toVectorLiteral(embedding);

  const rows = await prisma.$queryRaw<
    Array<{ id: string; title: string; similarity: number }>
  >`
    SELECT "id", "title", 1 - ("embedding" <=> ${vectorLiteral}::vector) AS "similarity"
    FROM "Article"
    WHERE "organizationId" = ${organizationId}
      AND "createdAt" >= ${thirtyDaysAgo}
      AND "embedding" IS NOT NULL
      AND 1 - ("embedding" <=> ${vectorLiteral}::vector) >= ${threshold}
    ORDER BY "embedding" <=> ${vectorLiteral}::vector ASC
    LIMIT 20
  `;

  // $queryRaw can surface numeric columns as strings depending on the driver.
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    similarity: Number(row.similarity),
  }));
}

/**
 * Check if an article is a duplicate based on content similarity (within an organization)
 */
export async function isDuplicateByContent(
  embedding: number[],
  organizationId: string
): Promise<{
  isDuplicate: boolean;
  similarArticles: Array<{ id: string; title: string; similarity: number }>;
}> {
  const similarArticles = await findSimilarArticles(embedding, organizationId);

  // Consider it a duplicate if there's a very similar article (0.85+ similarity)
  const isDuplicate = similarArticles.length > 0;

  return {
    isDuplicate,
    similarArticles,
  };
}

/**
 * Comprehensive duplicate check (URL + content) within an organization
 */
export async function checkForDuplicates(
  url: string,
  embedding: number[],
  organizationId: string,
  threshold?: number
): Promise<{
  isDuplicate: boolean;
  reason?: "url" | "content";
  similarArticles?: Array<{ id: string; title: string; similarity: number }>;
}> {
  // First check URL (fast)
  const urlDuplicate = await isDuplicateByUrl(url, organizationId);
  if (urlDuplicate) {
    return {
      isDuplicate: true,
      reason: "url",
    };
  }

  // Then check content similarity (slower)
  const similarArticles = await findSimilarArticles(embedding, organizationId, threshold);
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
 * Remove old articles to keep database size manageable (within an organization)
 * Keeps articles from last 90 days only
 */
export async function cleanupOldArticles(organizationId: string): Promise<number> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const result = await prisma.article.deleteMany({
    where: {
      organizationId,
      createdAt: {
        lt: ninetyDaysAgo,
      },
      status: "REJECTED", // Only delete rejected articles
    },
  });

  return result.count;
}
