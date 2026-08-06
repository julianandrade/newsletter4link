import { prisma } from "@/lib/db";
import { sendEmailViaProvider, getProviderSettings } from "./provider";
import { buildEditionEmail } from "./edition-data";
import {
  renderEditionEmail,
  renderEditionText,
  type EmailTrend,
} from "./edition-template";
import { buildUnsubscribeUrl } from "./unsubscribe-token";

interface Article {
  title: string;
  summary?: string | null;
  sourceUrl: string;
  category?: string[];
  relevanceScore?: number | null;
}

interface Project {
  name: string;
  description: string;
  team?: string;
  impact?: string | null;
  projectDate?: string | Date;
  imageUrl?: string | null;
}

interface NewsletterData {
  articles: Article[];
  projects: Project[];
  week: number;
  year: number;
  /**
   * RQ-008: what the edition is called, the title or the derived week label.
   *
   * Optional so a caller with nothing but a week still works, which is what the preview
   * with ad-hoc data does. Absent means the subject keeps its weekly wording.
   */
  label?: string;
  /** Trend radar rows; when absent the radar block is not rendered. */
  trends?: EmailTrend[];
  /** Shown in the footer as "from N tracked sources" when known. */
  sourceCount?: number;
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
 * Render the newsletter to HTML in the AI Radar design.
 *
 * Signature kept from the previous react-email implementation so the preview,
 * test and batch routes did not have to change their data assembly.
 */
export async function renderNewsletterEmail(
  data: NewsletterData,
  subscriberId?: string,
  organizationId?: string
): Promise<string> {
  // Signed here rather than in the mapper: signing needs node crypto, and the
  // mapper is reachable from client components through content-renderer.
  const edition = buildEditionEmail({
    ...data,
    subscriberId,
    unsubscribeUrl: buildUnsubscribeUrl(subscriberId),
  });

  if (organizationId) {
    const branding = await getBrandingSettings(organizationId);
    // An organization that uploaded its own logo sees it in both colour schemes:
    // there is only one asset, so it cannot be swapped for the dark card the way
    // the Linkroad pair is. Uploading light-on-transparent artwork is the fix.
    if (branding.logoUrl) {
      edition.logoOnLight = branding.logoUrl;
      edition.logoOnDark = branding.logoUrl;
      edition.footerLogoOnLight = branding.logoUrl;
      edition.footerLogoOnDark = branding.logoUrl;
    }
  }

  return renderEditionEmail(edition);
}

/** Plain-text alternative for the same data. */
export function renderNewsletterText(
  data: NewsletterData,
  subscriberId?: string
): string {
  return renderEditionText(
    buildEditionEmail({
      ...data,
      subscriberId,
      unsubscribeUrl: buildUnsubscribeUrl(subscriberId),
    })
  );
}

/** The subject line the design implies, so every route agrees on it. */
export function newsletterSubject(data: NewsletterData): string {
  return buildEditionEmail(data).subject;
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
      newsletterSubject(data),
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
      `[TEST] ${newsletterSubject(data)}`,
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
