import { FLASHLY_BILLING_MODE } from "../config";
import { mockBillingProvider } from "./mockBillingProvider";
import { revenueCatBillingProvider } from "./revenuecatBillingProvider";

export type { BillingProvider, BillingWebhookResult } from "./types";
export { BillingWebhookError, isBillingWebhookError } from "./types";
export { mockBillingProvider } from "./mockBillingProvider";
export { revenueCatBillingProvider } from "./revenuecatBillingProvider";

export const billingProvider =
  FLASHLY_BILLING_MODE === "revenuecat" ? revenueCatBillingProvider : mockBillingProvider;
