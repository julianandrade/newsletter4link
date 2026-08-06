import { prisma } from "@/lib/db";
import { fetchAllRSSFeeds, fetchRSSFeedsByIds } from "./rss-collector";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { resolveAiModels, UnusableModelError } from "@/lib/ai/model";
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

  // RQ-002: this path used the fixed model and the fixed relevance threshold,
  // so it disagreed with the streaming path on the same content.
  const settings = await getSettings(organizationId).catch(() => null);
  const { model, embeddingModel } = await resolveAiModels(organizationId);
  const relevanceThreshold =
    settings?.relevanceThreshold ?? config.curation.relevanceThreshold;

  try {
    // Step 1: Fetch all RSS feeds
    console.log("📡 Fetching RSS feeds...");
    const articles = await fetchAllRSSFeeds(
      settings?.articleMaxAgeDays ?? 7,
      organizationId
    );
    result.total = articles.length;
    console.log(`✓ Fetched ${articles.length} articles from RSS feeds`);

    // Step 2: Process each article
    for (const article of articles) {
      try {
        console.log(`Processing: ${article.title.substring(0, 50)}...`);

        // Generate embedding
        const embedding = await generateEmbedding(
          `${article.title}\n\n${article.content}`,
          embeddingModel
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
          settings?.brandVoicePrompt ?? null,
          model
        );
        console.log(`  ⭐ Relevance score: ${relevanceScore}/10`);

        // Skip low-scoring articles
        if (relevanceScore < relevanceThreshold) {
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
        const summary = await summarizeArticle(
          article.title,
          article.content,
          settings?.brandVoicePrompt ?? null,
          model
        );

        // Categorize article
        const categories = await categorizeArticle(
          article.title,
          article.content,
          settings?.brandVoicePrompt ?? null,
          model
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

  // RQ-002: the organization's models, resolved once for the whole run.
  const { model, embeddingModel } = await resolveAiModels(organizationId);

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

    /**
     * RQ-002 / Q7(a): record what this run actually used.
     *
     * Nothing recorded the model before, so there was no way to tell from
     * inside the product that the setting was inert. This goes into the run's
     * log stream rather than a column, which needs no migration and is visible
     * on the job detail screen; a column would make it queryable across runs
     * and is the open half of Q7.
     */
    await log("info", "Effective settings for this run", {
      model,
      embeddingModel,
      relevanceThreshold: settings.relevanceThreshold,
      articleMaxAgeDays: settings.articleMaxAgeDays,
      brandVoice: settings.brandVoicePrompt ? "set" : "none",
    });

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
          `${article.title}\n\n${article.content}`,
          embeddingModel
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
          settings.brandVoicePrompt,
          model
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

        const summary = await summarizeArticle(
          article.title,
          article.content,
          settings.brandVoicePrompt,
          model
        );

        // Categorize article
        const categories = await categorizeArticle(
          article.title,
          article.content,
          settings.brandVoicePrompt,
          // RQ-002: this call site was missed, so categorisation silently ran on
          // the default model while scoring and summarising used the
          // organization's. Found by reading a real run's logs.
          model
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
        /**
         * RQ-002 / Q6: a refused model fails the whole run rather than being
         * counted as one article's error. Continuing would repeat the same
         * rejection for every remaining article and report a run that processed
         * nothing as merely unlucky.
         */
        if (error instanceof UnusableModelError) {
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

    // RQ-002 / Q6: name the model, so the fix is obvious from the job screen
    // rather than needing the logs read.
    const errorMsg =
      error instanceof UnusableModelError
        ? `${error.message}. Choose a different model in Settings.`
        : `Fatal error in curation pipeline: ${error instanceof Error ? error.message : "Unknown error"}`;
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
  organizationId: string,
  options: {
    /**
     * Finding D4: true when `url` is the wrapper a newsletter used, because the redirect
     * chain would not resolve. Stored on the row so a screen can say so, rather than the
     * wrapper passing for the publisher's own address.
     */
    sourceUnresolved?: boolean;
  } = {}
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
    // RQ-002
    const { model, embeddingModel } = await resolveAiModels(organizationId);

    // Generate embedding
    const embedding = await generateEmbedding(`${title}\n\n${content}`, embeddingModel);

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
    const relevanceScore = await scoreArticleRelevance(
      title,
      content,
      settings.brandVoicePrompt,
      model
    );

    // Generate summary if score is high enough
    let summary: string | undefined;
    let categories: string[] = [];

    // RQ-002: was config.curation.relevanceThreshold, three lines below a read
    // of settings.brandVoicePrompt in the same function.
    if (relevanceScore >= settings.relevanceThreshold) {
      summary = await summarizeArticle(title, content, settings.brandVoicePrompt, model);
      categories = await categorizeArticle(title, content, settings.brandVoicePrompt, model);
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
          relevanceScore >= settings.relevanceThreshold
            ? "PENDING_REVIEW"
            : "REJECTED",
        organizationId,
        // Finding D4: whether `url` is the publisher's address or a newsletter's wrapper.
        sourceUnresolved: options.sourceUnresolved ?? false,
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
