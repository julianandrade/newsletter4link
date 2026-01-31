/**
 * SharePoint Authentication Module
 *
 * Uses MSAL certificate-based authentication for Microsoft Graph API access.
 * This is the recommended auth method as legacy add-in auth is retiring April 2026.
 *
 * Required environment variables:
 * - SHAREPOINT_TENANT_ID: Azure AD tenant ID
 * - SHAREPOINT_CLIENT_ID: App registration client ID
 * - SHAREPOINT_CERTIFICATE_THUMBPRINT: Certificate thumbprint
 * - SHAREPOINT_CERTIFICATE_PRIVATE_KEY: PEM-encoded private key
 * - SHAREPOINT_SITE_URL: Target SharePoint site URL
 */

import { ConfidentialClientApplication, Configuration } from "@azure/msal-node";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

// Cache the MSAL client instance
let msalClient: ConfidentialClientApplication | null = null;

/**
 * Check if SharePoint integration is configured
 */
export function isSharePointConfigured(): boolean {
  return !!(
    process.env.SHAREPOINT_TENANT_ID &&
    process.env.SHAREPOINT_CLIENT_ID &&
    process.env.SHAREPOINT_CERTIFICATE_THUMBPRINT &&
    process.env.SHAREPOINT_CERTIFICATE_PRIVATE_KEY &&
    process.env.SHAREPOINT_SITE_URL
  );
}

/**
 * Get SharePoint configuration from environment
 */
export function getSharePointConfig() {
  return {
    tenantId: process.env.SHAREPOINT_TENANT_ID || "",
    clientId: process.env.SHAREPOINT_CLIENT_ID || "",
    thumbprint: process.env.SHAREPOINT_CERTIFICATE_THUMBPRINT || "",
    privateKey: process.env.SHAREPOINT_CERTIFICATE_PRIVATE_KEY || "",
    siteUrl: process.env.SHAREPOINT_SITE_URL || "",
  };
}

/**
 * Get or create MSAL client instance
 */
function getMsalClient(): ConfidentialClientApplication {
  if (msalClient) {
    return msalClient;
  }

  const config = getSharePointConfig();

  if (!config.tenantId || !config.clientId || !config.thumbprint || !config.privateKey) {
    throw new Error(
      "SharePoint authentication not configured. Required: SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CERTIFICATE_THUMBPRINT, SHAREPOINT_CERTIFICATE_PRIVATE_KEY"
    );
  }

  // Decode private key if base64 encoded (common in environment variables)
  let privateKey = config.privateKey;
  if (!privateKey.includes("-----BEGIN")) {
    try {
      privateKey = Buffer.from(privateKey, "base64").toString("utf-8");
    } catch {
      // Assume it's already PEM format
    }
  }

  const msalConfig: Configuration = {
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      clientCertificate: {
        thumbprint: config.thumbprint,
        privateKey: privateKey,
      },
    },
  };

  msalClient = new ConfidentialClientApplication(msalConfig);
  return msalClient;
}

/**
 * Get access token for Microsoft Graph API
 * Uses client credentials flow with certificate authentication
 */
export async function getAccessToken(): Promise<string> {
  const client = getMsalClient();

  const result = await client.acquireTokenByClientCredential({
    scopes: [GRAPH_SCOPE],
  });

  if (!result || !result.accessToken) {
    throw new Error("Failed to acquire access token from MSAL");
  }

  return result.accessToken;
}

/**
 * Parse site URL to extract hostname and site path
 * e.g., "https://contoso.sharepoint.com/sites/newsletter-archive"
 * returns { hostname: "contoso.sharepoint.com", sitePath: "/sites/newsletter-archive" }
 */
export function parseSiteUrl(siteUrl: string): { hostname: string; sitePath: string } {
  const url = new URL(siteUrl);
  return {
    hostname: url.hostname,
    sitePath: url.pathname,
  };
}
