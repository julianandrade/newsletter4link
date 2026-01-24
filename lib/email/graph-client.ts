import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { config } from "@/lib/config";

let graphClient: Client | null = null;

/**
 * Get or create Microsoft Graph client for sending emails
 * Uses app-only authentication with client credentials
 */
export function getGraphClient(): Client {
  if (graphClient) {
    return graphClient;
  }

  const { tenantId, clientId, clientSecret } = config.email.graph;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error(
      "Microsoft Graph configuration missing. " +
        "Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET environment variables."
    );
  }

  // Create credential using client secret
  const credential = new ClientSecretCredential(
    tenantId,
    clientId,
    clientSecret
  );

  // Create auth provider with Mail.Send scope
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  // Create Graph client
  graphClient = Client.initWithMiddleware({
    authProvider,
  });

  return graphClient;
}

/**
 * Get the sender email address for Graph API
 */
export function getGraphSenderEmail(): string {
  const { senderEmail } = config.email.graph;

  if (!senderEmail) {
    throw new Error(
      "Graph sender email not configured. Set GRAPH_SENDER_EMAIL environment variable."
    );
  }

  return senderEmail;
}

/**
 * Check if Graph API is properly configured
 */
export function isGraphConfigured(): boolean {
  const { tenantId, clientId, clientSecret, senderEmail } = config.email.graph;
  return !!(tenantId && clientId && clientSecret && senderEmail);
}
