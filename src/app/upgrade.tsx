import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiRequest } from "@/api/client";
import type { SubscriptionStatusResponse } from "@/api/contracts";
import { PressableScale } from "@/components/animated/pressable-scale";
import {
  customerHasProEntitlement,
  getRevenueCatAvailability,
  getRevenueCatPackages,
  purchaseRevenueCatPackage,
  restoreRevenueCatPurchases,
  type FlashlyRevenueCatPackage,
} from "@/lib/billing/revenuecatPurchases";
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
} from "@/lib/billing/upgradePagePresentation";
import { safeBack } from "@/lib/navigation/safeBack";
import { ROUTES, logNavigation } from "@/lib/navigation/routes";
import { colors } from "@/theme";

const fallbackSubscription: SubscriptionStatusResponse = {
  entitlementSource: "none",
  limits: {
    maxDecks: 20,
    maxFileSizeBytes: 10 * 1024 * 1024,
    maxGeneratedCardsPerMonth: 300,
    maxUploadsPerMonth: 10,
  },
  planId: "free",
  planLabel: "Free",
  status: "none",
  trial: {
    activeUsageDayCount: 0,
    isExpired: false,
    maxActiveUsageDays: 3,
    remainingActiveUsageDays: 3,
  },
};

const termsUrl = process.env.EXPO_PUBLIC_FLASHLY_TERMS_URL?.trim();
const privacyUrl = process.env.EXPO_PUBLIC_FLASHLY_PRIVACY_URL?.trim();

const getRenewalDisclaimer = () => {
  if (Platform.OS === "android") {
    return "Subscriptions renew automatically unless cancelled through your Google Play account.";
  }

  if (Platform.OS === "ios") {
    return "Subscriptions renew automatically unless cancelled through your App Store account.";
  }

  return UPGRADE_COPY.autoRenewDisclaimer;
};

const logBillingIssue = (payload: { action: string; reason?: string }) => {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn("[Flashly Billing]", payload);
  }
};

function CheckRow({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-7 w-7 items-center justify-center rounded-full bg-lingua-purple">
        <Text selectable={false} className="font-poppins-bold text-[13px] leading-[17px] text-white">
          {"\u2713"}
        </Text>
      </View>
      <Text selectable className="flex-1 text-[14px] leading-[20px] text-ink">
        {label}
      </Text>
    </View>
  );
}

