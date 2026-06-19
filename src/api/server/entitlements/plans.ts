export type EntitlementPlanId = "free" | "pro";

export type PlanLimitValue = number | "unlimited";

export type EntitlementPlanLimits = {
  maxDecks: PlanLimitValue;
  maxFileSizeBytes: number;
  maxGeneratedCardsPerMonth: PlanLimitValue;
  maxUploadsPerMonth: PlanLimitValue;
};

export type EntitlementPlan = {
  id: EntitlementPlanId;
  label: string;
  limits: EntitlementPlanLimits;
};

const megabytes = (value: number) => value * 1024 * 1024;

export const ENTITLEMENT_PLANS: Record<EntitlementPlanId, EntitlementPlan> = {
  free: {
    id: "free",
    label: "Free",
    limits: {
      maxDecks: 20,
      maxFileSizeBytes: megabytes(10),
      maxGeneratedCardsPerMonth: 300,
      maxUploadsPerMonth: 10,
    },
  },
  pro: {
    id: "pro",
    label: "Pro",
    limits: {
      maxDecks: 10_000,
      maxFileSizeBytes: megabytes(50),
      maxGeneratedCardsPerMonth: 100_000,
      maxUploadsPerMonth: 10_000,
    },
  },
};

export const normalizePlanId = (planId: string | null | undefined): EntitlementPlanId =>
  planId?.toLowerCase().includes("pro") ? "pro" : "free";

export const formatLimit = (value: PlanLimitValue) =>
  value === "unlimited" ? "unlimited" : value.toLocaleString();

export const formatBytes = (bytes: number) => {
  const megabyteValue = bytes / 1024 / 1024;

  return `${Number.isInteger(megabyteValue) ? megabyteValue : megabyteValue.toFixed(1)} MB`;
};
