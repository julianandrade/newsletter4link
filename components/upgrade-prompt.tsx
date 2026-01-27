"use client";

import { Plan } from "@prisma/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Sparkles, Zap, Crown } from "lucide-react";
import { PLAN_INFO, FEATURE_UPSELL_MESSAGES, PlanFeatures } from "@/lib/plans/features";

interface UpgradePromptProps {
  feature: keyof Omit<PlanFeatures, "subscriberLimit">;
  currentPlan: Plan;
  className?: string;
}

const planIcons: Record<Plan, React.ReactNode> = {
  FREE: <Lock className="h-5 w-5" />,
  STARTER: <Sparkles className="h-5 w-5" />,
  PROFESSIONAL: <Zap className="h-5 w-5" />,
  ENTERPRISE: <Crown className="h-5 w-5" />,
};

export function UpgradePrompt({ feature, currentPlan, className }: UpgradePromptProps) {
  const upsell = FEATURE_UPSELL_MESSAGES[feature];
  const requiredPlanInfo = PLAN_INFO[upsell.requiredPlan];
  const currentPlanInfo = PLAN_INFO[currentPlan];

  return (
    <Card className={className}>
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          {planIcons[upsell.requiredPlan]}
        </div>
        <CardTitle className="flex items-center justify-center gap-2">
          <Lock className="h-4 w-4" />
          {upsell.title}
        </CardTitle>
        <CardDescription>{upsell.description}</CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline">{currentPlanInfo.name}</Badge>
          <span className="text-muted-foreground">→</span>
          <Badge variant="default">{requiredPlanInfo.name}</Badge>
        </div>

        {requiredPlanInfo.monthlyPrice !== null && (
          <p className="text-sm text-muted-foreground">
            Starting at ${requiredPlanInfo.monthlyPrice}/month
          </p>
        )}

        <Button className="w-full" disabled>
          Upgrade to {requiredPlanInfo.name}
        </Button>

        <p className="text-xs text-muted-foreground">
          Contact support to upgrade your plan
        </p>
      </CardContent>
    </Card>
  );
}

interface FeatureGateProps {
  feature: keyof Omit<PlanFeatures, "subscriberLimit">;
  currentPlan: Plan;
  hasAccess: boolean;
  children: React.ReactNode;
}

export function FeatureGate({ feature, currentPlan, hasAccess, children }: FeatureGateProps) {
  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <UpgradePrompt feature={feature} currentPlan={currentPlan} className="max-w-md" />
    </div>
  );
}
