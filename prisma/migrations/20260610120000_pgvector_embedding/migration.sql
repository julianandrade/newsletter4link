-- Convert Article.embedding from `double precision[]` to a pgvector `vector(1536)`
-- column and add an HNSW index for cosine-distance similarity search.
--
-- Dimension note: pgvector columns are fixed-dimension. 1536 matches the
-- default embedding models (text-embedding-ada-002 / text-embedding-3-small).
-- Existing rows whose stored array is not exactly 1536-dimensional (e.g. the
-- empty arrays written by manual search imports) are set to NULL.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Article"
  ALTER COLUMN "embedding" TYPE vector(1536)
    USING (
      CASE
        WHEN "embedding" IS NOT NULL AND array_length("embedding", 1) = 1536
          THEN "embedding"::vector(1536)
        ELSE NULL
      END
    );

-- HNSW index for cosine distance (the `<=>` operator). Managed in this
-- migration rather than schema.prisma because Prisma cannot declare indexes
-- on Unsupported() columns; expect a benign drift note on `prisma migrate dev`.
CREATE INDEX IF NOT EXISTS "Article_embedding_hnsw_idx"
  ON "Article" USING hnsw ("embedding" vector_cosine_ops);
