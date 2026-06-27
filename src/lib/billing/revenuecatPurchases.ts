import Constants from "expo-constants";
import { Platform, type PlatformOSType } from "react-native";
import type { CustomerInfo, PurchasesPackage } from "react-native-purchases";

const androidApiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim();
const iosApiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim();
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
let configurePromise: Promise<PurchasesModule> | null = null;
let configuredApiKey: string | null = null;
let configuredUserId: string | null = null;

const isExpoGo = () => Constants.appOwnership === "expo";

const isNativePlatform = () => Platform.OS === "android" || Platform.OS === "ios";

const isDevelopmentBuild = () => typeof __DEV__ !== "undefined" && __DEV__;

const isRevenueCatTestKey = (apiKey: string | undefined) => apiKey?.toLowerCase().startsWith("test_") ?? false;

const getApiKey = (platform: PlatformOSType = Platform.OS) => {
  if (platform === "android") {
    return androidApiKey;
  }

  if (platform === "ios") {
    return iosApiKey;
  }

  return undefined;
};

const getPlatformLabel = () => (Platform.OS === "ios" ? "iOS" : "Android");

const getConfiguredKeyProblem = () => {
  const apiKey = getApiKey();
  const platform = getPlatformLabel();

  if (!apiKey) {
    return `RevenueCat ${platform} API key is not configured.`;
  }

  if (!isDevelopmentBuild() && isRevenueCatTestKey(apiKey)) {
    return `RevenueCat ${platform} API key is a test key. Configure the production public SDK key for this release build.`;
  }

  return null;
};

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

  if (isDevelopmentBuild()) {
    return {
      available: false,
      reason: "Payments require a release native build.",
    };
  }

  const keyProblem = getConfiguredKeyProblem();

  if (keyProblem) {
    return {
      available: false,
      reason: keyProblem,
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

const ensureRevenueCatConfigured = async (apiKey: string, initialUserId: string) => {
  const Purchases = await loadPurchases();

  if (configuredApiKey && configuredApiKey !== apiKey) {
    throw new Error("RevenueCat was already configured with a different platform key.");
  }

  if (!configurePromise) {
    configurePromise = (async () => {
      const isConfigured = await Purchases.isConfigured().catch(() => false);

      if (!isConfigured) {
        Purchases.configure({
          apiKey,
          appUserID: initialUserId,
        });
        configuredUserId = initialUserId;
      } else {
        configuredUserId = await Purchases.getAppUserID().catch(() => initialUserId);
      }

      configuredApiKey = apiKey;
      return Purchases;
    })().catch((error) => {
      configurePromise = null;
      configuredApiKey = null;
      configuredUserId = null;
      throw error;
    });
  }

  return configurePromise;
};

export const configureRevenueCat = async (userId: string) => {
  const availability = getRevenueCatAvailability(userId);

  if (!availability.available) {
    throw new Error(availability.reason);
  }

  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("RevenueCat API key is not configured for this platform.");
  }

  const Purchases = await ensureRevenueCatConfigured(apiKey, userId);

  if (configuredUserId !== userId) {
    await Purchases.logIn(userId);
    configuredUserId = userId;
  }

  return Purchases;
};

export const resetRevenueCatCustomer = async () => {
  configuredUserId = null;

  if (!isNativePlatform() || isExpoGo() || isDevelopmentBuild()) {
    return;
  }

  const apiKey = getApiKey();

  if (!apiKey || isRevenueCatTestKey(apiKey)) {
    return;
  }

  const Purchases = await loadPurchases();
  const isConfigured = await Purchases.isConfigured().catch(() => false);

  if (isConfigured) {
    await Purchases.logOut();
  }
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
