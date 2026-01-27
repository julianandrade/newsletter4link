import { render } from "@react-email/components";
import NewsletterEmail from "@/emails/newsletter";
import { prisma } from "@/lib/db";
import { sendEmailViaProvider, getProviderSettings } from "./provider";

interface Article {
  title: string;
  summary: string;
  sourceUrl: string;
  category: string[];
}

interface Project {
  name: string;
  description: string;
  team: string;
  impact?: string;
  projectDate: string;
  imageUrl?: string;
}

interface NewsletterData {
  articles: Article[];
  projects: Project[];
  week: number;
  year: number;
}

/**
 * Send email to a single recipient using the configured provider
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  return sendEmailViaProvider(to, subject, html);
}

/**
 * Fetch branding settings from OrgSettings
 */
async function getBrandingSettings(organizationId: string): Promise<{
  logoUrl?: string;
  bannerUrl?: string;
}> {
  try {
    const settings = await prisma.orgSettings.findUnique({
      where: { organizationId },
    });

    return {
      logoUrl: settings?.logoUrl ?? undefined,
      bannerUrl: settings?.bannerUrl ?? undefined,
    };
  } catch (error) {
    console.error("Error fetching branding settings:", error);
    return {};
  }
}

/**
 * Render newsletter email to HTML
 */
export async function renderNewsletterEmail(
  data: NewsletterData,
  subscriberId?: string,
  organizationId?: string
): Promise<string> {
  // Fetch branding settings from database
  const branding = organizationId ? await getBrandingSettings(organizationId) : {};

  const html = await render(
    NewsletterEmail({
      ...data,
      subscriberId,
      previewText: `Week ${data.week}, ${data.year}: ${data.articles[0]?.title || "AI & Tech Updates"}`,
      logoUrl: branding.logoUrl,
      bannerUrl: branding.bannerUrl,
    })
  );

  return html;
}

/**
 * Send newsletter to a single subscriber
 */
export async function sendNewsletterToSubscriber(
  subscriberId: string,
  data: NewsletterData,
  editionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get subscriber
    const subscriber = await prisma.subscriber.findUnique({
      where: { id: subscriberId },
    });

    if (!subscriber || !subscriber.active) {
      return { success: false, error: "Subscriber not found or inactive" };
    }

    // Render email HTML
    const html = await renderNewsletterEmail(data, subscriberId);

    // Send email
    const result = await sendEmail(
      subscriber.email,
      `Link AI Newsletter - Week ${data.week}, ${data.year}`,
      html
    );

    if (result.success) {
      // Log email event
      await prisma.emailEvent.create({
        data: {
          subscriberId,
          editionId,
          eventType: "SENT",
          metadata: {
            messageId: result.messageId,
          },
        },
      });
    }

    return result;
  } catch (error) {
    console.error("Error sending newsletter to subscriber:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send newsletter to all active subscribers (batch)
 */
export async function sendNewsletterToAll(
  data: NewsletterData,
  editionId: string,
  onProgress?: (current: number, total: number) => void
): Promise<{
  success: boolean;
  sent: number;
  failed: number;
  errors: string[];
}> {
  const result = {
    success: true,
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  try {
    // Get all active subscribers
    const subscribers = await prisma.subscriber.findMany({
      where: { active: true },
    });

    const total = subscribers.length;
    console.log(`Sending newsletter to ${total} subscribers...`);

    // Get provider-specific batch settings
    const { batchSize, rateLimitDelay } = getProviderSettings();

    // Send in batches to avoid rate limiting
    const batches = [];

    for (let i = 0; i < subscribers.length; i += batchSize) {
      batches.push(subscribers.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      // Send all emails in batch concurrently
      const promises = batch.map((subscriber) =>
        sendNewsletterToSubscriber(subscriber.id, data, editionId)
      );

      const results = await Promise.allSettled(promises);

      // Process results
      results.forEach((res, index) => {
        const subscriber = batch[index];
        if (res.status === "fulfilled" && res.value.success) {
          result.sent++;
        } else {
          result.failed++;
          const error =
            res.status === "rejected"
              ? res.reason
              : res.value.error || "Unknown error";
          result.errors.push(`${subscriber.email}: ${error}`);
        }
      });

      // Update progress
      const current = Math.min((batchIndex + 1) * batchSize, total);
      if (onProgress) {
        onProgress(current, total);
      }

      console.log(
        `Batch ${batchIndex + 1}/${batches.length} complete: ${current}/${total} sent`
      );

      // Wait between batches to respect rate limits
      if (batchIndex < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, rateLimitDelay));
      }
    }

    console.log(
      `Newsletter sending complete: ${result.sent} sent, ${result.failed} failed`
    );

    return result;
  } catch (error) {
    console.error("Error in batch send:", error);
    return {
      ...result,
      success: false,
      errors: [
        ...result.errors,
        error instanceof Error ? error.message : "Unknown error",
      ],
    };
  }
}

/**
 * Send test email to a specific address
 */
export async function sendTestNewsletter(
  email: string,
  data: NewsletterData
): Promise<{ success: boolean; error?: string }> {
  try {
    const html = await renderNewsletterEmail(data);

    const result = await sendEmail(
      email,
      `[TEST] Link AI Newsletter - Week ${data.week}, ${data.year}`,
      html
    );

    return result;
  } catch (error) {
    console.error("Error sending test email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
