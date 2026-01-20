import OpenAI from "openai";
import { config } from "@/lib/config";

const openai = new OpenAI({
  apiKey: config.ai.openai.apiKey,
});

/**
 * Generate embedding vector for text using OpenAI
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    // Truncate text if too long (ada-002 has 8191 token limit)
    const truncatedText = text.substring(0, 8000);

    const response = await openai.embeddings.create({
      model: config.ai.openai.embeddingModel,
      input: truncatedText,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw new Error(
      `Failed to generate embedding: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Batch generate embeddings for multiple texts
 */
export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  const embeddings: number[][] = [];

  // Process in chunks of 20 to avoid rate limits
  const chunkSize = 20;
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);

    const promises = chunk.map((text) => generateEmbedding(text));
    const chunkEmbeddings = await Promise.all(promises);

    embeddings.push(...chunkEmbeddings);

    // Add small delay between chunks to avoid rate limiting
    if (i + chunkSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return embeddings;
}
