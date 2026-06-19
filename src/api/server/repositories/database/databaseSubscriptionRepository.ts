import { queryPostgres } from "../../database";
import type { ServerSubscriptionRepository } from "../types";
import { toIsoString, withDatabaseRepositoryError } from "./utils";

export const databaseSubscriptionRepository: ServerSubscriptionRepository = {
  getSubscriptionByUserId: (userId) =>
    withDatabaseRepositoryError("subscriptions.getSubscriptionByUserId", async () => {
      const result = await queryPostgres<SubscriptionRow>(
        `
          SELECT *
          FROM subscriptions
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [userId],
      );
      const row = result.rows[0];

      return row
        ? mapSubscriptionRow(row)
        : null;
    }),
  upsertSubscription: (input) =>
    withDatabaseRepositoryError("subscriptions.upsertSubscription", async () => {
      const result = await queryPostgres<SubscriptionRow>(
        `
          INSERT INTO subscriptions (
            user_id,
            provider,
            provider_customer_id,
            provider_subscription_id,
            plan_id,
            status,
            current_period_start,
            current_period_end,
            canceled_at,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
          ON CONFLICT (provider, provider_subscription_id)
          WHERE provider_subscription_id IS NOT NULL
          DO UPDATE SET
            user_id = EXCLUDED.user_id,
            provider_customer_id = EXCLUDED.provider_customer_id,
            plan_id = EXCLUDED.plan_id,
            status = EXCLUDED.status,
            current_period_start = EXCLUDED.current_period_start,
            current_period_end = EXCLUDED.current_period_end,
            canceled_at = EXCLUDED.canceled_at,
            metadata = subscriptions.metadata || EXCLUDED.metadata,
            updated_at = now()
          RETURNING *
        `,
        [
          input.userId,
          input.provider,
          input.providerCustomerId ?? null,
          input.providerSubscriptionId ?? `${input.provider}-${input.userId}`,
          input.planId,
          input.status,
          input.currentPeriodStart ?? null,
          input.currentPeriodEnd ?? null,
          input.canceledAt ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      );

      return mapSubscriptionRow(result.rows[0]);
    }),
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  provider: "clerk" | "stripe" | "manual" | "revenuecat";
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  plan_id: string;
  status: "trialing" | "active" | "past-due" | "canceled" | "incomplete";
  current_period_start: Date | string | null;
  current_period_end: Date | string | null;
  canceled_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

const mapSubscriptionRow = (row: SubscriptionRow) => ({
  canceledAt: toIsoString(row.canceled_at),
  createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  currentPeriodEnd: toIsoString(row.current_period_end),
  currentPeriodStart: toIsoString(row.current_period_start),
  id: row.id,
  planId: row.plan_id,
  provider: row.provider,
  providerCustomerId: row.provider_customer_id ?? undefined,
  providerSubscriptionId: row.provider_subscription_id ?? undefined,
  status: row.status,
  updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  userId: row.user_id,
});
