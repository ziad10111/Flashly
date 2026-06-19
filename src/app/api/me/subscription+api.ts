import { requireBackendAuth } from "@/api/server/auth";
import { billingProvider } from "@/api/server/billing";
import { jsonRouteError, jsonSuccess } from "@/api/server/responses";

export async function GET(request: Request) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  try {
    return jsonSuccess(await billingProvider.getSubscriptionStatus(auth.context.userId));
  } catch (error) {
    return jsonRouteError(error);
  }
}
