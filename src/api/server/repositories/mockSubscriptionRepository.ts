import type { ServerSubscriptionRepository } from "./types";

export const mockSubscriptionRepository: ServerSubscriptionRepository = {
  getSubscriptionByUserId: () => null,
  upsertSubscription: (input) => ({
    canceledAt: input.canceledAt,
    createdAt: new Date().toISOString(),
    currentPeriodEnd: input.currentPeriodEnd,
    currentPeriodStart: input.currentPeriodStart,
    id: `mock-subscription-${input.providerSubscriptionId ?? input.userId}`,
    planId: input.planId,
    provider: input.provider,
    providerCustomerId: input.providerCustomerId,
    providerSubscriptionId: input.providerSubscriptionId,
    status: input.status,
    updatedAt: new Date().toISOString(),
    userId: input.userId,
  }),
};
