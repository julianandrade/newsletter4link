/**
 * SharePoint Publisher
 *
 * Orchestrates the newsletter publishing flow to SharePoint.
 * Creates a page for each edition with full content.
 */

import { prisma } from "@/lib/db";
import { isSharePointConfigured } from "./auth";
import {
  createSitePage,
  publishPage,
  ensureFolderPath,
  uploadAsset,
  pageExists,
} from "./client";
import { buildPageContent, buildPageTitle, buildPageName } from "./pageBuilder";

export interface PublishResult {
  success: boolean;
  sharePointUrl?: string;
  sharePointPageId?: string;
  error?: string;
}

/**
 * Publish an edition to SharePoint
 *
 * Creates a new page with the newsletter content and publishes it.
 * Updates the Edition record with SharePoint metadata.
 */
export async function publishToSharePoint(editionId: string): Promise<PublishResult> {
  // Check configuration
  if (!isSharePointConfigured()) {
    return {
      success: false,
      error: "SharePoint integration not configured",
    };
  }

  try {
    // Get edition with articles and projects
    const edition = await prisma.edition.findUnique({
      where: { id: editionId },
      include: {
        articles: {
          include: { article: true },
          orderBy: { order: "asc" },
        },
        projects: {
          include: { project: true },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!edition) {
      return {
        success: false,
        error: "Edition not found",
      };
    }

    // Build content for the page
    const content = {
      articles: edition.articles.map((ea) => ({
        title: ea.article.title,
        summary: ea.article.summary || "",
        sourceUrl: ea.article.sourceUrl,
        category: ea.article.category,
      })),
      projects: edition.projects.map((ep) => ({
        name: ep.project.name,
        description: ep.project.description,
        team: ep.project.team,
        impact: ep.project.impact || undefined,
        projectDate: ep.project.projectDate.toISOString(),
        imageUrl: ep.project.imageUrl || undefined,
      })),
      week: edition.week,
      year: edition.year,
    };

    // Generate page details
    const pageTitle = buildPageTitle(edition.week, edition.year);
    const pageName = buildPageName(edition.week, edition.year);
    const webParts = buildPageContent(content);

    // Ensure folder structure exists for organizing pages by year
    await ensureFolderPath(`Site Pages/${edition.year}`);

    // Check if page already exists (for retry scenarios)
    const exists = await pageExists(`${edition.year}/${pageName}`);
    if (exists && edition.sharePointPageId) {
      // Page already published - return existing info
      return {
        success: true,
        sharePointUrl: edition.sharePointUrl || undefined,
        sharePointPageId: edition.sharePointPageId,
      };
    }

    // Create the page
    const page = await createSitePage({
      title: pageTitle,
      name: `${edition.year}/${pageName}`,
      webParts,
    });

    // Publish the page
    await publishPage(page.id);

    // Update edition with SharePoint info
    await prisma.edition.update({
      where: { id: editionId },
      data: {
        sharePointUrl: page.webUrl,
        sharePointPageId: page.id,
        sharePointPublishedAt: new Date(),
        sharePointError: null,
      },
    });

    console.log(`SharePoint: Published edition ${editionId} to ${page.webUrl}`);

    return {
      success: true,
      sharePointUrl: page.webUrl,
      sharePointPageId: page.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`SharePoint publish error for edition ${editionId}:`, error);

    // Update edition with error
    try {
      await prisma.edition.update({
        where: { id: editionId },
        data: {
          sharePointError: errorMessage,
        },
      });
    } catch {
      // Ignore update error
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Upload an image asset to SharePoint for use in pages
 */
export async function uploadNewsletterImage(
  year: number,
  fileName: string,
  imageBuffer: Buffer,
  contentType: string = "image/png"
): Promise<string | null> {
  if (!isSharePointConfigured()) {
    return null;
  }

  try {
    await ensureFolderPath(`Newsletter Assets/${year}/images`);

    const result = await uploadAsset({
      folderPath: `Newsletter Assets/${year}/images`,
      fileName,
      content: imageBuffer,
      contentType,
    });

    return result.webUrl;
  } catch (error) {
    console.error("SharePoint image upload error:", error);
    return null;
  }
}

/**
 * Get SharePoint publishing status for an edition
 */
export async function getSharePointStatus(editionId: string): Promise<{
  published: boolean;
  url?: string;
  publishedAt?: Date;
  error?: string;
}> {
  const edition = await prisma.edition.findUnique({
    where: { id: editionId },
    select: {
      sharePointUrl: true,
      sharePointPageId: true,
      sharePointPublishedAt: true,
      sharePointError: true,
    },
  });

  if (!edition) {
    return { published: false, error: "Edition not found" };
  }

  return {
    published: !!edition.sharePointUrl,
    url: edition.sharePointUrl || undefined,
    publishedAt: edition.sharePointPublishedAt || undefined,
    error: edition.sharePointError || undefined,
  };
}
