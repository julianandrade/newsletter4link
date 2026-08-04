import { prisma } from "@/lib/db";
import { TenantClient } from "@/lib/db/tenant";
import { DEFAULT_AI_MODEL, DEFAULT_EMBEDDING_MODEL } from "@/lib/ai-models";

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
  theme: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  relevanceThreshold: 6.0,
  maxArticlesPerEdition: 10,
  vectorSimilarityThreshold: 0.85,
  articleMaxAgeDays: 7,
  aiModel: DEFAULT_AI_MODEL,
  embeddingModel: DEFAULT_EMBEDDING_MODEL,
  brandVoicePrompt: null,
};

const DEFAULT_ORG_SETTINGS: OrgSettingsData = {
  ...DEFAULT_SETTINGS,
  logoUrl: null,
  bannerUrl: null,
  primaryColor: "#0066cc",
  fromName: null,
  replyToEmail: null,
  theme: "linkroad-dark",
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
    theme: settings.theme ?? DEFAULT_ORG_SETTINGS.theme,
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
    theme: settings.theme ?? DEFAULT_ORG_SETTINGS.theme,
  };
}

// Re-exported from lib/ai-models so server code and the settings screen share
// one list. Import from "@/lib/ai-models" directly in new code.
export { AI_MODELS, LEGACY_AI_MODELS, EMBEDDING_MODELS } from "@/lib/ai-models";
