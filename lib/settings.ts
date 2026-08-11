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
  /**
   * RQ-006: what grounds and frames the generated prose.
   *
   * Returned here since 11 August 2026. All three were read by
   * `lib/rewrite/pipeline.ts` and absent from this shape, so the settings screen could
   * not show them and `PUT /api/settings` could not change them.
   */
  orgContextPrompt: string | null;
  rewriteLanguage: string;
  relevanceHeading: string;
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
  orgContextPrompt: null,
  // The same defaults the column carries and the pipeline falls back to.
  rewriteLanguage: "pt-PT",
  relevanceHeading: "Relevancia para a Link",
};

/**
 * One row to one response shape, in one place.
 *
 * `getOrgSettings` and `updateOrgSettings` both return this, and they used to build it
 * with two hand-written field lists. Adding a column then meant remembering both, and a
 * field returned by the read but not the write is a screen that shows the new value until
 * the next save silently drops it.
 */
function toOrgSettings(row: {
  relevanceThreshold: number;
  maxArticlesPerEdition: number;
  vectorSimilarityThreshold: number;
  articleMaxAgeDays: number;
  aiModel: string;
  embeddingModel: string;
  brandVoicePrompt: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  primaryColor: string | null;
  fromName: string | null;
  replyToEmail: string | null;
  theme: string | null;
  orgContextPrompt: string | null;
  rewriteLanguage: string;
  relevanceHeading: string;
}): OrgSettingsData {
  return {
    relevanceThreshold: row.relevanceThreshold,
    maxArticlesPerEdition: row.maxArticlesPerEdition,
    vectorSimilarityThreshold: row.vectorSimilarityThreshold,
    articleMaxAgeDays: row.articleMaxAgeDays,
    aiModel: row.aiModel,
    embeddingModel: row.embeddingModel,
    brandVoicePrompt: row.brandVoicePrompt,
    logoUrl: row.logoUrl,
    bannerUrl: row.bannerUrl,
    primaryColor: row.primaryColor,
    fromName: row.fromName,
    replyToEmail: row.replyToEmail,
    theme: row.theme ?? DEFAULT_ORG_SETTINGS.theme,
    orgContextPrompt: row.orgContextPrompt,
    rewriteLanguage: row.rewriteLanguage,
    relevanceHeading: row.relevanceHeading,
  };
}

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

  return toOrgSettings(settings);
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

  return toOrgSettings(settings);
}

// Re-exported from lib/ai-models so server code and the settings screen share
// one list. Import from "@/lib/ai-models" directly in new code.
export { AI_MODELS, LEGACY_AI_MODELS, EMBEDDING_MODELS } from "@/lib/ai-models";
