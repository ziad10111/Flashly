export type SubscriptionStatusDTO = "trialing" | "active" | "past-due" | "canceled" | "incomplete";

export type SubscriptionLimitsDTO = {
  maxDecks: number | "unlimited";
  maxFileSizeBytes: number;
  maxGeneratedCardsPerMonth: number | "unlimited";
  maxUploadsPerMonth: number | "unlimited";
};

export type SubscriptionStatusResponse = {
  entitlementSource: "mock" | "revenuecat" | "manual" | "none";
  limits: SubscriptionLimitsDTO;
  planId: "free" | "pro";
  planLabel: string;
  renewalOrExpirationDate?: string;
  status: SubscriptionStatusDTO | "none";
};
