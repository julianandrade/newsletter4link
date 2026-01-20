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
    // Validate API key
    if (!config.ai.openai.apiKey || config.ai.openai.apiKey === 'undefined') {
      console.error("OpenAI API key is missing or undefined");
      throw new Error("OpenAI API key is not configured");
    }

    // Truncate text if too long (ada-002 has 8191 token limit)
    const truncatedText = text.substring(0, 8000);

    console.log(`Generating embedding for text (${truncatedText.length} chars)...`);

    const response = await openai.embeddings.create({
      model: config.ai.openai.embeddingModel,
      input: truncatedText,
    });

    const embedding = response.data[0]?.embedding;

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      console.error("Invalid embedding response:", JSON.stringify(response).substring(0, 200));
      throw new Error("Invalid embedding response from OpenAI");
    }

    console.log(`Successfully generated embedding with ${embedding.length} dimensions`);
    return embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        name: error.name,
        stack: error.stack?.substring(0, 500)
      });
    }
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
