import { billingProvider, isBillingWebhookError, revenueCatBillingProvider } from "@/api/server/billing";
import { FLASHLY_BILLING_MODE } from "@/api/server/config";
import { jsonError, jsonRouteError, jsonSuccess } from "@/api/server/responses";

const getWebhookErrorCode = (status: number) => {
  if (status === 401) {
    return "unauthorized" as const;
  }

  if (status === 403) {
    return "forbidden" as const;
  }

  if (status >= 500) {
    return "internal" as const;
  }

  return "validation-error" as const;
};

export async function POST(request: Request) {
  if (FLASHLY_BILLING_MODE !== "revenuecat" || billingProvider.mode !== "revenuecat") {
    return jsonError(400, "validation-error", "RevenueCat billing mode is not enabled.");
  }

  try {
    return jsonSuccess(await revenueCatBillingProvider.handleWebhook!(request));
  } catch (error) {
    if (isBillingWebhookError(error)) {
      return jsonError(error.status, getWebhookErrorCode(error.status), error.message);
    }

    return jsonRouteError(error);
  }
}
