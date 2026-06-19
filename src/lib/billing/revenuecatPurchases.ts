import Constants from "expo-constants";
import { Platform } from "react-native";
import type { CustomerInfo, PurchasesPackage } from "react-native-purchases";

const androidApiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();
export const revenueCatEntitlementId = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || "pro";

type PurchasesModule = typeof import("react-native-purchases").default;

export type FlashlyRevenueCatPackage = {
  identifier: string;
  packageType: string;
  priceString: string;
  productIdentifier: string;
  title: string;
  rawPackage: PurchasesPackage;
};

export type RevenueCatAvailability =
  | {
      available: true;
    }
  | {
      available: false;
      reason: string;
    };

let cachedPurchasesModule: PurchasesModule | null = null;
let configuredUserId: string | null = null;

const isExpoGo = () => Constants.appOwnership === "expo";

const isNativePlatform = () => Platform.OS === "android" || Platform.OS === "ios";

export const getRevenueCatAvailability = (userId?: string | null): RevenueCatAvailability => {
  if (!isNativePlatform()) {
    return {
      available: false,
      reason: "Purchases are available only in native Android or iOS builds.",
    };
  }

  if (isExpoGo()) {
    return {
      available: false,
      reason: "Payments require a production native build or development client, not Expo Go.",
    };
  }

  if (typeof __DEV__ !== "undefined" && __DEV__) {
    return {
      available: false,
      reason: "Payments will be enabled in a production build.",
    };
  }

  if (Platform.OS === "android" && !androidApiKey) {
    return {
      available: false,
      reason: "RevenueCat Android API key is not configured.",
    };
  }

  if (Platform.OS === "ios") {
    return {
      available: false,
      reason: "RevenueCat iOS API key is not configured yet.",
    };
  }

  if (!userId) {
    return {
      available: false,
      reason: "Sign in to upgrade with RevenueCat.",
    };
  }

  return { available: true };
};

const loadPurchases = async () => {
  if (cachedPurchasesModule) {
    return cachedPurchasesModule;
  }

  try {
    cachedPurchasesModule = (await import("react-native-purchases")).default;
    return cachedPurchasesModule;
  } catch {
    throw new Error("RevenueCat native module is unavailable in this build.");
  }
};

const getApiKey = () => {
  if (Platform.OS === "android") {
    return androidApiKey;
  }

  return undefined;
};

export const configureRevenueCat = async (userId: string) => {
  const availability = getRevenueCatAvailability(userId);

  if (!availability.available) {
    throw new Error(availability.reason);
  }

  const Purchases = await loadPurchases();
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("RevenueCat API key is not configured for this platform.");
  }

  if (configuredUserId !== userId) {
    Purchases.configure({
      apiKey,
      appUserID: userId,
    });
    configuredUserId = userId;
  }

  return Purchases;
};

const formatPackage = (item: PurchasesPackage): FlashlyRevenueCatPackage => ({
  identifier: item.identifier,
  packageType: String(item.packageType),
  priceString: item.product.priceString,
  productIdentifier: item.product.identifier,
  rawPackage: item,
  title: item.product.title || item.product.identifier,
});

export const getRevenueCatPackages = async (userId: string) => {
  const Purchases = await configureRevenueCat(userId);
  const offerings = await Purchases.getOfferings();
  const currentOffering = offerings.current;
  const availablePackages = currentOffering?.availablePackages ?? [];

  return availablePackages.map(formatPackage);
};

export const purchaseRevenueCatPackage = async (userId: string, item: FlashlyRevenueCatPackage) => {
  const Purchases = await configureRevenueCat(userId);
  const result = await Purchases.purchasePackage(item.rawPackage);

  return result.customerInfo;
};

export const restoreRevenueCatPurchases = async (userId: string): Promise<CustomerInfo> => {
  const Purchases = await configureRevenueCat(userId);

  return Purchases.restorePurchases();
};

export const customerHasProEntitlement = (customerInfo: CustomerInfo) =>
  Boolean(customerInfo.entitlements.active[revenueCatEntitlementId]);
