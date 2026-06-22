import { FLASHLY_DATA_MODE } from "../config";
import { billingProvider } from "../billing";
import { queryPostgres } from "../database";
import { ensureDatabaseUser } from "../repositories/database/utils";
import { ENTITLEMENT_PLANS, type EntitlementPlan } from "./plans";
import { getAccountTrialState } from "./trial";
import type { TrialStatusResponse } from "@/api/contracts";

export type EntitlementUsageSnapshot = {
  currentMonthGeneratedCards: number;
  currentMonthUploads: number;
  totalDecks: number;
};

export type EntitlementSnapshot = {
  mode: "mock" | "database";
  plan: EntitlementPlan;
  trial: TrialStatusResponse;
  usage: EntitlementUsageSnapshot;
  userId: string;
};

const getCurrentMonthStart = () => {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

const toCount = (value: unknown) => Number(value ?? 0);

const getMockSnapshot = (userId: string): EntitlementSnapshot => ({
  mode: "mock",
  plan: ENTITLEMENT_PLANS.pro,
  trial: {
    activeUsageDayCount: 0,
    isExpired: false,
    maxActiveUsageDays: 3,
    remainingActiveUsageDays: 3,
  },
  usage: {
    currentMonthGeneratedCards: 0,
    currentMonthUploads: 0,
    totalDecks: 0,
  },
  userId,
});

const getDatabaseUsage = async (databaseUserId: string): Promise<EntitlementUsageSnapshot> => {
  const monthStart = getCurrentMonthStart();
  const [uploads, decks, generationJobs, flashcards] = await Promise.all([
    queryPostgres<{ count: string }>(
      "SELECT count(*)::text AS count FROM uploads WHERE user_id = $1 AND created_at >= $2",
      [databaseUserId, monthStart],
    ),
    queryPostgres<{ count: string }>(
      "SELECT count(*)::text AS count FROM decks WHERE user_id = $1",
      [databaseUserId],
    ),
    queryPostgres<{ count: string }>(
      `
        SELECT COALESCE(sum(generated_card_count), 0)::text AS count
        FROM generation_jobs
        WHERE user_id = $1 AND created_at >= $2 AND status = 'complete'
      `,
      [databaseUserId, monthStart],
    ),
    queryPostgres<{ count: string }>(
      "SELECT count(*)::text AS count FROM flashcards WHERE user_id = $1 AND created_at >= $2",
      [databaseUserId, monthStart],
    ),
  ]);

  const generatedFromJobs = toCount(generationJobs.rows[0]?.count);
  const generatedFromCards = toCount(flashcards.rows[0]?.count);

  return {
    currentMonthGeneratedCards: Math.max(generatedFromJobs, generatedFromCards),
    currentMonthUploads: toCount(uploads.rows[0]?.count),
    totalDecks: toCount(decks.rows[0]?.count),
  };
};

export const getEntitlementSnapshot = async (clerkUserId: string): Promise<EntitlementSnapshot> => {
  if (FLASHLY_DATA_MODE !== "database") {
    return getMockSnapshot(clerkUserId);
  }

  const [databaseUser, subscriptionStatus] = await Promise.all([
    ensureDatabaseUser(clerkUserId),
    billingProvider.getSubscriptionStatus(clerkUserId),
  ]);
  const plan = ENTITLEMENT_PLANS[subscriptionStatus.planId];

  return {
    mode: "database",
    plan,
    trial: await getAccountTrialState(clerkUserId, { recordActivity: true }),
    usage: await getDatabaseUsage(databaseUser.id),
    userId: clerkUserId,
  };
};
