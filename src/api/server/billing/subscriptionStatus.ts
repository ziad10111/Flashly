import type { SubscriptionStatusResponse } from "@/api/contracts";
import { ENTITLEMENT_PLANS, normalizePlanId } from "../entitlements/plans";
import { getMockTrialState } from "../entitlements/trial";
import type { SubscriptionRow } from "../schema";

const getSource = (subscription: SubscriptionRow | null): SubscriptionStatusResponse["entitlementSource"] => {
  if (!subscription) {
    return "none";
  }

  if (subscription.provider === "revenuecat") {
    return "revenuecat";
  }

  if (subscription.provider === "manual") {
    return "manual";
  }

  return "manual";
};

export const buildSubscriptionStatusResponse = ({
  fallbackPlanId = "free",
  subscription,
  trial = getMockTrialState(),
}: {
  fallbackPlanId?: "free" | "pro";
  subscription: SubscriptionRow | null;
  trial?: SubscriptionStatusResponse["trial"];
}): SubscriptionStatusResponse => {
  const isActive = subscription?.status === "active" || subscription?.status === "trialing";
  const planId = isActive ? normalizePlanId(subscription?.planId) : fallbackPlanId;
  const plan = ENTITLEMENT_PLANS[planId];

  return {
    entitlementSource: getSource(subscription),
    limits: plan.limits,
    planId,
    planLabel: plan.label,
    renewalOrExpirationDate: subscription?.currentPeriodEnd,
    status: subscription?.status ?? "none",
    trial,
  };
};
