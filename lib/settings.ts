import { prisma } from "@/lib/db";

export interface AppSettings {
  relevanceThreshold: number;
  maxArticlesPerEdition: number;
  vectorSimilarityThreshold: number;
  articleMaxAgeDays: number;
  aiModel: string;
  embeddingModel: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  relevanceThreshold: 6.0,
  maxArticlesPerEdition: 10,
  vectorSimilarityThreshold: 0.85,
  articleMaxAgeDays: 7,
  aiModel: "claude-3-5-sonnet-20241022",
  embeddingModel: "text-embedding-ada-002",
};

/**
 * Get application settings from database (singleton pattern)
 * Creates default settings if none exist
 */
export async function getSettings(): Promise<AppSettings> {
  let settings = await prisma.settings.findUnique({
    where: { id: "default" },
  });

  if (!settings) {
    settings = await prisma.settings.create({
      data: {
        id: "default",
        ...DEFAULT_SETTINGS,
      },
    });
  }

  return {
    relevanceThreshold: settings.relevanceThreshold,
    maxArticlesPerEdition: settings.maxArticlesPerEdition,
    vectorSimilarityThreshold: settings.vectorSimilarityThreshold,
    articleMaxAgeDays: settings.articleMaxAgeDays,
    aiModel: settings.aiModel,
    embeddingModel: settings.embeddingModel,
  };
}

/**
 * Update application settings
 */
export async function updateSettings(
  updates: Partial<AppSettings>
): Promise<AppSettings> {
  const settings = await prisma.settings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      ...DEFAULT_SETTINGS,
      ...updates,
    },
    update: updates,
  });

  return {
    relevanceThreshold: settings.relevanceThreshold,
    maxArticlesPerEdition: settings.maxArticlesPerEdition,
    vectorSimilarityThreshold: settings.vectorSimilarityThreshold,
    articleMaxAgeDays: settings.articleMaxAgeDays,
    aiModel: settings.aiModel,
    embeddingModel: settings.embeddingModel,
  };
}

/**
 * Get available AI models
 */
export const AI_MODELS = [
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet (Recommended)" },
  { value: "claude-3-opus-20240229", label: "Claude 3 Opus" },
  { value: "claude-3-sonnet-20240229", label: "Claude 3 Sonnet" },
  { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku (Fast)" },
];

/**
 * Get available embedding models
 */
export const EMBEDDING_MODELS = [
  { value: "text-embedding-ada-002", label: "Ada 002 (Recommended)" },
  { value: "text-embedding-3-small", label: "Embedding 3 Small" },
  { value: "text-embedding-3-large", label: "Embedding 3 Large" },
];
