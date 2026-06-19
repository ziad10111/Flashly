import { FLASHLY_DATA_MODE } from "../config";
import { buildSubscriptionStatusResponse } from "./subscriptionStatus";
import type { BillingProvider } from "./types";

export const mockBillingProvider: BillingProvider = {
  getSubscriptionStatus: async () =>
    ({
      ...buildSubscriptionStatusResponse({
        fallbackPlanId: FLASHLY_DATA_MODE === "database" ? "free" : "pro",
        subscription: null,
      }),
      entitlementSource: "mock",
    }),
  mode: "mock",
};
