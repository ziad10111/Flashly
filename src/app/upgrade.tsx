import { useAuth } from "@clerk/expo";
import type { SubscriptionStatusResponse } from "@/api/contracts";
import { apiRequest } from "@/api/client";
import { PressableScale } from "@/components/animated/pressable-scale";
import {
  customerHasProEntitlement,
  getRevenueCatAvailability,
  getRevenueCatPackages,
  purchaseRevenueCatPackage,
  restoreRevenueCatPurchases,
  type FlashlyRevenueCatPackage,
} from "@/lib/billing/revenuecatPurchases";
import { safeBack } from "@/lib/navigation/safeBack";
import { colors } from "@/theme";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const formatLimit = (value: number | "unlimited") =>
  value === "unlimited" ? "Unlimited" : value.toLocaleString();

const formatMegabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

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
};

const getPackageLabel = (item: FlashlyRevenueCatPackage) => {
  const normalizedType = item.packageType.toLowerCase();

  if (normalizedType.includes("annual") || normalizedType.includes("year")) {
    return "Yearly Pro";
  }

  if (normalizedType.includes("month")) {
    return "Monthly Pro";
  }

  return item.title;
};

const isRecurringProPackage = (item: FlashlyRevenueCatPackage) => {
  const normalizedType = item.packageType.toLowerCase();
  const normalizedProductId = item.productIdentifier.toLowerCase();

  return (
    normalizedType.includes("annual") ||
    normalizedType.includes("year") ||
    normalizedType.includes("month") ||
    normalizedProductId.includes("year") ||
    normalizedProductId.includes("annual") ||
    normalizedProductId.includes("month")
  );
};

