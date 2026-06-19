import Constants from "expo-constants";
import { Platform } from "react-native";

export const USE_BACKEND_API = process.env.EXPO_PUBLIC_USE_BACKEND === "true";

const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, "");

const readStringProperty = (value: unknown, key: string) => {
  if (!value || typeof value !== "object" || !(key in value)) {
    return undefined;
  }

  const nextValue = (value as Record<string, unknown>)[key];

  return typeof nextValue === "string" ? nextValue : undefined;
};

const getExpoDevServerHost = () => {
  const hostUri = readStringProperty(Constants.expoConfig, "hostUri");
  const debuggerHost = readStringProperty(Constants.manifest, "debuggerHost");
  const manifest2 = Constants.manifest2 as { extra?: unknown } | null;
  const manifest2DebuggerHost = readStringProperty(manifest2?.extra, "debuggerHost");
  const host = hostUri ?? debuggerHost ?? manifest2DebuggerHost;

  return host?.split("/")[0];
};

const getDefaultApiBaseUrl = () => {
  if (Platform.OS === "web") {
    return "";
  }

  const devServerHost = getExpoDevServerHost();

  return devServerHost ? `http://${devServerHost}` : "";
};

export const API_BASE_URL = normalizeBaseUrl(
  process.env.EXPO_PUBLIC_FLASHLY_API_BASE_URL?.trim() || getDefaultApiBaseUrl(),
);

export type FlashlyAuthMode = "mock" | "clerk";

export const FLASHLY_AUTH_MODE: FlashlyAuthMode =
  process.env.EXPO_PUBLIC_FLASHLY_AUTH_MODE === "clerk" ? "clerk" : "mock";
