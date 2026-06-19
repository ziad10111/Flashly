import type { SchemaId, TimestampedRow, UserOwnedRow } from "./common";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past-due"
  | "canceled"
  | "incomplete";

export type SubscriptionRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    provider: "clerk" | "stripe" | "manual" | "revenuecat";
    providerCustomerId?: string;
    providerSubscriptionId?: string;
    planId: string;
    status: SubscriptionStatus;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    canceledAt?: string;
  };
