import { prisma } from "@/lib/db";
import { TenantClient } from "@/lib/db/tenant";

export interface AppSettings {
  relevanceThreshold: number;
  maxArticlesPerEdition: number;
  vectorSimilarityThreshold: number;
  articleMaxAgeDays: number;
  aiModel: string;
  embeddingModel: string;
  brandVoicePrompt: string | null;
}

export interface OrgSettingsData extends AppSettings {
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string | null;
  fromName: string | null;
  replyToEmail: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  relevanceThreshold: 6.0,
  maxArticlesPerEdition: 10,
  vectorSimilarityThreshold: 0.85,
  articleMaxAgeDays: 7,
  aiModel: "claude-sonnet-4-20250514",
  embeddingModel: "text-embedding-ada-002",
  brandVoicePrompt: null,
};

const DEFAULT_ORG_SETTINGS: OrgSettingsData = {
  ...DEFAULT_SETTINGS,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: "#0066cc",
  fromName: null,
  replyToEmail: null,
};

/**
 * Get settings from database
 * If organizationId is provided, uses OrgSettings; otherwise falls back to global Settings
 */
export async function getSettings(organizationId?: string): Promise<AppSettings> {
  // If organizationId provided, try to get org-specific settings
  if (organizationId) {
    const orgSettings = await prisma.orgSettings.findUnique({
      where: { organizationId },
    });

    if (orgSettings) {
      return {
        relevanceThreshold: orgSettings.relevanceThreshold,
        maxArticlesPerEdition: orgSettings.maxArticlesPerEdition,
        vectorSimilarityThreshold: orgSettings.vectorSimilarityThreshold,
        articleMaxAgeDays: orgSettings.articleMaxAgeDays,
        aiModel: orgSettings.aiModel,
        embeddingModel: orgSettings.embeddingModel,
        brandVoicePrompt: orgSettings.brandVoicePrompt,
      };
    }
  }

  // Fall back to global settings
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
    brandVoicePrompt: settings.brandVoicePrompt,
  };
}

/**
 * Update global platform settings
 * @deprecated Use updateOrgSettings for multi-tenant apps
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
    brandVoicePrompt: settings.brandVoicePrompt,
  };
}

/**
 * Get organization-specific settings (tenant-scoped)
 * Creates default settings if none exist
 */
export async function getOrgSettings(db: TenantClient): Promise<OrgSettingsData> {
  let settings = await db.orgSettings.findUnique();

  if (!settings) {
    settings = await db.orgSettings.upsert({
      update: {},
    });
  }

  return {
    relevanceThreshold: settings.relevanceThreshold,
    maxArticlesPerEdition: settings.maxArticlesPerEdition,
    vectorSimilarityThreshold: settings.vectorSimilarityThreshold,
    articleMaxAgeDays: settings.articleMaxAgeDays,
    aiModel: settings.aiModel,
    embeddingModel: settings.embeddingModel,
    brandVoicePrompt: settings.brandVoicePrompt,
    logoUrl: settings.logoUrl,
    bannerUrl: settings.bannerUrl,
    primaryColor: settings.primaryColor,
    fromName: settings.fromName,
    replyToEmail: settings.replyToEmail,
  };
}

/**
 * Update organization-specific settings (tenant-scoped)
 */
export async function updateOrgSettings(
  db: TenantClient,
  updates: Partial<OrgSettingsData>
): Promise<OrgSettingsData> {
  const settings = await db.orgSettings.upsert({
    update: updates,
  });

  return {
    relevanceThreshold: settings.relevanceThreshold,
    maxArticlesPerEdition: settings.maxArticlesPerEdition,
    vectorSimilarityThreshold: settings.vectorSimilarityThreshold,
    articleMaxAgeDays: settings.articleMaxAgeDays,
    aiModel: settings.aiModel,
    embeddingModel: settings.embeddingModel,
    brandVoicePrompt: settings.brandVoicePrompt,
    logoUrl: settings.logoUrl,
    bannerUrl: settings.bannerUrl,
    primaryColor: settings.primaryColor,
    fromName: settings.fromName,
    replyToEmail: settings.replyToEmail,
  };
}

/**
 * Get available AI models
 */
export const AI_MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Recommended)" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku (Fast)" },
];

/**
 * Get available embedding models
 */
export const EMBEDDING_MODELS = [
  { value: "text-embedding-ada-002", label: "Ada 002 (Recommended)" },
  { value: "text-embedding-3-small", label: "Embedding 3 Small" },
  { value: "text-embedding-3-large", label: "Embedding 3 Large" },
];
