import { prisma } from "@/lib/db";
import { fetchAllRSSFeeds } from "./rss-collector";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { checkForDuplicates } from "./deduplicator";
import {
  scoreArticleRelevance,
  summarizeArticle,
  categorizeArticle,
} from "@/lib/ai/claude";
import { config } from "@/lib/config";

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
 */
export async function runCurationPipeline(): Promise<CurationResult> {
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
    const articles = await fetchAllRSSFeeds();
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
          embedding
        );

        if (duplicateCheck.isDuplicate) {
          console.log(`  ⊘ Duplicate detected (${duplicateCheck.reason})`);
          result.duplicates++;
          continue;
        }

        // Score article relevance
        const relevanceScore = await scoreArticleRelevance(
          article.title,
          article.content
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
            },
          });

          continue;
        }

        // Generate summary for high-scoring articles
        console.log(`  ✍️ Generating summary...`);
        const summary = await summarizeArticle(article.title, article.content);

        // Categorize article
        const categories = await categorizeArticle(
          article.title,
          article.content
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

/**
 * Streaming version of curation pipeline
 * Sends progress updates via callback to prevent timeouts
 */
export async function runCurationPipelineWithStreaming(
  onProgress: (update: any) => void
): Promise<CurationResult> {
  const result: CurationResult = {
    total: 0,
    processed: 0,
    duplicates: 0,
    lowScore: 0,
    curated: 0,
    errors: [],
  };

  try {
    onProgress({ stage: "fetch", message: "Fetching RSS feeds..." });

    // Step 1: Fetch all RSS feeds
    const articles = await fetchAllRSSFeeds();
    result.total = articles.length;

    onProgress({
      stage: "fetch_complete",
      message: `Fetched ${articles.length} articles`,
      total: articles.length,
    });

    // Step 2: Process each article
    for (let i = 0; i < articles.length; i++) {
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

        // Check for duplicates
        const duplicateCheck = await checkForDuplicates(
          article.link,
          embedding
        );

        if (duplicateCheck.isDuplicate) {
          onProgress({
            stage: "duplicate",
            message: `Duplicate detected: ${article.title.substring(0, 50)}`,
          });
          result.duplicates++;
          continue;
        }

        // Score article relevance
        const relevanceScore = await scoreArticleRelevance(
          article.title,
          article.content
        );

        onProgress({
          stage: "scored",
          message: `Score: ${relevanceScore}/10`,
          score: relevanceScore,
        });

        // Skip low-scoring articles
        if (relevanceScore < config.curation.relevanceThreshold) {
          onProgress({
            stage: "rejected",
            message: `Low score, rejecting: ${article.title.substring(0, 50)}`,
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
            },
          });

          continue;
        }

        // Generate summary for high-scoring articles
        onProgress({
          stage: "summarizing",
          message: "Generating summary...",
        });

        const summary = await summarizeArticle(article.title, article.content);

        // Categorize article
        const categories = await categorizeArticle(
          article.title,
          article.content
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
          },
        });

        onProgress({
          stage: "curated",
          message: `Successfully curated: ${article.title.substring(0, 50)}`,
        });

        result.curated++;
        result.processed++;

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        const errorMsg = `Error processing "${article.title}": ${error instanceof Error ? error.message : "Unknown error"}`;
        onProgress({
          stage: "error",
          message: errorMsg,
        });
        result.errors.push(errorMsg);
        continue;
      }
    }

    onProgress({
      stage: "complete",
      message: "Curation pipeline complete",
      result,
    });

    return result;
  } catch (error) {
    const errorMsg = `Fatal error in curation pipeline: ${error instanceof Error ? error.message : "Unknown error"}`;
    onProgress({
      stage: "fatal_error",
      message: errorMsg,
    });
    result.errors.push(errorMsg);
    throw error;
  }
}

/**
 * Curate a single article manually
 */
export async function curateArticle(
  url: string,
  title: string,
  content: string
): Promise<{
  success: boolean;
  articleId?: string;
  error?: string;
  isDuplicate?: boolean;
  relevanceScore?: number;
}> {
  try {
    // Generate embedding
    const embedding = await generateEmbedding(`${title}\n\n${content}`);

    // Check for duplicates
    const duplicateCheck = await checkForDuplicates(url, embedding);
    if (duplicateCheck.isDuplicate) {
      return {
        success: false,
        isDuplicate: true,
        error: "Article is a duplicate",
      };
    }

    // Score relevance
    const relevanceScore = await scoreArticleRelevance(title, content);

    // Generate summary if score is high enough
    let summary: string | undefined;
    let categories: string[] = [];

    if (relevanceScore >= config.curation.relevanceThreshold) {
      summary = await summarizeArticle(title, content);
      categories = await categorizeArticle(title, content);
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
