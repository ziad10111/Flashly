import type { SubscriptionStatusResponse } from "@/api/contracts";

export type BillingMode = "mock" | "revenuecat";

export type BillingWebhookResult = {
  eventId?: string;
  planId: "free" | "pro";
  providerSubscriptionId?: string;
  status: "processed";
  subscriptionStatus: SubscriptionStatusResponse["status"];
  userId: string;
};

export type BillingProvider = {
  mode: BillingMode;
  getSubscriptionStatus: (clerkUserId: string) => Promise<SubscriptionStatusResponse>;
  handleWebhook?: (request: Request) => Promise<BillingWebhookResult>;
};

export class BillingWebhookError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BillingWebhookError";
    this.status = status;
  }
}

export const isBillingWebhookError = (error: unknown): error is BillingWebhookError =>
  error instanceof BillingWebhookError;
