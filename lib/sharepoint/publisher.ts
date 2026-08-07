/**
 * SharePoint Publisher
 *
 * Orchestrates the newsletter publishing flow to SharePoint.
 * Creates a page for each edition with full content.
 */

import { prisma } from "@/lib/db";
import { renderSourceFor } from "@/lib/editions/sent-snapshot";
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

    /**
     * The snapshot wins whenever there is one, as it does in the subscriber archive.
     *
     * This function is reachable from the Retry button, which only a sent edition shows.
     * Rebuilding from the current `Article` rows meant an editor could change a summary,
     * click Retry, and have the published page say something the mailed newsletter never
     * said. `include` above returns every scalar column, so `sentSnapshot` already arrives
     * with no change to the query.
     */
    const source = renderSourceFor(edition);

    /**
     * The image is still read from the live row, matched by name.
     *
     * The snapshot never captured project images, so there is no frozen answer to give;
     * best effort from the current row is better than dropping every picture from a
     * republished page. Absent when the project has since been renamed or deleted.
     */
    const imageByProjectName = new Map(
      edition.projects.map((ep) => [ep.project.name, ep.project.imageUrl])
    );

    // Build content for the page
    const content = {
      articles: source.articles.map((article) => ({
        title: article.title,
        summary: article.summary || "",
        sourceUrl: article.sourceUrl,
        category: article.category ?? [],
      })),
      projects: source.projects.map((project) => ({
        name: project.name,
        description: project.description,
        team: project.team ?? "",
        impact: project.impact || undefined,
        projectDate:
          project.projectDate instanceof Date
            ? project.projectDate.toISOString()
            : project.projectDate ?? "",
        imageUrl: imageByProjectName.get(project.name) || undefined,
      })),
      week: source.week,
      year: source.year,
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
