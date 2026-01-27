import { prisma } from "@/lib/db";
import { fetchAllRSSFeeds, fetchRSSFeedsByIds } from "./rss-collector";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { checkForDuplicates } from "./deduplicator";
import {
  scoreArticleRelevance,
  summarizeArticle,
  categorizeArticle,
} from "@/lib/ai/claude";
import { config } from "@/lib/config";
import { getSettings, AppSettings } from "@/lib/settings";
import {
  updateJobStats,
  addJobLog,
  completeJob,
  failJob,
  isJobCancelled,
} from "./job-manager";

export interface CurationResult {
  total: number;
  processed: number;
  duplicates: number;
  lowScore: number;
  curated: number;
  errors: string[];
}

/**
 * Main curation pipeline
 * Fetches RSS feeds, processes articles, and curates them
 * @param organizationId - The organization to run curation for
 */
export async function runCurationPipeline(organizationId: string): Promise<CurationResult> {
  const result: CurationResult = {
    total: 0,
    processed: 0,
    duplicates: 0,
    lowScore: 0,
    curated: 0,
    errors: [],
  };

  console.log("🚀 Starting curation pipeline...");

  try {
    // Step 1: Fetch all RSS feeds
    console.log("📡 Fetching RSS feeds...");
    const articles = await fetchAllRSSFeeds(7, organizationId);
    result.total = articles.length;
    console.log(`✓ Fetched ${articles.length} articles from RSS feeds`);

    // Step 2: Process each article
    for (const article of articles) {
      try {
        console.log(`Processing: ${article.title.substring(0, 50)}...`);

        // Generate embedding
        const embedding = await generateEmbedding(
          `${article.title}\n\n${article.content}`
        );

        // Check for duplicates
        const duplicateCheck = await checkForDuplicates(
          article.link,
          embedding,
          organizationId
        );

        if (duplicateCheck.isDuplicate) {
          console.log(`  ⊘ Duplicate detected (${duplicateCheck.reason})`);
          result.duplicates++;
          continue;
        }

        // Score article relevance
        const relevanceScore = await scoreArticleRelevance(
          article.title,
          article.content,
          null // brandVoicePrompt - not available in non-streaming pipeline
        );
        console.log(`  ⭐ Relevance score: ${relevanceScore}/10`);

        // Skip low-scoring articles
        if (relevanceScore < config.curation.relevanceThreshold) {
          console.log(`  ✗ Score too low, skipping`);
          result.lowScore++;

          // Still save to database but mark as rejected
          await prisma.article.create({
            data: {
              sourceUrl: article.link,
              title: article.title,
              content: article.content,
              author: article.author,
              publishedAt: article.publishedAt,
              embedding,
              relevanceScore,
              status: "REJECTED",
              category: [],
              organizationId,
            },
          });

          continue;
        }

        // Generate summary for high-scoring articles
        console.log(`  ✍️ Generating summary...`);
        const summary = await summarizeArticle(article.title, article.content, null);

        // Categorize article
        const categories = await categorizeArticle(
          article.title,
          article.content,
          null
        );

        // Save to database as pending review
        await prisma.article.create({
          data: {
            sourceUrl: article.link,
            title: article.title,
            content: article.content,
            author: article.author,
            publishedAt: article.publishedAt,
            embedding,
            relevanceScore,
            summary,
            category: categories,
            status: "PENDING_REVIEW",
            organizationId,
          },
        });

        console.log(`  ✓ Article curated successfully`);
        result.curated++;
        result.processed++;

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        const errorMsg = `Error processing "${article.title}": ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error(`  ✗ ${errorMsg}`);
        result.errors.push(errorMsg);
        continue;
      }
    }

    console.log("\n✅ Curation pipeline complete!");
    console.log(`📊 Results:`);
    console.log(`   Total articles found: ${result.total}`);
    console.log(`   Processed: ${result.processed}`);
    console.log(`   Curated (pending review): ${result.curated}`);
    console.log(`   Duplicates skipped: ${result.duplicates}`);
    console.log(`   Low score rejected: ${result.lowScore}`);
    console.log(`   Errors: ${result.errors.length}`);

    return result;
  } catch (error) {
    const errorMsg = `Fatal error in curation pipeline: ${error instanceof Error ? error.message : "Unknown error"}`;
    console.error(`❌ ${errorMsg}`);
    result.errors.push(errorMsg);
    throw error;
  }
}

export class CurationCancelledError extends Error {
  constructor() {
    super("Curation job was cancelled");
    this.name = "CurationCancelledError";
  }
}

/**
 * Streaming version of curation pipeline with job tracking
 * Sends progress updates via callback to prevent timeouts
 * @param onProgress - Callback for progress updates
 * @param organizationId - The organization to run curation for
 * @param jobId - Optional job ID for tracking
 * @param sourceIds - Optional array of RSS source IDs to filter (if empty/undefined, fetches all)
 */
export async function runCurationPipelineWithStreaming(
  onProgress: (update: any) => void,
  organizationId: string,
  jobId?: string,
  sourceIds?: string[]
): Promise<CurationResult> {
  const result: CurationResult = {
    total: 0,
    processed: 0,
    duplicates: 0,
    lowScore: 0,
    curated: 0,
    errors: [],
  };

  // Get settings from database
  let settings: AppSettings;
  try {
    settings = await getSettings(organizationId);
  } catch {
    // Fall back to config if settings fetch fails
    settings = {
      relevanceThreshold: config.curation.relevanceThreshold,
      maxArticlesPerEdition: config.curation.maxArticlesPerEdition,
      vectorSimilarityThreshold: config.curation.vectorSimilarityThreshold,
      articleMaxAgeDays: 7,
      aiModel: config.ai.anthropic.model,
      embeddingModel: config.ai.openai.embeddingModel,
      brandVoicePrompt: null,
    };
  }

  const log = async (level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) => {
    if (jobId) {
      await addJobLog(jobId, level, message, data);
    }
  };

  try {
    const feedsDescription = sourceIds && sourceIds.length > 0
      ? `${sourceIds.length} selected feed(s)`
      : "all feeds";
    onProgress({ stage: "fetch", message: `Fetching ${feedsDescription}...` });
    await log("info", `Starting curation pipeline for ${feedsDescription}`);

    // Step 1: Fetch RSS feeds (filtered if sourceIds provided)
    const articles = sourceIds && sourceIds.length > 0
      ? await fetchRSSFeedsByIds(sourceIds, settings.articleMaxAgeDays, organizationId)
      : await fetchAllRSSFeeds(settings.articleMaxAgeDays, organizationId);
    result.total = articles.length;

    if (jobId) {
      await updateJobStats(jobId, { totalFound: articles.length });
    }

    onProgress({
      stage: "fetch_complete",
      message: `Fetched ${articles.length} articles`,
      total: articles.length,
    });
    await log("info", `Fetched ${articles.length} articles from RSS feeds`, {
      articleTitles: articles.slice(0, 20).map((a) => a.title), // Log first 20 titles
      truncated: articles.length > 20,
    });

    // Step 2: Process each article
    for (let i = 0; i < articles.length; i++) {
      // Check for cancellation before each article
      if (jobId && await isJobCancelled(jobId)) {
        onProgress({
          stage: "cancelled",
          message: "Curation cancelled by user",
        });
        throw new CurationCancelledError();
      }

      const article = articles[i];

      try {
        onProgress({
          stage: "processing",
          message: `Processing article ${i + 1}/${articles.length}: ${article.title.substring(0, 50)}...`,
          current: i + 1,
          total: articles.length,
        });

        // Generate embedding
        const embedding = await generateEmbedding(
          `${article.title}\n\n${article.content}`
        );

        // Validate embedding
        if (!Array.isArray(embedding) || embedding.length === 0) {
          throw new Error("Invalid embedding generated");
        }

        // Check for duplicates
        const duplicateCheck = await checkForDuplicates(
          article.link,
          embedding,
          organizationId,
          settings.vectorSimilarityThreshold
        );

        if (duplicateCheck.isDuplicate) {
          onProgress({
            stage: "duplicate",
            message: `Duplicate detected: ${article.title.substring(0, 50)}`,
          });
          await log("info", `Duplicate: ${article.title.substring(0, 80)}`, {
            reason: duplicateCheck.reason,
            sourceUrl: article.link,
            sourceName: article.sourceName,
          });
          result.duplicates++;
          if (jobId) {
            await updateJobStats(jobId, { duplicates: result.duplicates });
          }
          continue;
        }

        // Score article relevance
        const relevanceScore = await scoreArticleRelevance(
          article.title,
          article.content,
          settings.brandVoicePrompt
        );

        onProgress({
          stage: "scored",
          message: `Score: ${relevanceScore}/10`,
          score: relevanceScore,
        });

        // Skip low-scoring articles using dynamic threshold
        if (relevanceScore < settings.relevanceThreshold) {
          onProgress({
            stage: "rejected",
            message: `Low score, rejecting: ${article.title.substring(0, 50)}`,
          });
          await log("info", `Rejected (score ${relevanceScore}): ${article.title.substring(0, 80)}`, {
            score: relevanceScore,
            threshold: settings.relevanceThreshold,
            sourceUrl: article.link,
            sourceName: article.sourceName,
          });
          result.lowScore++;

          // Still save to database but mark as rejected
          await prisma.article.create({
            data: {
              sourceUrl: article.link,
              title: article.title,
              content: article.content,
              author: article.author,
              publishedAt: article.publishedAt,
              embedding,
              relevanceScore,
              status: "REJECTED",
              category: [],
              organizationId,
            },
          });

          if (jobId) {
            await updateJobStats(jobId, { lowScore: result.lowScore });
          }
          continue;
        }

        // Generate summary for high-scoring articles
        onProgress({
          stage: "summarizing",
          message: "Generating summary...",
        });

        const summary = await summarizeArticle(article.title, article.content, settings.brandVoicePrompt);

        // Categorize article
        const categories = await categorizeArticle(
          article.title,
          article.content,
          settings.brandVoicePrompt
        );

        // Save to database as pending review
        await prisma.article.create({
          data: {
            sourceUrl: article.link,
            title: article.title,
            content: article.content,
            author: article.author,
            publishedAt: article.publishedAt,
            embedding,
            relevanceScore,
            summary,
            category: categories,
            status: "PENDING_REVIEW",
            organizationId,
          },
        });

        onProgress({
          stage: "curated",
          message: `Successfully curated: ${article.title.substring(0, 50)}`,
        });
        await log("info", `Curated (score ${relevanceScore}): ${article.title.substring(0, 80)}`, {
          score: relevanceScore,
          categories,
          sourceUrl: article.link,
          sourceName: article.sourceName,
        });

        result.curated++;
        result.processed++;

        if (jobId) {
          await updateJobStats(jobId, {
            processed: result.processed,
            curated: result.curated,
          });
        }

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        if (error instanceof CurationCancelledError) {
          throw error;
        }
        const errorMsg = `Error processing "${article.title}": ${error instanceof Error ? error.message : "Unknown error"}`;
        onProgress({
          stage: "error",
          message: errorMsg,
        });
        result.errors.push(errorMsg);
        if (jobId) {
          await updateJobStats(jobId, { errorsCount: result.errors.length });
          await log("error", errorMsg);
        }
        continue;
      }
    }

    onProgress({
      stage: "complete",
      message: "Curation pipeline complete",
      result,
    });
    await log("info", "Curation pipeline completed successfully", {
      curated: result.curated,
      duplicates: result.duplicates,
      lowScore: result.lowScore,
      errors: result.errors.length,
    });

    if (jobId) {
      await completeJob(jobId);
    }

    return result;
  } catch (error) {
    if (error instanceof CurationCancelledError) {
      // Job already marked as cancelled in cancelJob()
      throw error;
    }

    const errorMsg = `Fatal error in curation pipeline: ${error instanceof Error ? error.message : "Unknown error"}`;
    onProgress({
      stage: "fatal_error",
      message: errorMsg,
    });
    result.errors.push(errorMsg);

    if (jobId) {
      await failJob(jobId, errorMsg);
    }

    throw error;
  }
}

/**
 * Curate a single article manually
 */
export async function curateArticle(
  url: string,
  title: string,
  content: string,
  organizationId: string
): Promise<{
  success: boolean;
  articleId?: string;
  error?: string;
  isDuplicate?: boolean;
  relevanceScore?: number;
}> {
  try {
    // Get settings for brand voice prompt
    const settings = await getSettings(organizationId);

    // Generate embedding
    const embedding = await generateEmbedding(`${title}\n\n${content}`);

    // Check for duplicates
    const duplicateCheck = await checkForDuplicates(url, embedding, organizationId);
    if (duplicateCheck.isDuplicate) {
      return {
        success: false,
        isDuplicate: true,
        error: "Article is a duplicate",
      };
    }

    // Score relevance
    const relevanceScore = await scoreArticleRelevance(title, content, settings.brandVoicePrompt);

    // Generate summary if score is high enough
    let summary: string | undefined;
    let categories: string[] = [];

    if (relevanceScore >= config.curation.relevanceThreshold) {
      summary = await summarizeArticle(title, content, settings.brandVoicePrompt);
      categories = await categorizeArticle(title, content, settings.brandVoicePrompt);
    }

    // Save to database
    const article = await prisma.article.create({
      data: {
        sourceUrl: url,
        title,
        content,
        publishedAt: new Date(),
        embedding,
        relevanceScore,
        summary,
        category: categories,
        status:
          relevanceScore >= config.curation.relevanceThreshold
            ? "PENDING_REVIEW"
            : "REJECTED",
        organizationId,
      },
    });

    return {
      success: true,
      articleId: article.id,
      relevanceScore,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
