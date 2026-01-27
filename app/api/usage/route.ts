/**
 * Usage API
 *
 * GET /api/usage - Get current usage statistics and limits
 */

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/auth/context";
import { getPlanFeatures, PLAN_INFO } from "@/lib/plans/features";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const { db, organization, features } = ctx;

    // Get current counts
    const [subscriberCount, articleCount, editionCount, rssSourceCount, searchTopicCount] = await Promise.all([
      db.subscriber.count({ where: { active: true } }),
      db.article.count(),
      db.edition.count(),
      db.rSSSource.count(),
      db.searchTopic.count(),
    ]);

    // Get this month's usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [editionsSentThisMonth, articlesAddedThisMonth] = await Promise.all([
      db.edition.count({
        where: {
          sentAt: { gte: startOfMonth },
        },
      }),
      db.article.count({
        where: {
          createdAt: { gte: startOfMonth },
        },
      }),
    ]);

    const planFeatures = getPlanFeatures(organization.plan);
    const planInfo = PLAN_INFO[organization.plan];

    // Calculate usage percentages
    const subscriberUsagePercent = planFeatures.subscriberLimit === Infinity
      ? 0
      : Math.round((subscriberCount / planFeatures.subscriberLimit) * 100);

    const isNearLimit = subscriberUsagePercent >= 80;
    const isAtLimit = subscriberUsagePercent >= 100;

    return NextResponse.json({
      success: true,
      data: {
        plan: {
          name: planInfo.name,
          value: organization.plan,
          monthlyPrice: planInfo.monthlyPrice,
        },
        limits: {
          subscribers: planFeatures.subscriberLimit === Infinity ? null : planFeatures.subscriberLimit,
        },
        usage: {
          subscribers: {
            current: subscriberCount,
            limit: planFeatures.subscriberLimit === Infinity ? null : planFeatures.subscriberLimit,
            percentage: subscriberUsagePercent,
            isNearLimit,
            isAtLimit,
          },
          articles: {
            total: articleCount,
            thisMonth: articlesAddedThisMonth,
          },
          editions: {
            total: editionCount,
            sentThisMonth: editionsSentThisMonth,
          },
          rssSources: rssSourceCount,
          searchTopics: searchTopicCount,
        },
        features: {
          rssCuration: features.rssCuration,
          basicTemplates: features.basicTemplates,
          ghostWriter: features.ghostWriter,
          trendRadar: features.trendRadar,
          personalization: features.personalization,
          apiAccess: features.apiAccess,
          customDomain: features.customDomain,
          whiteLabel: features.whiteLabel,
          prioritySupport: features.prioritySupport,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching usage:", error);

    if (error instanceof Error && error.message.startsWith("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Failed to fetch usage" },
      { status: 500 }
    );
  }
}
