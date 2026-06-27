import type { SubscriptionStatusResponse } from "@/api/contracts";

export type UpgradePackageDisplay = {
  identifier: string;
  packageType: string;
  priceString: string;
  productIdentifier: string;
  title: string;
};

export type UpgradeBillingState =
  | "loading"
  | "available"
  | "purchasing"
  | "restoring"
  | "unavailable"
  | "error"
  | "pro-active";

export const UPGRADE_COPY = {
  autoRenewDisclaimer: "Subscriptions renew automatically unless cancelled through your app-store account.",
  benefits: [
    "Generate more flashcards",
    "Upload larger PDF and image files",
    "Create decks after your free trial ends",
    "Use higher monthly upload and generation limits",
  ],
  heroBody: "Create more flashcards, upload larger files, and turn your materials into study decks faster.",
  heroEyebrow: "Flashly Pro",
  heroTitle: "Study without limits",
  noPackagesMessage: "Please try again later. You can continue using your existing decks and study features.",
  noPackagesTitle: "Subscriptions are temporarily unavailable",
  noRestoredPurchaseMessage: "No active Pro purchase was found for this account.",
  purchaseCancelledMessage: "Purchase cancelled. You can choose a plan whenever you are ready.",
  purchaseErrorMessage: "Purchase could not be completed. Please try again.",
  restoreErrorMessage: "Purchases could not be restored. Please try again.",
  termsLabel: "Terms of Use",
  privacyLabel: "Privacy Policy",
} as const;

const annualPattern = /(annual|year|yearly)/;
const monthlyPattern = /(month|monthly)/;

const getPackageSearchText = (item: UpgradePackageDisplay) =>
  `${item.packageType} ${item.productIdentifier} ${item.title}`.toLowerCase();

export const isAnnualPackage = (item: UpgradePackageDisplay) => annualPattern.test(getPackageSearchText(item));

export const isMonthlyPackage = (item: UpgradePackageDisplay) => monthlyPattern.test(getPackageSearchText(item));

export const isRecurringProPackage = (item: UpgradePackageDisplay) => isAnnualPackage(item) || isMonthlyPackage(item);

export const getDisplayedUpgradePackages = <TPackage extends UpgradePackageDisplay>(packages: TPackage[]) => {
  const recurringPackages = packages.filter(isRecurringProPackage);

  return recurringPackages.length > 0 ? recurringPackages : packages;
};

export const getPreferredUpgradePackageId = (packages: UpgradePackageDisplay[]) =>
  packages.find(isAnnualPackage)?.identifier ?? packages.find(isMonthlyPackage)?.identifier ?? packages[0]?.identifier ?? null;

export const getUpgradePackageLabel = (item: UpgradePackageDisplay) => {
  if (isAnnualPackage(item)) {
    return "Yearly";
  }

  if (isMonthlyPackage(item)) {
    return "Monthly";
  }

  return item.title || "Pro";
};

export const getUpgradePackagePeriodLabel = (item: UpgradePackageDisplay) => {
  if (isAnnualPackage(item)) {
    return "/ year";
  }

  if (isMonthlyPackage(item)) {
    return "/ month";
  }

  return "";
};

export const getUpgradePackageBadge = (item: UpgradePackageDisplay) => (isAnnualPackage(item) ? "Best value" : null);

export const getSelectedUpgradePackage = <TPackage extends UpgradePackageDisplay>(
  packages: TPackage[],
  selectedPackageId: string | null,
) => packages.find((item) => item.identifier === selectedPackageId) ?? null;

export const getPurchaseButtonLabel = (selectedPackage: UpgradePackageDisplay | null) =>
  selectedPackage ? `Continue with ${getUpgradePackageLabel(selectedPackage)}` : "Start Flashly Pro";

export const getTrialSummaryLine = (subscription: SubscriptionStatusResponse) => {
  if (subscription.trial.isExpired) {
    return "Your free trial has ended";
  }

  const remainingDays = subscription.trial.remainingActiveUsageDays;

  if (remainingDays <= 0) {
    return null;
  }

  return `${remainingDays} free study day${remainingDays === 1 ? "" : "s"} remaining`;
};

export const getUpgradeBillingState = ({
  canUsePurchases,
  hasAttemptedPackageLoad,
  isLoadingPackages,
  isLoadingSubscription,
  isRestoring,
  packageCount,
  packageLoadFailed,
  planId,
  purchasingPackageId,
}: {
  canUsePurchases: boolean;
  hasAttemptedPackageLoad: boolean;
  isLoadingPackages: boolean;
  isLoadingSubscription: boolean;
  isRestoring: boolean;
  packageCount: number;
  packageLoadFailed: boolean;
  planId: SubscriptionStatusResponse["planId"];
  purchasingPackageId: string | null;
}): UpgradeBillingState => {
  if (purchasingPackageId) {
    return "purchasing";
  }

  if (isRestoring) {
    return "restoring";
  }

  if (isLoadingSubscription || (canUsePurchases && (isLoadingPackages || !hasAttemptedPackageLoad))) {
    return "loading";
  }

  if (planId === "pro") {
    return "pro-active";
  }

  if (packageLoadFailed) {
    return "error";
  }

  if (!canUsePurchases || packageCount === 0) {
    return "unavailable";
  }

  return "available";
};

export const canStartUpgradePurchase = ({
  billingState,
  selectedPackageId,
}: {
  billingState: UpgradeBillingState;
  selectedPackageId: string | null;
}) => billingState === "available" && Boolean(selectedPackageId);

export const canStartUpgradeRestore = ({
  canUsePurchases,
  isRestoring,
  purchasingPackageId,
}: {
  canUsePurchases: boolean;
  isRestoring: boolean;
  purchasingPackageId: string | null;
}) => canUsePurchases && !isRestoring && !purchasingPackageId;

export const shouldReturnAfterEntitlementRefresh = ({
  customerHasPro,
  refreshedPlanId,
}: {
  customerHasPro: boolean;
  refreshedPlanId?: SubscriptionStatusResponse["planId"];
}) => customerHasPro || refreshedPlanId === "pro";

const readErrorFlag = (error: unknown, key: string) =>
  Boolean(error && typeof error === "object" && key in error && (error as Record<string, unknown>)[key] === true);

const readErrorCode = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "";
  }

  const code = (error as { code?: unknown }).code;

  return typeof code === "string" ? code.toLowerCase() : "";
};

export const isPurchaseCancellation = (error: unknown) => {
  const code = readErrorCode(error);

  return readErrorFlag(error, "userCancelled") || code.includes("cancel");
};

export const getPurchaseFeedbackMessage = (error: unknown) =>
  isPurchaseCancellation(error) ? UPGRADE_COPY.purchaseCancelledMessage : UPGRADE_COPY.purchaseErrorMessage;