export default function UpgradeScreen() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const insets = useSafeAreaInsets();
  const [subscription, setSubscription] = useState<SubscriptionStatusResponse>(fallbackSubscription);
  const [packages, setPackages] = useState<FlashlyRevenueCatPackage[]>([]);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [activePackageId, setActivePackageId] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const availability = getRevenueCatAvailability(isLoaded && isSignedIn ? userId : null);
  const canUsePurchases = availability.available;
  const recurringPackages = useMemo(() => packages.filter(isRecurringProPackage), [packages]);
  const displayedPackages = recurringPackages.length > 0 ? recurringPackages : packages;
  const contentStyle = useMemo(
    () => ({
      paddingBottom: Math.max(insets.bottom + 28, 56),
      paddingHorizontal: 20,
      paddingTop: Math.max(insets.top + 14, 28),
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
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load subscription status.");
    } finally {
      setIsLoadingSubscription(false);
    }
  }, []);

  const loadPackages = useCallback(async () => {
    if (!canUsePurchases || !userId) {
      setPackages([]);
      return;
    }

    setIsLoadingPackages(true);

    try {
      const nextPackages = await getRevenueCatPackages(userId);
      setPackages(nextPackages);
      setErrorMessage(nextPackages.length === 0 ? "No RevenueCat packages are available yet." : null);
    } catch (error) {
      setPackages([]);
      setErrorMessage(error instanceof Error ? error.message : "Could not load RevenueCat offerings.");
    } finally {
      setIsLoadingPackages(false);
    }
  }, [canUsePurchases, userId]);

  useEffect(() => {
    void refreshSubscription();
  }, [refreshSubscription]);

  useEffect(() => {
    void loadPackages();
  }, [loadPackages]);

  const handlePurchase = async (item: FlashlyRevenueCatPackage) => {
    if (!userId) {
      setErrorMessage("Sign in to upgrade.");
      return;
    }

    setActivePackageId(item.identifier);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const customerInfo = await purchaseRevenueCatPackage(userId, item);
      setStatusMessage(
        customerHasProEntitlement(customerInfo)
          ? "Purchase complete. Syncing your Pro plan..."
          : "Purchase finished. Waiting for subscription sync...",
      );
      await refreshSubscription();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Purchase could not be completed.");
    } finally {
      setActivePackageId(null);
    }
  };

  const handleRestore = async () => {
    if (!userId) {
      setErrorMessage("Sign in to restore purchases.");
      return;
    }

    setIsRestoring(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const customerInfo = await restoreRevenueCatPurchases(userId);
      setStatusMessage(
        customerHasProEntitlement(customerInfo)
          ? "Purchases restored. Syncing your Pro plan..."
          : "No active Pro purchase was found for this account.",
      );
      await refreshSubscription();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Purchases could not be restored.");
    } finally {
      setIsRestoring(false);
    }
  };

  const benefits = [
    `${formatMegabytes(50 * 1024 * 1024)} uploads for large PDFs`,
    "Much higher monthly card generation",
    "Room for thousands of study decks",
    "RevenueCat-backed Google Play subscriptions",
  ];

  return (
    <ScrollView
      className="bg-lingua-background"
      contentContainerStyle={contentStyle}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-4">
        <View className="flex-row items-center justify-between">
          <PressableScale
            className="h-12 w-12 items-center justify-center rounded-full bg-white shadow-card"
            haptic
            onPress={() => safeBack("/" as never)}
          >
            <Text selectable={false} className="font-poppins-bold text-[26px] leading-[30px] text-ink">
              {"‹"}
            </Text>
          </PressableScale>
          <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
            Upgrade
          </Text>
          <View className="h-12 w-12" />
        </View>

        <View className="overflow-hidden rounded-[32px] bg-lingua-purple p-6 shadow-card">
          <View className="self-start rounded-full bg-white/15 px-4 py-2">
            <Text selectable className="font-poppins-semibold text-[12px] leading-[16px] text-white">
              Flashly Pro
            </Text>
          </View>
          <Text selectable className="mt-4 font-poppins-bold text-[34px] leading-[40px] text-white">
            More cards, bigger files, faster studying.
          </Text>
          <Text selectable className="mt-3 text-[15px] leading-[23px] text-[#EAE4FF]">
            {canUsePurchases ? "Choose a plan below to start Pro." : "Payments will be enabled in a production build."}
          </Text>
        </View>

        <View className="rounded-[28px] border border-[#ECE6FF] bg-white p-5 shadow-card">
          <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
            Current plan
          </Text>
          {isLoadingSubscription ? (
            <View className="mt-4 flex-row items-center">
              <ActivityIndicator color={colors.primary.purple} />
              <Text selectable className="ml-3 text-[14px] leading-[21px] text-muted">
                Checking plan...
              </Text>
            </View>
          ) : (
            <>
              <Text selectable className="mt-3 font-poppins-bold text-[28px] leading-[34px] text-lingua-purple">
                {subscription.planLabel}
              </Text>
              <Text selectable className="mt-1 text-[14px] leading-[21px] text-muted">
                Source: {subscription.entitlementSource} • Status: {subscription.status}
              </Text>
              {subscription.renewalOrExpirationDate ? (
                <Text selectable className="mt-1 text-[14px] leading-[21px] text-muted">
                  Renews or expires {new Date(subscription.renewalOrExpirationDate).toLocaleDateString()}
                </Text>
              ) : null}
            </>
          )}
        </View>

        <View className="rounded-[28px] border border-[#ECE6FF] bg-white p-5 shadow-card">
          <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
            Choose Pro
          </Text>
          {!canUsePurchases ? (
            <View className="mt-4 rounded-[22px] bg-[#FFF7E8] p-4">
              <Text selectable className="font-poppins-semibold text-[15px] leading-[22px] text-[#A56300]">
                Payments unavailable
              </Text>
              <Text selectable className="mt-1 text-[14px] leading-[21px] text-[#8A6B36]">
                {availability.reason} Payments will be enabled in a production build.
              </Text>
            </View>
          ) : isLoadingPackages ? (
            <View className="mt-4 flex-row items-center">
              <ActivityIndicator color={colors.primary.purple} />
              <Text selectable className="ml-3 text-[14px] leading-[21px] text-muted">
                Loading RevenueCat packages...
              </Text>
            </View>
          ) : displayedPackages.length > 0 ? (
            <View className="mt-4 gap-3">
              {displayedPackages.map((item) => (
                <PressableScale
                  key={item.identifier}
                  className="rounded-[24px] border border-[#ECE6FF] bg-[#F7F4FF] p-4"
                  disabled={activePackageId !== null || isRestoring}
                  haptic
                  onPress={() => handlePurchase(item)}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text selectable className="font-poppins-bold text-[17px] leading-[23px] text-ink">
                        {getPackageLabel(item)}
                      </Text>
                      <Text selectable className="mt-1 text-[13px] leading-[19px] text-muted">
                        {item.productIdentifier}
                      </Text>
                    </View>
                    <Text selectable className="font-poppins-bold text-[17px] leading-[23px] text-lingua-purple">
                      {activePackageId === item.identifier ? "..." : item.priceString}
                    </Text>
                  </View>
                </PressableScale>
              ))}
            </View>
          ) : (
            <Text selectable className="mt-4 text-[14px] leading-[21px] text-muted">
              No monthly or yearly Pro packages are available yet.
            </Text>
          )}

          <PressableScale
            className={`mt-4 items-center justify-center rounded-[22px] px-5 py-3 ${
              canUsePurchases ? "bg-white" : "bg-[#F2EFFB]"
            }`}
            disabled={!canUsePurchases || isRestoring || activePackageId !== null}
            haptic
            onPress={handleRestore}
          >
            <Text selectable={false} className="font-poppins-semibold text-[14px] leading-[20px] text-lingua-purple">
              {isRestoring ? "Restoring..." : "Restore purchases"}
            </Text>
          </PressableScale>
        </View>

        <View className="rounded-[28px] border border-[#ECE6FF] bg-white p-5 shadow-card">
          <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
            Pro benefits
          </Text>
          <View className="mt-4 gap-3">
            {benefits.map((benefit) => (
              <View key={benefit} className="flex-row items-center rounded-[20px] bg-[#F7F4FF] px-4 py-3">
                <View className="h-8 w-8 items-center justify-center rounded-full bg-lingua-purple">
                  <Text selectable={false} className="font-poppins-bold text-[14px] leading-[18px] text-white">
                    {"✓"}
                  </Text>
                </View>
                <Text selectable className="ml-3 flex-1 text-[14px] leading-[21px] text-ink">
                  {benefit}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="rounded-[28px] border border-[#ECE6FF] bg-white p-5 shadow-card">
          <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
            Your current limits
          </Text>
          <Text selectable className="mt-3 text-[14px] leading-[22px] text-muted">
            {formatMegabytes(subscription.limits.maxFileSizeBytes)} files • {formatLimit(subscription.limits.maxUploadsPerMonth)} uploads/month • {formatLimit(subscription.limits.maxGeneratedCardsPerMonth)} cards/month • {formatLimit(subscription.limits.maxDecks)} decks
          </Text>
        </View>

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

        <PressableScale
          className="items-center justify-center rounded-[26px] bg-lingua-purple px-6 py-4 shadow-card"
          haptic
          onPress={() => router.push("/(tabs)/profile" as never)}
        >
          <Text selectable={false} className="font-poppins-semibold text-[17px] leading-[23px] text-white">
            Back to Profile
          </Text>
        </PressableScale>
      </View>
    </ScrollView>
  );
}
