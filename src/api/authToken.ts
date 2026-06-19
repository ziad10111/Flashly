import { FLASHLY_AUTH_MODE } from "./config";

export type FlashlyAuthTokenProvider = () => Promise<string | null> | string | null;

let clerkAuthTokenProvider: FlashlyAuthTokenProvider | null = null;

export const setApiAuthTokenProvider = (provider: FlashlyAuthTokenProvider | null) => {
  clerkAuthTokenProvider = provider;
};

export const getApiAuthToken = async () => {
  if (FLASHLY_AUTH_MODE !== "clerk") {
    return null;
  }

  return (await clerkAuthTokenProvider?.()) ?? null;
};
