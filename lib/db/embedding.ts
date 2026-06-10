import { prisma } from "@/lib/db";

/**
 * pgvector embedding storage helpers.
 *
 * The `Article.embedding` column is a pgvector `vector(1536)` (see the
 * pgvector migration). Prisma's typed client cannot read or write
 * `Unsupported()` columns, so all reads/writes of the vector go through
 * parameterized raw SQL with an explicit `::vector` cast.
 */

/** Dimensionality of the supported embedding models (ada-002 / 3-small). */
export const EMBEDDING_DIMENSIONS = 1536;

/** Serialize a JS number[] into a pgvector text literal: `[1,2,3]`. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/** Whether an embedding has the supported dimensionality. */
export function isStorableEmbedding(embedding: unknown): embedding is number[] {
  return Array.isArray(embedding) && embedding.length === EMBEDDING_DIMENSIONS;
}

/**
 * Persist an article's embedding into the pgvector column.
 *
 * No-op for empty or wrong-dimension embeddings (the column stays NULL),
 * which keeps manual imports without embeddings working. The value is bound
 * as a parameter and cast to `vector`, so it is safe from SQL injection.
 */
export async function setArticleEmbedding(
  articleId: string,
  embedding: number[]
): Promise<void> {
  if (!isStorableEmbedding(embedding)) return;

  const literal = toVectorLiteral(embedding);
  await prisma.$executeRaw`
    UPDATE "Article" SET "embedding" = ${literal}::vector WHERE "id" = ${articleId}
  `;
}
