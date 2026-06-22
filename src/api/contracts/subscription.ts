export type SubscriptionStatusDTO = "trialing" | "active" | "past-due" | "canceled" | "incomplete";

export type SubscriptionLimitsDTO = {
  maxDecks: number | "unlimited";
  maxFileSizeBytes: number;
  maxGeneratedCardsPerMonth: number | "unlimited";
  maxUploadsPerMonth: number | "unlimited";
};

export type TrialStatusResponse = {
  activeUsageDayCount: number;
  expiresAt?: string;
  isExpired: boolean;
  lastActiveDate?: string;
  maxActiveUsageDays: number;
  remainingActiveUsageDays: number;
  startedAt?: string;
};

export type SubscriptionStatusResponse = {
  entitlementSource: "mock" | "revenuecat" | "manual" | "none";
  limits: SubscriptionLimitsDTO;
  planId: "free" | "pro";
  planLabel: string;
  renewalOrExpirationDate?: string;
  status: SubscriptionStatusDTO | "none";
  trial: TrialStatusResponse;
};
