/**
 * SharePoint Graph API Client
 *
 * Wraps Microsoft Graph API calls for SharePoint operations.
 * Handles site pages, document libraries, and assets.
 */

import { Client, ResponseType } from "@microsoft/microsoft-graph-client";
import { getAccessToken, getSharePointConfig, parseSiteUrl } from "./auth";

// Cache site ID to avoid repeated lookups
let cachedSiteId: string | null = null;

/**
 * Create authenticated Graph client
 */
async function getGraphClient(): Promise<Client> {
  const accessToken = await getAccessToken();

  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

/**
 * Get SharePoint site ID from configured site URL
 */
export async function getSiteId(): Promise<string> {
  if (cachedSiteId) {
    return cachedSiteId;
  }

  const config = getSharePointConfig();
  const { hostname, sitePath } = parseSiteUrl(config.siteUrl);

  const client = await getGraphClient();

  // Get site by hostname and path
  const site = await client
    .api(`/sites/${hostname}:${sitePath}`)
    .get();

  cachedSiteId = site.id;
  return site.id;
}

/**
 * Create a new site page
 */
export async function createSitePage(options: {
  title: string;
  name: string; // URL-safe page name (e.g., "week-05-2026")
  webParts: WebPart[];
}): Promise<{ id: string; webUrl: string }> {
  const siteId = await getSiteId();
  const client = await getGraphClient();

  // Create the page
  const page = await client
    .api(`/sites/${siteId}/pages`)
    .post({
      "@odata.type": "#microsoft.graph.sitePage",
      name: `${options.name}.aspx`,
      title: options.title,
      pageLayout: "article",
      showComments: false,
      showRecommendedPages: false,
      canvasLayout: {
        horizontalSections: [
          {
            layout: "fullWidth",
            columns: [
              {
                width: 12,
                webparts: options.webParts,
              },
            ],
          },
        ],
      },
    });

  return {
    id: page.id,
    webUrl: page.webUrl,
  };
}

/**
 * Publish a draft page
 */
export async function publishPage(pageId: string): Promise<void> {
  const siteId = await getSiteId();
  const client = await getGraphClient();

  await client
    .api(`/sites/${siteId}/pages/${pageId}/publish`)
    .post({});
}

/**
 * Delete a site page
 */
export async function deletePage(pageId: string): Promise<void> {
  const siteId = await getSiteId();
  const client = await getGraphClient();

  await client
    .api(`/sites/${siteId}/pages/${pageId}`)
    .delete();
}

/**
 * Upload a file to the site's document library
 */
export async function uploadAsset(options: {
  folderPath: string; // e.g., "Newsletter Assets/2026/images"
  fileName: string;
  content: Buffer;
  contentType?: string;
}): Promise<{ webUrl: string; id: string }> {
  const siteId = await getSiteId();
  const client = await getGraphClient();

  // Ensure folder path doesn't start with /
  const folderPath = options.folderPath.replace(/^\//, "");
  const filePath = `${folderPath}/${options.fileName}`;

  // Upload file using put
  const response = await client
    .api(`/sites/${siteId}/drive/root:/${filePath}:/content`)
    .putStream(options.content);

  return {
    id: response.id,
    webUrl: response.webUrl,
  };
}

/**
 * Create a folder in the document library
 */
export async function createFolder(folderPath: string): Promise<{ id: string }> {
  const siteId = await getSiteId();
  const client = await getGraphClient();

  // Ensure path doesn't start with /
  const path = folderPath.replace(/^\//, "");
  const parts = path.split("/");
  const folderName = parts.pop() || "";
  const parentPath = parts.join("/");

  const parentApi = parentPath
    ? `/sites/${siteId}/drive/root:/${parentPath}:/children`
    : `/sites/${siteId}/drive/root/children`;

  try {
    const response = await client.api(parentApi).post({
      name: folderName,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    });
    return { id: response.id };
  } catch (error: any) {
    // Folder may already exist - that's ok
    if (error.statusCode === 409) {
      const existingFolder = await client
        .api(`/sites/${siteId}/drive/root:/${path}`)
        .get();
      return { id: existingFolder.id };
    }
    throw error;
  }
}

/**
 * Ensure a nested folder path exists, creating folders as needed
 */
export async function ensureFolderPath(folderPath: string): Promise<void> {
  const parts = folderPath.replace(/^\//, "").split("/");
  let currentPath = "";

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    await createFolder(currentPath);
  }
}

/**
 * Check if a page exists by name
 */
export async function pageExists(pageName: string): Promise<boolean> {
  const siteId = await getSiteId();
  const client = await getGraphClient();

  try {
    await client
      .api(`/sites/${siteId}/pages`)
      .filter(`name eq '${pageName}.aspx'`)
      .get();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get page by ID
 */
export async function getPage(pageId: string): Promise<any> {
  const siteId = await getSiteId();
  const client = await getGraphClient();

  return client
    .api(`/sites/${siteId}/pages/${pageId}`)
    .get();
}

// Types for SharePoint web parts
export interface WebPart {
  "@odata.type": string;
  [key: string]: any;
}

export interface TextWebPart extends WebPart {
  "@odata.type": "#microsoft.graph.textWebPart";
  innerHtml: string;
}

export function createTextWebPart(html: string): TextWebPart {
  return {
    "@odata.type": "#microsoft.graph.textWebPart",
    innerHtml: html,
  };
}
