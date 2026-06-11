import { prisma } from "@/lib/db";
import { sendEmail } from "./sender";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

/**
 * Editorial reminder: the weekly send only ships articles a human approved,
 * but nothing told anyone that articles were waiting. This emails the org's
 * owners/admins the pending-review count with a link to the review queue.
 *
 * Called from the daily-collection cron on REMINDER_DAY so editors get one
 * nudge before the Sunday send, not a daily nag.
 */

/** Day of week (UTC, 0=Sunday) to send the reminder. Friday gives editors
 * the weekend buffer before Sunday's automated send. */
export const REMINDER_DAY_UTC = 5;

export function isReminderDay(now: Date = new Date()): boolean {
  return now.getUTCDay() === REMINDER_DAY_UTC;
}

export async function sendReviewReminder(
  organizationId: string,
  organizationName: string
): Promise<{ pending: number; notified: number }> {
  const pending = await prisma.article.count({
    where: { organizationId, status: "PENDING_REVIEW" },
  });

  if (pending === 0) {
    return { pending: 0, notified: 0 };
  }

  const admins = await prisma.orgUser.findMany({
    where: {
      organizationId,
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { email: true },
  });

  const emails = [...new Set(admins.map((a) => a.email).filter(Boolean))];
  if (emails.length === 0) {
    logger.warn("Review reminder skipped: org has no owner/admin emails", {
      organizationId,
    });
    return { pending, notified: 0 };
  }

  const reviewUrl = `${config.app.url}/dashboard/review`;
  const subject = `${pending} article${pending === 1 ? "" : "s"} awaiting review for Sunday's newsletter`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#334155;">
      <h2 style="color:#1e3a5f;margin:0 0 12px;">AI Radar — review reminder</h2>
      <p style="font-size:15px;line-height:1.6;">
        <strong>${pending}</strong> curated article${pending === 1 ? " is" : "s are"} waiting for
        review in <strong>${organizationName}</strong>. Articles that aren't approved won't be
        included in Sunday's automated newsletter.
      </p>
      <p style="margin:24px 0;">
        <a href="${reviewUrl}"
           style="background:#1e3a5f;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
          Review articles
        </a>
      </p>
      <p style="font-size:12px;color:#94a3b8;">
        Sent automatically by the daily curation job.
      </p>
    </div>
  `;

  let notified = 0;
  for (const email of emails) {
    const result = await sendEmail(email, subject, html);
    if (result.success) {
      notified++;
    } else {
      logger.warn("Review reminder email failed", { email, error: result.error });
    }
  }

  logger.info("Review reminder sent", { organizationId, pending, notified });
  return { pending, notified };
}
