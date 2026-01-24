import { Resend } from "resend";
import { config } from "@/lib/config";
import { sendEmailViaGraph } from "./graph-sender";
import { isGraphConfigured } from "./graph-client";

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Get the currently configured email provider
 */
export function getEmailProvider(): "resend" | "graph" {
  return config.email.provider;
}

/**
 * Check if the current provider is properly configured
 */
export function isProviderConfigured(): boolean {
  const provider = getEmailProvider();

  if (provider === "graph") {
    return isGraphConfigured();
  }

  // Resend just needs an API key
  return !!config.email.resend.apiKey;
}

/**
 * Get provider-specific batch settings
 */
export function getProviderSettings(): {
  batchSize: number;
  rateLimitDelay: number;
} {
  const provider = getEmailProvider();

  if (provider === "graph") {
    // Graph API has stricter rate limits
    return {
      batchSize: 10,
      rateLimitDelay: 2000, // 2 seconds between batches
    };
  }

  // Resend defaults
  return {
    batchSize: config.email.batchSize,
    rateLimitDelay: config.email.rateLimitDelay,
  };
}

/**
 * Send email using the configured provider
 * Routes to either Resend or Microsoft Graph based on EMAIL_PROVIDER env var
 */
export async function sendEmailViaProvider(
  to: string,
  subject: string,
  html: string
): Promise<SendEmailResult> {
  const provider = getEmailProvider();

  if (provider === "graph") {
    return sendEmailViaGraph(to, subject, html);
  }

  // Default to Resend
  return sendEmailViaResend(to, subject, html);
}

/**
 * Send email via Resend
 */
async function sendEmailViaResend(
  to: string,
  subject: string,
  html: string
): Promise<SendEmailResult> {
  try {
    const resend = new Resend(config.email.resend.apiKey);

    const { data, error } = await resend.emails.send({
      from: `${config.email.from.name} <${config.email.from.email}>`,
      to,
      subject,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error("Error sending email via Resend:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
