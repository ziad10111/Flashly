import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  UPGRADE_COPY,
  canStartUpgradePurchase,
  canStartUpgradeRestore,
  getDisplayedUpgradePackages,
  getPreferredUpgradePackageId,
  getPurchaseButtonLabel,
  getPurchaseFeedbackMessage,
  getSelectedUpgradePackage,
  getTrialSummaryLine,
  getUpgradeBillingState,
  getUpgradePackageBadge,
  getUpgradePackageLabel,
  getUpgradePackagePeriodLabel,
  isPurchaseCancellation,
  shouldReturnAfterEntitlementRefresh,
  type UpgradePackageDisplay,
} from "../src/lib/billing/upgradePagePresentation";
import type { SubscriptionStatusResponse } from "../src/api/contracts";

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const source = readFileSync(join(process.cwd(), "src/app/upgrade.tsx"), "utf8");

assert(!source.includes("Current plan"), "Current-plan diagnostic card should not be rendered.");
assert(!source.includes("Source: {"), "Entitlement source label should not be displayed.");
assert(!source.includes("Status:"), "Raw billing status should not be displayed.");
assert(!source.includes("Loading RevenueCat"), "Technical provider loading text should not be displayed.");
assert(!source.includes("RevenueCat packages"), "Technical package wording should not be displayed.");
assert(!source.includes("API key"), "API-key diagnostics should not be displayed.");
assert(!source.includes("test key"), "Test-key diagnostics should not be displayed.");
assert(!source.includes("productIdentifier}"), "Store product identifiers should not be displayed as user-facing text.");
assert(source.includes("insets.bottom + 96"), "Upgrade page should preserve bottom safe-area spacing for small Android screens.");

const userFacingCopy = JSON.stringify(UPGRADE_COPY).toLowerCase();
for (const forbidden of ["revenuecat", "api key", "test key", "entitlement source", "environment"]) {
  assert(!userFacingCopy.includes(forbidden), `User-facing Upgrade copy should not include ${forbidden}.`);
}

const monthlyPackage: UpgradePackageDisplay = {
  identifier: "monthly",
  packageType: "MONTHLY",
  priceString: "$4.99",
  productIdentifier: "flashly_pro_monthly",
  title: "Flashly Monthly",
};
const yearlyPackage: UpgradePackageDisplay = {
  identifier: "annual",
  packageType: "ANNUAL",
  priceString: "$39.99",
  productIdentifier: "flashly_pro_annual",
  title: "Flashly Annual",
};
const lifetimePackage: UpgradePackageDisplay = {
  identifier: "lifetime",
  packageType: "LIFETIME",
  priceString: "$99.99",
  productIdentifier: "flashly_pro_lifetime",
  title: "Lifetime",
};

const displayedPackages = getDisplayedUpgradePackages([lifetimePackage, monthlyPackage, yearlyPackage]);
assert(displayedPackages.length === 2, "Only recurring packages should be preferred when recurring packages exist.");
assert(displayedPackages[0]?.priceString === "$4.99", "Available offerings should preserve localized package prices.");
assert(getPreferredUpgradePackageId(displayedPackages) === "annual", "Annual package should be selected by default when available.");
assert(getUpgradePackageLabel(monthlyPackage) === "Monthly", "Monthly packages should have a clean label.");
assert(getUpgradePackageLabel(yearlyPackage) === "Yearly", "Annual packages should have a clean yearly label.");
assert(getUpgradePackagePeriodLabel(monthlyPackage) === "/ month", "Monthly package should show monthly period.");
assert(getUpgradePackagePeriodLabel(yearlyPackage) === "/ year", "Yearly package should show yearly period.");
assert(getUpgradePackageBadge(yearlyPackage) === "Best value", "Annual package should show Best value.");

const selectedMonthly = getSelectedUpgradePackage(displayedPackages, "monthly");
const selectedYearly = getSelectedUpgradePackage(displayedPackages, "annual");
assert(getPurchaseButtonLabel(selectedMonthly) === "Continue with Monthly", "Selected monthly package should control purchase CTA.");
assert(getPurchaseButtonLabel(selectedYearly) === "Continue with Yearly", "Selected yearly package should control purchase CTA.");

const baseStateInput = {
  canUsePurchases: true,
  hasAttemptedPackageLoad: true,
  isLoadingPackages: false,
  isLoadingSubscription: false,
  isRestoring: false,
  packageCount: displayedPackages.length,
  packageLoadFailed: false,
  planId: "free" as const,
  purchasingPackageId: null,
};

