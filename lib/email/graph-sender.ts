import { getGraphClient, getGraphSenderEmail } from "./graph-client";

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send email via Microsoft Graph API
 * Uses the configured O365 account as sender
 */
export async function sendEmailViaGraph(
  to: string,
  subject: string,
  html: string,
  retries = 3
): Promise<SendEmailResult> {
  const client = getGraphClient();
  const senderEmail = getGraphSenderEmail();

  const message = {
    subject,
    body: {
      contentType: "HTML",
      content: html,
    },
    toRecipients: [
      {
        emailAddress: {
          address: to,
        },
      },
    ],
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Send email using Graph API
      // POST /users/{sender}/sendMail
      await client.api(`/users/${senderEmail}/sendMail`).post({
        message,
        saveToSentItems: true,
      });

      // Graph sendMail doesn't return a messageId, generate one for tracking
      const messageId = `graph-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      return { success: true, messageId };
    } catch (error: unknown) {
      const graphError = error as { statusCode?: number; message?: string };

      // Handle rate limiting (429)
      if (graphError.statusCode === 429) {
        if (attempt < retries) {
          // Exponential backoff: 2s, 4s, 8s
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(
            `Graph API rate limited, retrying in ${delay}ms (attempt ${attempt}/${retries})`
          );
          await sleep(delay);
          continue;
        }
      }

      // Handle throttling or transient errors (503, 504)
      if (graphError.statusCode === 503 || graphError.statusCode === 504) {
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(
            `Graph API service unavailable, retrying in ${delay}ms (attempt ${attempt}/${retries})`
          );
          await sleep(delay);
          continue;
        }
      }

      console.error("Graph API error:", error);
      return {
        success: false,
        error:
          graphError.message ||
          (error instanceof Error ? error.message : "Unknown Graph API error"),
      };
    }
  }

  return { success: false, error: "Max retries exceeded" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
