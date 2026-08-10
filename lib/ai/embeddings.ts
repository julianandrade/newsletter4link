import OpenAI from "openai";
import { config } from "@/lib/config";
import { DEFAULT_EMBEDDING_MODEL } from "@/lib/ai-models";

/**
 * Built on first use, not on import.
 *
 * `new OpenAI({ apiKey: undefined })` throws, and this module is reachable from
 * `/api/cron/daily-collection` through `lib/curation/curator`, so Next evaluated it while
 * collecting page data and a missing key failed the **build** rather than the request.
 * Every Vercel preview deployment died that way, because `OPENAI_API_KEY` is set for
 * Production and not for Preview: PR #7 and PR #8 both went red from code that built and
 * deployed to production without complaint.
 *
 * A build should not need production credentials to compile a route it is not calling.
 * Deferring the constructor is what makes that true, and it costs nothing: the key is read
 * at the same moment it was before, the first time an embedding is actually generated.
 *
 * Same shape as `lib/inbound/extract.ts` and `lib/rewrite/generate.ts`, which reached it
 * from the other direction: the Anthropic SDK refuses to instantiate under a test runner.
 * Anthropic's constructor tolerates a missing key where OpenAI's does not, which is the
 * only reason those two files were enough and this one was missed.
 */
let client: OpenAI | null = null;

function openaiClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.ai.openai.apiKey });
  }
  return client;
}

/**
 * Generate embedding vector for text using OpenAI
 */
export async function generateEmbedding(
  text: string,
  // RQ-002: the organization's embedding model, which was stored and never used.
  embeddingModel: string = DEFAULT_EMBEDDING_MODEL
): Promise<number[]> {
  try {
    // Validate API key
    if (!config.ai.openai.apiKey || config.ai.openai.apiKey === 'undefined') {
      console.error("OpenAI API key is missing or undefined");
      throw new Error("OpenAI API key is not configured");
    }

    // Truncate text if too long (ada-002 has 8191 token limit)
    const truncatedText = text.substring(0, 8000);

    console.log(`Generating embedding for text (${truncatedText.length} chars)...`);

    // After the key check above, so a missing key still says so in our own words rather
    // than in the SDK's.
    const response = await openaiClient().embeddings.create({
      model: embeddingModel,
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
