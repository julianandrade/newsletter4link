/**
 * Industry Bootstrap Service
 *
 * Applies industry-specific templates when an organization is created.
 */

import { prisma } from "@/lib/db";
import { Industry, getIndustryConfig } from "./prompts";
import { getIndustryRssSources, getIndustrySearchTopics } from "./templates";

export interface BootstrapResult {
  rssSourcesCreated: number;
  searchTopicsCreated: number;
  brandVoiceCreated: boolean;
  settingsUpdated: boolean;
}

/**
 * Bootstrap an organization with industry-specific templates
 */
export async function bootstrapOrganization(
  organizationId: string,
  industry: Industry
): Promise<BootstrapResult> {
  const result: BootstrapResult = {
    rssSourcesCreated: 0,
    searchTopicsCreated: 0,
    brandVoiceCreated: false,
    settingsUpdated: false,
  };

  const industryConfig = getIndustryConfig(industry);
  const rssSources = getIndustryRssSources(industry);
  const searchTopics = getIndustrySearchTopics(industry);

  // Create RSS sources
  for (const source of rssSources) {
    try {
      await prisma.rSSSource.create({
        data: {
          name: source.name,
          url: source.url,
          category: source.category,
          active: true,
          organizationId,
        },
      });
      result.rssSourcesCreated++;
    } catch (error) {
      // Skip duplicates or errors, continue with others
      console.warn(`Failed to create RSS source ${source.name}:`, error);
    }
  }

  // Create search topics
  for (const topic of searchTopics) {
    try {
      await prisma.searchTopic.create({
        data: {
          name: topic.name,
          query: topic.query,
          description: topic.description,
          schedule: topic.schedule,
          timeRange: "WEEK",
          providers: ["tavily"],
          isActive: true,
          organizationId,
        },
      });
      result.searchTopicsCreated++;
    } catch (error) {
      console.warn(`Failed to create search topic ${topic.name}:`, error);
    }
  }

  // Create default brand voice
  try {
    await prisma.brandVoice.create({
      data: {
        name: `${industryConfig.name} Professional`,
        personality: industryConfig.brandVoiceSuggestion,
        toneAttributes: ["professional", "informative", "insightful"],
        styleGuidelines: `Write for ${industryConfig.name.toLowerCase()} professionals. Focus on: ${industryConfig.keyTopics.join(", ")}.`,
        dos: [
          "Use industry-specific terminology appropriately",
          "Back claims with data when possible",
          "Focus on practical implications",
        ],
        donts: industryConfig.avoidTopics.map((topic) => `Don't cover: ${topic}`),
        useEmoji: false,
        greetings: ["Hello", "Good morning", "Welcome back"],
        closings: ["Until next time", "See you next week", "Stay informed"],
        isDefault: true,
        organizationId,
      },
    });
    result.brandVoiceCreated = true;
  } catch (error) {
    console.warn("Failed to create brand voice:", error);
  }

  // Update org settings with industry-specific scoring prompt
  try {
    await prisma.orgSettings.update({
      where: { organizationId },
      data: {
        brandVoicePrompt: industryConfig.scoringPrompt.slice(0, 500),
      },
    });
    result.settingsUpdated = true;
  } catch (error) {
    console.warn("Failed to update org settings:", error);
  }

  return result;
}

/**
 * Check if an organization has been bootstrapped
 */
export async function isOrganizationBootstrapped(organizationId: string): Promise<boolean> {
  const [rssCount, topicCount, voiceCount] = await Promise.all([
    prisma.rSSSource.count({ where: { organizationId } }),
    prisma.searchTopic.count({ where: { organizationId } }),
    prisma.brandVoice.count({ where: { organizationId } }),
  ]);

  return rssCount > 0 || topicCount > 0 || voiceCount > 0;
}

/**
 * Get bootstrap status for an organization
 */
export async function getBootstrapStatus(organizationId: string): Promise<{
  rssSources: number;
  searchTopics: number;
  brandVoices: number;
  isBootstrapped: boolean;
}> {
  const [rssSources, searchTopics, brandVoices] = await Promise.all([
    prisma.rSSSource.count({ where: { organizationId } }),
    prisma.searchTopic.count({ where: { organizationId } }),
    prisma.brandVoice.count({ where: { organizationId } }),
  ]);

  return {
    rssSources,
    searchTopics,
    brandVoices,
    isBootstrapped: rssSources > 0 || searchTopics > 0 || brandVoices > 0,
  };
}