function PackageOption({
  disabled,
  isSelected,
  item,
  onPress,
}: {
  disabled: boolean;
  isSelected: boolean;
  item: FlashlyRevenueCatPackage;
  onPress: () => void;
}) {
  const badge = getUpgradePackageBadge(item);

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className={`rounded-[22px] border bg-white px-4 py-3 ${
        isSelected ? "border-lingua-purple" : "border-[#ECE6FF]"
      } ${disabled ? "opacity-70" : ""}`}
      disabled={disabled}
      haptic={!disabled}
      onPress={onPress}
      pressedScale={0.98}
      style={isSelected ? { boxShadow: "0 8px 18px rgba(108, 78, 245, 0.12)" } : undefined}
    >
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text selectable className="font-poppins-bold text-[17px] leading-[23px] text-ink">
              {getUpgradePackageLabel(item)}
            </Text>
            {badge ? (
              <View className="rounded-full bg-[#F7F4FF] px-3 py-1">
                <Text selectable={false} className="font-poppins-semibold text-[11px] leading-[15px] text-lingua-purple">
                  {badge}
                </Text>
              </View>
            ) : null}
          </View>
          <Text selectable className="mt-1 text-[13px] leading-[18px] text-muted">
            Flashly Pro
          </Text>
        </View>
        <View className="items-end">
          <Text selectable className="font-poppins-bold text-[18px] leading-[24px] text-lingua-purple">
            {item.priceString}
          </Text>
          <Text selectable className="text-[12px] leading-[17px] text-muted">
            {getUpgradePackagePeriodLabel(item)}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

function LegalTextLink({ label, url }: { label: string; url?: string }) {
  if (!url) {
    return (
      <Text selectable className="font-poppins-semibold text-[12px] leading-[18px] text-muted">
        {label}
      </Text>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => {
        Linking.openURL(url).catch(() => {
          logBillingIssue({ action: "upgrade-legal-link-failed", reason: label });
        });
      }}
    >
      <Text selectable={false} className="font-poppins-semibold text-[12px] leading-[18px] text-lingua-purple">
        {label}
      </Text>
    </Pressable>
  );
}

export default function UpgradeScreen() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const insets = useSafeAreaInsets();
  const [subscription, setSubscription] = useState<SubscriptionStatusResponse>(fallbackSubscription);
  const [packages, setPackages] = useState<FlashlyRevenueCatPackage[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [purchasingPackageId, setPurchasingPackageId] = useState<string | null>(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [hasAttemptedPackageLoad, setHasAttemptedPackageLoad] = useState(false);
  const [packageLoadFailed, setPackageLoadFailed] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const availability = getRevenueCatAvailability(isLoaded && isSignedIn ? userId : null);
  const canUsePurchases = availability.available;
  const availabilityReason = availability.available ? null : availability.reason;
  const displayedPackages = useMemo(() => getDisplayedUpgradePackages(packages), [packages]);
  const selectedPackage = getSelectedUpgradePackage(displayedPackages, selectedPackageId);
  const trialSummary = getTrialSummaryLine(subscription);
  const billingState = getUpgradeBillingState({
    canUsePurchases,
    hasAttemptedPackageLoad,
    isLoadingPackages,
    isLoadingSubscription,
    isRestoring,
    packageCount: displayedPackages.length,
    packageLoadFailed,
    planId: subscription.planId,
    purchasingPackageId,
  });
  const canPurchase = canStartUpgradePurchase({ billingState, selectedPackageId });
  const canRestore = canStartUpgradeRestore({ canUsePurchases, isRestoring, purchasingPackageId });
  const isBusy = billingState === "purchasing" || billingState === "restoring";
  const renewalDisclaimer = getRenewalDisclaimer();
  const contentStyle = useMemo(
    () => ({
      gap: 14,
      paddingBottom: Math.max(insets.bottom + 96, 132),
      paddingHorizontal: 18,
      paddingTop: Math.max(insets.top + 12, 24),
    }),
    [insets.bottom, insets.top],
  );

  const refreshSubscription = useCallback(async () => {
    setIsLoadingSubscription(true);

    try {
      const response = await apiRequest<SubscriptionStatusResponse>("/api/me/subscription", {
        debugLabel: "getSubscriptionStatus",
      });
      setSubscription(response);
      return response;
    } catch (error) {
      logBillingIssue({
        action: "upgrade-subscription-refresh-failed",
        reason: error instanceof Error ? error.message : "unknown",
      });
      setErrorMessage("We could not refresh your subscription status. Please try again.");
      return null;
    } finally {
      setIsLoadingSubscription(false);
    }
  }, []);

  const loadPackages = useCallback(async () => {
    if (!canUsePurchases || !userId) {
      setPackages([]);
      setHasAttemptedPackageLoad(false);
      setPackageLoadFailed(false);
      return;
    }

    setIsLoadingPackages(true);
    setHasAttemptedPackageLoad(false);
    setPackageLoadFailed(false);

    try {
      const nextPackages = await getRevenueCatPackages(userId);
      setPackages(nextPackages);
      setStatusMessage(null);
      setErrorMessage(null);

      if (nextPackages.length === 0) {
        logBillingIssue({
          action: "upgrade-offerings-unavailable",
          reason: "no packages returned",
        });
      }
    } catch (error) {
      setPackages([]);
      setPackageLoadFailed(true);
      logBillingIssue({
        action: "upgrade-offerings-unavailable",
        reason: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      setHasAttemptedPackageLoad(true);
      setIsLoadingPackages(false);
    }
  }, [canUsePurchases, userId]);

  useEffect(() => {
    void refreshSubscription();
  }, [refreshSubscription]);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  useEffect(() => {
    const preferredPackageId = getPreferredUpgradePackageId(displayedPackages);

    setSelectedPackageId((current) =>
      current && displayedPackages.some((item) => item.identifier === current) ? current : preferredPackageId,
    );
  }, [displayedPackages]);

  useEffect(() => {
    if (!availabilityReason || isLoadingSubscription) {
      return;
    }

    logBillingIssue({
      action: "upgrade-offerings-unavailable",
      reason: availabilityReason,
    });
  }, [availabilityReason, isLoadingSubscription]);

  const returnAfterProActivation = (action: string) => {
    logNavigation({
      action,
      from: ROUTES.upgrade,
      reason: "pro entitlement active",
      to: "previous-valid-route",
    });
    safeBack(ROUTES.profile as never);
  };

  const handlePurchase = async () => {
    if (!selectedPackage || !userId || !canPurchase) {
      return;
    }

    let shouldReturnToPreviousRoute = false;
    setPurchasingPackageId(selectedPackage.identifier);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const customerInfo = await purchaseRevenueCatPackage(userId, selectedPackage);
      const refreshedSubscription = await refreshSubscription();
      shouldReturnToPreviousRoute = shouldReturnAfterEntitlementRefresh({
        customerHasPro: customerHasProEntitlement(customerInfo),
        refreshedPlanId: refreshedSubscription?.planId,
      });

      if (!shouldReturnToPreviousRoute) {
        setStatusMessage("Purchase finished. Your Pro access is syncing. Try restoring purchases if it does not appear soon.");
      }
    } catch (error) {
      const message = getPurchaseFeedbackMessage(error);

      if (isPurchaseCancellation(error)) {
        setStatusMessage(message);
      } else {
        setErrorMessage(message);
      }

      logBillingIssue({
        action: "upgrade-purchase-failed",
        reason: error instanceof Error ? error.message : "cancelled-or-unknown",
      });
    } finally {
      setPurchasingPackageId(null);
    }

    if (shouldReturnToPreviousRoute) {
      returnAfterProActivation("purchase-success-return");
    }
  };

  const handleRestore = async () => {
    if (!userId || !canRestore) {
      return;
    }

    let shouldReturnToPreviousRoute = false;
    setIsRestoring(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const customerInfo = await restoreRevenueCatPurchases(userId);
      const refreshedSubscription = await refreshSubscription();
      shouldReturnToPreviousRoute = shouldReturnAfterEntitlementRefresh({
        customerHasPro: customerHasProEntitlement(customerInfo),
        refreshedPlanId: refreshedSubscription?.planId,
      });

      if (!shouldReturnToPreviousRoute) {
        setStatusMessage(UPGRADE_COPY.noRestoredPurchaseMessage);
      }
    } catch (error) {
      setErrorMessage(UPGRADE_COPY.restoreErrorMessage);
      logBillingIssue({
        action: "upgrade-restore-failed",
        reason: error instanceof Error ? error.message : "unknown",
      });
    } finally {
      setIsRestoring(false);
    }

    if (shouldReturnToPreviousRoute) {
      returnAfterProActivation("restore-success-return");
    }
  };

  const handleRetryPackages = () => {
    setStatusMessage(null);
    setErrorMessage(null);

    if (canUsePurchases) {
      void loadPackages();
      return;
    }

    void refreshSubscription();
  };

  return (
    <ScrollView
      className="bg-lingua-background"
      contentContainerStyle={contentStyle}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View className="flex-row items-center justify-between">
        <PressableScale
          className="h-12 w-12 items-center justify-center rounded-full bg-white shadow-card"
          haptic
          onPress={() => safeBack(ROUTES.profile as never)}
        >
          <Text selectable={false} className="font-poppins-bold text-[26px] leading-[30px] text-ink">
            {"<"}
          </Text>
        </PressableScale>
        <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
          Upgrade
        </Text>
        <View className="h-12 w-12" />
      </View>

      <View className="rounded-[28px] bg-lingua-purple p-5 shadow-card">
        <View className="self-start rounded-full bg-white/15 px-3 py-1.5">
          <Text selectable className="font-poppins-semibold text-[12px] leading-[16px] text-white">
            {UPGRADE_COPY.heroEyebrow}
          </Text>
        </View>
        <Text selectable className="mt-3 font-poppins-bold text-[28px] leading-[34px] text-white">
          {UPGRADE_COPY.heroTitle}
        </Text>
        <Text selectable className="mt-2 text-[14px] leading-[21px] text-[#EAE4FF]">
          {UPGRADE_COPY.heroBody}
        </Text>
      </View>

      <View className="gap-3 px-1">
        <Text selectable className="font-poppins-bold text-[19px] leading-[25px] text-ink">
          What Pro unlocks
        </Text>
        {UPGRADE_COPY.benefits.map((benefit) => (
          <CheckRow key={benefit} label={benefit} />
        ))}
      </View>

      {billingState === "loading" ? (
        <View className="flex-row items-center rounded-[22px] bg-white px-4 py-4 shadow-card">
          <ActivityIndicator color={colors.primary.purple} />
          <Text selectable className="ml-3 text-[14px] leading-[21px] text-muted">
            Loading subscription options...
          </Text>
        </View>
      ) : null}

      {billingState === "pro-active" ? (
        <View className="rounded-[24px] bg-white p-4 shadow-card">
          <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
            Flashly Pro is active
          </Text>
          <Text selectable className="mt-2 text-[14px] leading-[21px] text-muted">
            You already have Pro access on this account.
          </Text>
          <PressableScale className="mt-4 items-center justify-center rounded-[22px] bg-lingua-purple px-5 py-3" haptic onPress={() => safeBack(ROUTES.profile as never)}>
            <Text selectable={false} className="font-poppins-semibold text-[15px] leading-[21px] text-white">
              Back to Profile
            </Text>
          </PressableScale>
        </View>
      ) : null}

      {billingState === "available" || billingState === "purchasing" || billingState === "restoring" ? (
        <View className="gap-3">
          <Text selectable className="px-1 font-poppins-bold text-[19px] leading-[25px] text-ink">
            Choose a plan
          </Text>
          {displayedPackages.map((item) => (
            <PackageOption
              key={item.identifier}
              disabled={isBusy}
              isSelected={selectedPackageId === item.identifier}
              item={item}
              onPress={() => setSelectedPackageId(item.identifier)}
            />
          ))}
        </View>
      ) : null}

      {billingState === "unavailable" || billingState === "error" ? (
        <View className="rounded-[22px] bg-white px-4 py-4 shadow-card">
          <Text selectable className="font-poppins-bold text-[17px] leading-[23px] text-ink">
            {UPGRADE_COPY.noPackagesTitle}
          </Text>
          <Text selectable className="mt-2 text-[14px] leading-[21px] text-muted">
            {UPGRADE_COPY.noPackagesMessage}
          </Text>
          <PressableScale
            className="mt-3 self-start rounded-full bg-[#F7F4FF] px-4 py-2"
            haptic
            onPress={handleRetryPackages}
          >
            <Text selectable={false} className="font-poppins-semibold text-[13px] leading-[18px] text-lingua-purple">
              Try again
            </Text>
          </PressableScale>
        </View>
      ) : null}

      {trialSummary ? (
        <Text selectable className="px-1 text-center text-[13px] leading-[19px] text-muted">
          {trialSummary}
        </Text>
      ) : null}

      {billingState === "available" || billingState === "purchasing" || billingState === "restoring" ? (
        <PressableScale
          className={`items-center justify-center rounded-[24px] px-6 py-4 shadow-card ${
            canPurchase ? "bg-lingua-purple" : "bg-[#D8DCEB]"
          }`}
          disabled={!canPurchase}
          haptic={canPurchase}
          onPress={handlePurchase}
        >
          {billingState === "purchasing" ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text selectable={false} className="font-poppins-semibold text-[18px] leading-[24px] text-white">
              {getPurchaseButtonLabel(selectedPackage)}
            </Text>
          )}
        </PressableScale>
      ) : null}

      {canUsePurchases && billingState !== "loading" && billingState !== "pro-active" ? (
        <PressableScale
          className="items-center justify-center rounded-[20px] border border-[#E6E0FA] bg-white px-5 py-3"
          disabled={!canRestore}
          haptic={canRestore}
          onPress={handleRestore}
        >
          {isRestoring ? (
            <ActivityIndicator color={colors.primary.purple} />
          ) : (
            <Text selectable={false} className="font-poppins-semibold text-[14px] leading-[20px] text-lingua-purple">
              Restore purchases
            </Text>
          )}
        </PressableScale>
      ) : null}

      {statusMessage ? (
        <Text selectable className="text-center text-[14px] leading-[21px] text-[#1F8F5F]">
          {statusMessage}
        </Text>
      ) : null}
      {errorMessage ? (
        <Text selectable className="text-center text-[14px] leading-[21px] text-[#C43D32]">
          {errorMessage}
        </Text>
      ) : null}

      <View className="items-center gap-2 px-3 pb-1">
        <Text selectable className="text-center text-[12px] leading-[18px] text-muted">
          {renewalDisclaimer}
        </Text>
        <View className="flex-row items-center justify-center gap-2">
          <LegalTextLink label={UPGRADE_COPY.termsLabel} url={termsUrl} />
          <Text selectable={false} className="text-[12px] leading-[18px] text-muted">
            {"\u2022"}
          </Text>
          <LegalTextLink label={UPGRADE_COPY.privacyLabel} url={privacyUrl} />
        </View>
      </View>
    </ScrollView>
  );
}
