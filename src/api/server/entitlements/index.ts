import type { ApiErrorDTO } from "@/api/contracts";
import { rateLimitedError } from "../apiErrors";
import { formatBytes, formatLimit, type PlanLimitValue } from "./plans";
import { getEntitlementSnapshot, type EntitlementSnapshot } from "./usage";
import { canUsePremiumFeature } from "./trial";

export type EntitlementCheckResult =
  | {
      ok: true;
      snapshot: EntitlementSnapshot;
    }
  | {
      error: ApiErrorDTO;
      ok: false;
      snapshot: EntitlementSnapshot;
    };

const isOverLimit = (currentValue: number, limit: PlanLimitValue) =>
  limit !== "unlimited" && currentValue > limit;

const wouldExceedLimit = (currentValue: number, incomingValue: number, limit: PlanLimitValue) =>
  limit !== "unlimited" && currentValue + incomingValue > limit;

const createLimitMessage = ({
  action,
  current,
  limit,
  planLabel,
  unit,
}: {
  action: string;
  current?: number;
  limit: string;
  planLabel: string;
  unit: string;
}) => {
  const currentText = current === undefined ? "" : ` Current usage: ${current.toLocaleString()} ${unit}.`;
  const verb = action === "Extraction" || action === "Deck creation" ? "is" : "are";

  return `${action} ${verb} limited on the ${planLabel} plan. Limit: ${limit} ${unit}.${currentText} Upgrade to Pro to continue.`;
};

const fail = (snapshot: EntitlementSnapshot, message: string): EntitlementCheckResult => ({
  error: rateLimitedError(message),
  ok: false,
  snapshot,
});

const pass = (snapshot: EntitlementSnapshot): EntitlementCheckResult => ({
  ok: true,
  snapshot,
});

const createTrialExpiredMessage = (action: string) =>
  `Your free trial is complete. You've used Flashly for 3 days. Upgrade to Pro to ${action}.`;

const checkPremiumAccess = (snapshot: EntitlementSnapshot, action: string): EntitlementCheckResult | null => {
  if (canUsePremiumFeature({ isPro: snapshot.plan.id === "pro", trial: snapshot.trial })) {
    return null;
  }

  return fail(snapshot, createTrialExpiredMessage(action));
};

export const checkUploadEntitlement = async ({
  fileSize,
  userId,
}: {
  fileSize?: number;
  userId: string;
}): Promise<EntitlementCheckResult> => {
  const snapshot = await getEntitlementSnapshot(userId);
  const { limits } = snapshot.plan;
  const premiumAccess = checkPremiumAccess(snapshot, "upload and generate more flashcards");

  if (premiumAccess) {
    return premiumAccess;
  }

  if (snapshot.plan.id === "free") {
    return pass(snapshot);
  }

  if (fileSize !== undefined && fileSize > limits.maxFileSizeBytes) {
    return fail(
      snapshot,
      createLimitMessage({
        action: "File uploads",
        limit: formatBytes(limits.maxFileSizeBytes),
        planLabel: snapshot.plan.label,
        unit: "per file",
      }),
    );
  }

  if (isOverLimit(snapshot.usage.currentMonthUploads + 1, limits.maxUploadsPerMonth)) {
    return fail(
      snapshot,
      createLimitMessage({
        action: "Monthly uploads",
        current: snapshot.usage.currentMonthUploads,
        limit: formatLimit(limits.maxUploadsPerMonth),
        planLabel: snapshot.plan.label,
        unit: "uploads",
      }),
    );
  }

  return pass(snapshot);
};

export const checkExtractionEntitlement = async ({
  fileSize,
  userId,
}: {
  fileSize?: number;
  userId: string;
}): Promise<EntitlementCheckResult> => {
  const snapshot = await getEntitlementSnapshot(userId);
  const { limits } = snapshot.plan;
  const premiumAccess = checkPremiumAccess(snapshot, "extract and generate more flashcards");

  if (premiumAccess) {
    return premiumAccess;
  }

  if (snapshot.plan.id === "free") {
    return pass(snapshot);
  }

  if (fileSize !== undefined && fileSize > limits.maxFileSizeBytes) {
    return fail(
      snapshot,
      createLimitMessage({
        action: "Extraction",
        limit: formatBytes(limits.maxFileSizeBytes),
        planLabel: snapshot.plan.label,
        unit: "per file",
      }),
    );
  }

  return pass(snapshot);
};

export const checkGenerationEntitlement = async ({
  createsDeck,
  requestedCardCount,
  userId,
}: {
  createsDeck: boolean;
  requestedCardCount: number;
  userId: string;
}): Promise<EntitlementCheckResult> => {
  const snapshot = await getEntitlementSnapshot(userId);
  const { limits } = snapshot.plan;
  const premiumAccess = checkPremiumAccess(snapshot, "keep generating smart flashcards");

  if (premiumAccess) {
    return premiumAccess;
  }

  if (snapshot.plan.id === "free") {
    return pass(snapshot);
  }

  if (wouldExceedLimit(snapshot.usage.currentMonthGeneratedCards, requestedCardCount, limits.maxGeneratedCardsPerMonth)) {
    return fail(
      snapshot,
      createLimitMessage({
        action: "Monthly generated cards",
        current: snapshot.usage.currentMonthGeneratedCards,
        limit: formatLimit(limits.maxGeneratedCardsPerMonth),
        planLabel: snapshot.plan.label,
        unit: "cards",
      }),
    );
  }

  if (createsDeck && isOverLimit(snapshot.usage.totalDecks + 1, limits.maxDecks)) {
    return fail(
      snapshot,
      createLimitMessage({
        action: "Deck creation",
        current: snapshot.usage.totalDecks,
        limit: formatLimit(limits.maxDecks),
        planLabel: snapshot.plan.label,
        unit: "decks",
      }),
    );
  }

  return pass(snapshot);
};