assert(
  getUpgradeBillingState({ ...baseStateInput, isLoadingSubscription: true, canUsePurchases: false }) === "loading",
  "Loading state should not immediately show an unavailable message.",
);
assert(getUpgradeBillingState(baseStateInput) === "available", "Available offerings should enter available state.");
assert(
  getUpgradeBillingState({ ...baseStateInput, purchasingPackageId: "annual" }) === "purchasing",
  "Purchasing should remain explicit while a purchase is in flight.",
);
assert(
  getUpgradeBillingState({ ...baseStateInput, isRestoring: true }) === "restoring",
  "Restoring should remain explicit while restore is in flight.",
);
assert(
  getUpgradeBillingState({ ...baseStateInput, canUsePurchases: false, packageCount: 0 }) === "unavailable",
  "Unavailable state should use a compact friendly notice.",
);
assert(
  getUpgradeBillingState({ ...baseStateInput, packageLoadFailed: true, packageCount: 0 }) === "error",
  "Package load failures should enter the error state without technical UI.",
);
assert(
  getUpgradeBillingState({ ...baseStateInput, planId: "pro" }) === "pro-active",
  "Existing Pro users should not see purchase cards.",
);

assert(
  canStartUpgradePurchase({ billingState: "available", selectedPackageId: "annual" }),
  "Purchase should be enabled only with an available selected package.",
);
assert(
  !canStartUpgradePurchase({ billingState: "purchasing", selectedPackageId: "annual" }),
  "Purchase action should not run twice.",
);
assert(
  !canStartUpgradePurchase({ billingState: "available", selectedPackageId: null }),
  "Purchase should be disabled without a selected package.",
);
assert(
  canStartUpgradeRestore({ canUsePurchases: true, isRestoring: false, purchasingPackageId: null }),
  "Restore should be available when purchase initialization is available.",
);
assert(
  !canStartUpgradeRestore({ canUsePurchases: true, isRestoring: true, purchasingPackageId: null }),
  "Restore should not run twice.",
);
assert(
  !canStartUpgradeRestore({ canUsePurchases: true, isRestoring: false, purchasingPackageId: "annual" }),
  "Restore should be disabled during purchase.",
);

assert(
  shouldReturnAfterEntitlementRefresh({ customerHasPro: true, refreshedPlanId: "free" }),
  "Successful purchase should return after RevenueCat entitlement is active.",
);
assert(
  shouldReturnAfterEntitlementRefresh({ customerHasPro: false, refreshedPlanId: "pro" }),
  "Successful purchase should return after backend entitlement refresh is Pro.",
);
assert(
  !shouldReturnAfterEntitlementRefresh({ customerHasPro: false, refreshedPlanId: "free" }),
  "Failed or pending entitlement should stay on Upgrade.",
);

const cancelledError = { code: "PurchaseCancelledError", userCancelled: true };
assert(isPurchaseCancellation(cancelledError), "Cancelled purchases should be identified.");
assert(
  getPurchaseFeedbackMessage(cancelledError) === UPGRADE_COPY.purchaseCancelledMessage,
  "Cancelled purchase should show non-error feedback.",
);
assert(
  getPurchaseFeedbackMessage(new Error("Store unavailable")) === UPGRADE_COPY.purchaseErrorMessage,
  "Failed purchase should show friendly error feedback.",
);

const activeTrial: SubscriptionStatusResponse = {
  entitlementSource: "none",
  limits: {
    maxDecks: 20,
    maxFileSizeBytes: 10,
    maxGeneratedCardsPerMonth: 300,
    maxUploadsPerMonth: 10,
  },
  planId: "free",
  planLabel: "Free",
  status: "none",
  trial: {
    activeUsageDayCount: 1,
    isExpired: false,
    maxActiveUsageDays: 3,
    remainingActiveUsageDays: 2,
  },
};
assert(getTrialSummaryLine(activeTrial) === "2 free study days remaining", "Active trial should show subtle remaining days.");
assert(
  getTrialSummaryLine({ ...activeTrial, trial: { ...activeTrial.trial, isExpired: true, remainingActiveUsageDays: 0 } }) ===
    "Your free trial has ended",
  "Expired trial should use friendly ended copy.",
);

assert(
  UPGRADE_COPY.noPackagesTitle === "Subscriptions are temporarily unavailable",
  "Unavailable state should show only the friendly compact title.",
);
assert(
  UPGRADE_COPY.noRestoredPurchaseMessage === "No active Pro purchase was found for this account.",
  "No restored entitlement should show friendly feedback.",
);

console.log("PASS upgrade page presentation checks");
