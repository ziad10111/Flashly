import { FLASHLY_DATA_MODE } from "../config";
import { getMockTrialState } from "../entitlements/trial";
import { buildSubscriptionStatusResponse } from "./subscriptionStatus";
import type { BillingProvider } from "./types";

export const mockBillingProvider: BillingProvider = {
  getSubscriptionStatus: async () =>
    ({
      ...buildSubscriptionStatusResponse({
        fallbackPlanId: FLASHLY_DATA_MODE === "database" ? "free" : "pro",
        subscription: null,
        trial: getMockTrialState(),
      }),
      entitlementSource: "mock",
    }),
  mode: "mock",
};
