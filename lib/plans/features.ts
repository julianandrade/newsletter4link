import { Plan } from "@prisma/client";

/**
 * Feature flags for each plan tier
 */
export interface PlanFeatures {
  // Subscriber limits
  subscriberLimit: number;

  // Core features
  rssCuration: boolean;
  basicTemplates: boolean;

  // Ghost Writer (AI content generation)
  ghostWriter: boolean;

  // Trend Radar (web search)
  trendRadar: boolean;

  // Personalization
  personalization: boolean;

  // API access
  apiAccess: boolean;

  // White-label & custom domain
  customDomain: boolean;
  whiteLabel: boolean;

  // Support
  prioritySupport: boolean;
}

/**
 * Plan configurations with feature flags and limits
 */
export const PLAN_FEATURES: Record<Plan, PlanFeatures> = {
  FREE: {
    subscriberLimit: 1000,
    rssCuration: true,
    basicTemplates: true,
    ghostWriter: false,
    trendRadar: false,
    personalization: false,
    apiAccess: false,
    customDomain: false,
    whiteLabel: false,
    prioritySupport: false,
  },
  STARTER: {
    subscriberLimit: 5000,
    rssCuration: true,
    basicTemplates: true,
    ghostWriter: true,
    trendRadar: false,
    personalization: false,
    apiAccess: false,
    customDomain: false,
    whiteLabel: false,
    prioritySupport: false,
  },
  PROFESSIONAL: {
    subscriberLimit: 25000,
    rssCuration: true,
    basicTemplates: true,
    ghostWriter: true,
    trendRadar: true,
    personalization: true,
    apiAccess: true,
    customDomain: false,
    whiteLabel: false,
    prioritySupport: true,
  },
  ENTERPRISE: {
    subscriberLimit: Infinity, // Unlimited
    rssCuration: true,
    basicTemplates: true,
    ghostWriter: true,
    trendRadar: true,
    personalization: true,
    apiAccess: true,
    customDomain: true,
    whiteLabel: true,
    prioritySupport: true,
  },
};

/**
 * Human-readable plan names and pricing info
 */
export const PLAN_INFO: Record<
  Plan,
  { name: string; description: string; monthlyPrice: number | null }
> = {
  FREE: {
    name: "Free",
    description: "Perfect for getting started",
    monthlyPrice: 0,
  },
  STARTER: {
    name: "Starter",
    description: "For growing newsletters",
    monthlyPrice: 29,
  },
  PROFESSIONAL: {
    name: "Professional",
    description: "Advanced features for professionals",
    monthlyPrice: 99,
  },
  ENTERPRISE: {
    name: "Enterprise",
    description: "Custom solutions for large organizations",
    monthlyPrice: null, // Contact sales
  },
};

/**
 * Get features for a specific plan
 */
export function getPlanFeatures(plan: Plan): PlanFeatures {
  return PLAN_FEATURES[plan];
}

/**
 * Check if a plan has access to a specific feature
 */
export function hasFeature(
  plan: Plan,
  feature: keyof Omit<PlanFeatures, "subscriberLimit">
): boolean {
  return PLAN_FEATURES[plan][feature] === true;
}

/**
 * Get subscriber limit for a plan
 */
export function getSubscriberLimit(plan: Plan): number {
  return PLAN_FEATURES[plan].subscriberLimit;
}

/**
 * Check if organization is within subscriber limit
 */
export function isWithinSubscriberLimit(
  plan: Plan,
  currentSubscribers: number
): boolean {
  const limit = getSubscriberLimit(plan);
  return limit === Infinity || currentSubscribers < limit;
}

/**
 * Get upgrade options for a plan (plans with more features)
 */
export function getUpgradeOptions(currentPlan: Plan): Plan[] {
  const planOrder: Plan[] = ["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"];
  const currentIndex = planOrder.indexOf(currentPlan);
  return planOrder.slice(currentIndex + 1);
}

/**
 * Feature-specific error messages for upsell
 */
export const FEATURE_UPSELL_MESSAGES: Record<
  keyof Omit<PlanFeatures, "subscriberLimit">,
  { title: string; description: string; requiredPlan: Plan }
> = {
  rssCuration: {
    title: "RSS Curation",
    description: "Available on all plans",
    requiredPlan: "FREE",
  },
  basicTemplates: {
    title: "Email Templates",
    description: "Available on all plans",
    requiredPlan: "FREE",
  },
  ghostWriter: {
    title: "Ghost Writer",
    description:
      "Let AI write your newsletters with your brand voice. Upgrade to Starter.",
    requiredPlan: "STARTER",
  },
  trendRadar: {
    title: "Trend Radar",
    description:
      "Discover trending content with AI-powered web search. Upgrade to Professional.",
    requiredPlan: "PROFESSIONAL",
  },
  personalization: {
    title: "Personalization",
    description:
      "Personalize content for each subscriber. Upgrade to Professional.",
    requiredPlan: "PROFESSIONAL",
  },
  apiAccess: {
    title: "API Access",
    description:
      "Integrate with your existing tools via API. Upgrade to Professional.",
    requiredPlan: "PROFESSIONAL",
  },
  customDomain: {
    title: "Custom Domain",
    description:
      "Use your own domain for newsletter links. Upgrade to Enterprise.",
    requiredPlan: "ENTERPRISE",
  },
  whiteLabel: {
    title: "White Label",
    description:
      "Remove all platform branding. Upgrade to Enterprise.",
    requiredPlan: "ENTERPRISE",
  },
  prioritySupport: {
    title: "Priority Support",
    description:
      "Get faster support response times. Upgrade to Professional.",
    requiredPlan: "PROFESSIONAL",
  },
};

/**
 * Type guard to check if a feature key is valid
 */
export function isValidFeature(
  key: string
): key is keyof Omit<PlanFeatures, "subscriberLimit"> {
  return key in FEATURE_UPSELL_MESSAGES;
}
