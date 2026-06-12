import { prisma } from "@/lib/db";
import { sendEmail } from "./sender";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getWeekNumber } from "@/lib/dates";

/**
 * Editorial reminder at the start of the weekly cycle.
 *
 * Weekly rhythm: Monday morning this reminder goes out; editors have until
 * Monday end of day to review pending articles and curate the edition; at
 * 18:00 UTC the weekly-finalize cron promotes whatever is ready (their picks,
 * or an auto-built edition from approved articles); Tuesday 09:00 UTC the
 * send goes out. This email tells org owners/admins what still needs eyes.
 */

/** Day of week (UTC, 0=Sunday) to send the reminder. Monday — the editors'
 * curation day, ahead of the Monday-EOD auto-finalize. */
export const REMINDER_DAY_UTC = 1;

export function isReminderDay(now: Date = new Date()): boolean {
  return now.getUTCDay() === REMINDER_DAY_UTC;
}

export async function sendReviewReminder(
  organizationId: string,
  organizationName: string,
  now: Date = new Date()
): Promise<{ pending: number; editionFinalized: boolean; notified: number }> {
  const week = getWeekNumber(now);
  const year = now.getFullYear();

  const [pending, edition, orgSettings] = await Promise.all([
    prisma.article.count({
      where: { organizationId, status: "PENDING_REVIEW" },
    }),
    prisma.edition.findFirst({
      where: { organizationId, week, year },
      select: { status: true },
    }),
    prisma.orgSettings.findUnique({
      where: { organizationId },
      select: { autoSendEnabled: true },
    }),
  ]);

  const autoSend = orgSettings?.autoSendEnabled ?? false;

  // FINALIZED or already SENT both mean no action is needed on the edition.
  const editionFinalized = !!edition && edition.status !== "DRAFT";

  if (pending === 0 && editionFinalized) {
    return { pending: 0, editionFinalized, notified: 0 };
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
    return { pending, editionFinalized, notified: 0 };
  }

  const reviewUrl = `${config.app.url}/dashboard/review`;
  const sendUrl = `${config.app.url}/dashboard/send`;

  const subject = editionFinalized
    ? `${pending} article${pending === 1 ? "" : "s"} awaiting review — AI Radar`
    : "Action needed: finalize this week's AI Radar edition";

  const items: string[] = [];
  if (pending > 0) {
    items.push(
      `<li><strong>${pending}</strong> curated article${pending === 1 ? " is" : "s are"} waiting for
       <a href="${reviewUrl}" style="color:#1e3a5f;">review</a>.</li>`
    );
  }
  if (!editionFinalized) {
    items.push(
      `<li>This week's edition (week ${week}) has <strong>not been finalized</strong>.
       You have until <strong>end of day today (18:00 UTC)</strong> to
       <a href="${sendUrl}" style="color:#1e3a5f;">curate &amp; finalize it</a> yourself —
       after that it will be auto-finalized from the approved articles.
       ${
         autoSend
           ? "It will then be <strong>sent automatically Tuesday morning</strong>."
           : "Automated sending is <strong>off</strong>: once finalized, send it from the dashboard when you're ready."
       }</li>`
    );
  }

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#334155;">
      <h2 style="color:#1e3a5f;margin:0 0 12px;">AI Radar — weekly editorial check</h2>
      <ul style="font-size:15px;line-height:1.8;padding-left:20px;">${items.join("")}</ul>
      <p style="margin:24px 0;">
        <a href="${editionFinalized ? reviewUrl : sendUrl}"
           style="background:#1e3a5f;color:#ffffff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">
          ${editionFinalized ? "Review articles" : "Finalize edition"}
        </a>
      </p>
      <p style="font-size:12px;color:#94a3b8;">
        Sent automatically every Monday by the curation job for ${organizationName}.
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

  logger.info("Review reminder sent", {
    organizationId,
    pending,
    editionFinalized,
    notified,
  });
  return { pending, editionFinalized, notified };
}
