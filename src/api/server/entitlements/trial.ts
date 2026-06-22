import type { TrialStatusResponse } from "@/api/contracts";
import { FLASHLY_DATA_MODE } from "../config";
import { withPostgresClient } from "../database";

export const FREE_TRIAL_ACTIVE_USAGE_DAYS = 3;

export type TrialMetadata = {
  activeDates?: unknown;
  activeUsageDayCount?: unknown;
  lastActiveDate?: unknown;
  startedAt?: unknown;
};

type UserTrialRow = {
  id: string;
  metadata: Record<string, unknown> | null;
};

const TRIAL_METADATA_KEY = "flashlyTrial";

const toDateKey = (date = new Date()) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const addDays = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return date.toISOString();
};

const uniqueDateKeys = (values: unknown) =>
  Array.isArray(values)
    ? [...new Set(values.filter((value): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)))]
    : [];

const getTrialMetadata = (metadata: Record<string, unknown> | null): TrialMetadata => {
  const trial = metadata?.[TRIAL_METADATA_KEY];

  return trial && typeof trial === "object" ? (trial as TrialMetadata) : {};
};

const buildTrialState = (metadata: TrialMetadata, today = toDateKey()): TrialStatusResponse => {
  const activeDates = uniqueDateKeys(metadata.activeDates);
  const startedAt = typeof metadata.startedAt === "string" ? metadata.startedAt : undefined;
  const lastActiveDate = typeof metadata.lastActiveDate === "string" ? metadata.lastActiveDate : undefined;
  const countedActiveDays = Math.min(activeDates.length, FREE_TRIAL_ACTIVE_USAGE_DAYS);
  const thirdActiveDate = activeDates[FREE_TRIAL_ACTIVE_USAGE_DAYS - 1];
  const isExpired = activeDates.length >= FREE_TRIAL_ACTIVE_USAGE_DAYS && !activeDates.includes(today);

  return {
    activeUsageDayCount: countedActiveDays,
    expiresAt: thirdActiveDate ? addDays(thirdActiveDate, 1) : undefined,
    isExpired,
    lastActiveDate,
    maxActiveUsageDays: FREE_TRIAL_ACTIVE_USAGE_DAYS,
    remainingActiveUsageDays: Math.max(0, FREE_TRIAL_ACTIVE_USAGE_DAYS - countedActiveDays),
    startedAt,
  };
};

export const getMockTrialState = (): TrialStatusResponse => ({
  activeUsageDayCount: 0,
  isExpired: false,
  maxActiveUsageDays: FREE_TRIAL_ACTIVE_USAGE_DAYS,
  remainingActiveUsageDays: FREE_TRIAL_ACTIVE_USAGE_DAYS,
});

const buildNextMetadata = (metadata: Record<string, unknown> | null, now = new Date()) => {
  const today = toDateKey(now);
  const current = getTrialMetadata(metadata);
  const currentDates = uniqueDateKeys(current.activeDates);
  const activeDates =
    currentDates.includes(today) || currentDates.length >= FREE_TRIAL_ACTIVE_USAGE_DAYS
      ? currentDates
      : [...currentDates, today];
  const startedAt =
    typeof current.startedAt === "string"
      ? current.startedAt
      : now.toISOString();
  const trialMetadata = {
    activeDates,
    activeUsageDayCount: Math.min(activeDates.length, FREE_TRIAL_ACTIVE_USAGE_DAYS),
    lastActiveDate: today,
    startedAt,
  };

  return {
    ...(metadata ?? {}),
    [TRIAL_METADATA_KEY]: trialMetadata,
  };
};

export const getAccountTrialState = async (
  clerkUserId: string,
  options: { recordActivity?: boolean } = {},
): Promise<TrialStatusResponse> => {
  if (FLASHLY_DATA_MODE !== "database") {
    return getMockTrialState();
  }

  const now = new Date();

  return withPostgresClient(async (client) => {
    await client.query("BEGIN");

    try {
      const userResult = await client.query<UserTrialRow>(
        `
          INSERT INTO users (clerk_user_id)
          VALUES ($1)
          ON CONFLICT (clerk_user_id)
          DO UPDATE SET updated_at = now()
          RETURNING id, metadata
        `,
        [clerkUserId],
      );
      const user = userResult.rows[0];
      const metadata = options.recordActivity
        ? buildNextMetadata(user.metadata, now)
        : user.metadata;

      if (options.recordActivity) {
        await client.query(
          `
            UPDATE users
            SET metadata = $2::jsonb,
                updated_at = now()
            WHERE id = $1
          `,
          [user.id, JSON.stringify(metadata)],
        );
      }

      await client.query("COMMIT");

      return buildTrialState(getTrialMetadata(metadata), toDateKey(now));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
};

export const canUsePremiumFeature = ({
  isPro,
  trial,
}: {
  isPro: boolean;
  trial: TrialStatusResponse;
}) => isPro || !trial.isExpired;

export const trialTestUtils = {
  buildNextMetadata,
  buildTrialState,
};
