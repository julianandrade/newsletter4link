import { prisma } from "@/lib/db";
import { sendEmail } from "./sender";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getWeekNumber } from "@/lib/dates";

/**
 * Editorial reminder ahead of the weekly send.
 *
 * Article curation is automated (top scores are even auto-approved), but the
 * weekly send is deliberately human-gated: the cron only ships an edition a
 * person finalized in the dashboard. This reminder is the safety net — it
 * emails org owners/admins when articles are waiting for review and/or this
 * week's edition hasn't been finalized yet.
 */

/** Day of week (UTC, 0=Sunday) to send the reminder. Monday — the day
 * before the Tuesday-morning send — so editors have a full working day to
 * review and finalize. */
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

  const [pending, edition] = await Promise.all([
    prisma.article.count({
      where: { organizationId, status: "PENDING_REVIEW" },
    }),
    prisma.edition.findFirst({
      where: { organizationId, week, year },
      select: { status: true },
    }),
  ]);

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
       The automated Tuesday-morning send only ships human-finalized editions —
       <a href="${sendUrl}" style="color:#1e3a5f;">build &amp; finalize it</a> before
       Tuesday 09:00 UTC or no newsletter goes out this week.</li>`
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
