import { FLASHLY_DATA_MODE, REVENUECAT_WEBHOOK_SECRET } from "../config";
import { getAccountTrialState } from "../entitlements/trial";
import { subscriptionRepository } from "../repositories";
import { ensureDatabaseUser } from "../repositories/database/utils";
import { buildSubscriptionStatusResponse } from "./subscriptionStatus";
import { BillingWebhookError, type BillingProvider, type BillingWebhookResult } from "./types";

type RevenueCatWebhookBody = {
  event?: RevenueCatEvent;
};

type RevenueCatEvent = {
  app_user_id?: unknown;
  entitlement_id?: unknown;
  entitlement_ids?: unknown;
  event_timestamp_ms?: unknown;
  expiration_at_ms?: unknown;
  id?: unknown;
  original_transaction_id?: unknown;
  product_id?: unknown;
  purchased_at_ms?: unknown;
  store?: unknown;
  transaction_id?: unknown;
  type?: unknown;
};

const asString = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);

const asStringArray = (value: unknown) =>
  Array.isArray(value) ? value.map(asString).filter((item): item is string => Boolean(item)) : [];

const asDateIso = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return new Date(value).toISOString();
};

export const verifyRevenueCatWebhookRequest = (
  request: Request,
  configuredSecret = REVENUECAT_WEBHOOK_SECRET,
) => {
  const authorization = request.headers.get("Authorization")?.trim();
  const signature = request.headers.get("X-RevenueCat-Signature")?.trim();

  if (!configuredSecret) {
    throw new BillingWebhookError("RevenueCat webhook secret is not configured on the server.", 500);
  }

  if (!authorization && !signature) {
    throw new BillingWebhookError("RevenueCat webhook authorization is required.", 401);
  }

  if (authorization === `Bearer ${configuredSecret}` || signature === configuredSecret) {
    return true;
  }

  throw new BillingWebhookError("RevenueCat webhook secret is invalid.", 403);
};

const parseWebhookBody = async (request: Request) => {
  let body: unknown;

  try {
    body = JSON.parse(await request.text()) as unknown;
  } catch {
    throw new BillingWebhookError("RevenueCat webhook body must be valid JSON.");
  }

  if (!body || typeof body !== "object") {
    throw new BillingWebhookError("RevenueCat webhook body is empty.");
  }

  const event = (body as RevenueCatWebhookBody).event;

  if (!event || typeof event !== "object") {
    throw new BillingWebhookError("RevenueCat webhook event is missing.");
  }

  return event;
};

const isProEntitlement = (event: RevenueCatEvent) => {
  const entitlementIds = [asString(event.entitlement_id), ...asStringArray(event.entitlement_ids)]
    .filter((item): item is string => Boolean(item))
    .map((item) => item.toLowerCase());
  const productId = asString(event.product_id)?.toLowerCase() ?? "";

  return entitlementIds.some((item) => item.includes("pro")) || productId.includes("pro") || productId.includes("premium");
};

const mapRevenueCatStatus = (eventType: string | undefined) => {
  switch (eventType) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "NON_RENEWING_PURCHASE":
      return "active" as const;
    case "BILLING_ISSUE":
      return "past-due" as const;
    case "CANCELLATION":
      return "canceled" as const;
    case "EXPIRATION":
      return "canceled" as const;
    default:
      return "active" as const;
  }
};

const getProviderSubscriptionId = (event: RevenueCatEvent) =>
  asString(event.original_transaction_id) ?? asString(event.transaction_id) ?? asString(event.id);

const getRepositoryUserId = async (clerkUserId: string) => {
  if (FLASHLY_DATA_MODE !== "database") {
    return clerkUserId;
  }

  return (await ensureDatabaseUser(clerkUserId)).id;
};

export const revenueCatBillingProvider: BillingProvider = {
  getSubscriptionStatus: async (clerkUserId) => {
    const [repositoryUserId, trial] = await Promise.all([
      getRepositoryUserId(clerkUserId),
      getAccountTrialState(clerkUserId, { recordActivity: true }),
    ]);
    const subscription = await subscriptionRepository.getSubscriptionByUserId(repositoryUserId);

    return buildSubscriptionStatusResponse({ subscription, trial });
  },
  handleWebhook: async (request): Promise<BillingWebhookResult> => {
    verifyRevenueCatWebhookRequest(request);

    const event = await parseWebhookBody(request);
    const clerkUserId = asString(event.app_user_id);

    if (!clerkUserId) {
      throw new BillingWebhookError("RevenueCat app_user_id is required.");
    }

    const providerSubscriptionId = getProviderSubscriptionId(event);

    if (!providerSubscriptionId) {
      throw new BillingWebhookError("RevenueCat transaction id is required.");
    }

    const eventType = asString(event.type);
    const status = mapRevenueCatStatus(eventType);
    const planId = status === "active" && isProEntitlement(event) ? "pro" : "free";
    const repositoryUserId = await getRepositoryUserId(clerkUserId);

    await subscriptionRepository.upsertSubscription({
      canceledAt: status === "canceled" ? new Date().toISOString() : undefined,
      currentPeriodEnd: asDateIso(event.expiration_at_ms),
      currentPeriodStart: asDateIso(event.purchased_at_ms),
      metadata: {
        revenuecatEventId: asString(event.id),
        revenuecatEventType: eventType,
        revenuecatProductId: asString(event.product_id),
        revenuecatStore: asString(event.store),
      },
      planId,
      provider: "revenuecat",
      providerCustomerId: clerkUserId,
      providerSubscriptionId,
      status,
      userId: repositoryUserId,
    });

    return {
      eventId: asString(event.id),
      planId,
      providerSubscriptionId,
      status: "processed",
      subscriptionStatus: status,
      userId: clerkUserId,
    };
  },
  mode: "revenuecat",
};
