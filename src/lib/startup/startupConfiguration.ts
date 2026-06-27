export type StartupConfigurationReady = {
  isReady: true;
  clerkPublishableKey: string;
  postHogHost?: string;
  postHogKey?: string;
};

export type StartupConfigurationError = {
  isReady: false;
  missingKeys: string[];
  reason: "missing-clerk-publishable-key";
};

export type StartupConfiguration = StartupConfigurationReady | StartupConfigurationError;

export type StartupConfigurationInput = {
  clerkPublishableKey?: string;
  postHogHost?: string;
  postHogKey?: string;
};

const clerkPublishableKeyPrefixes = ["pk_test_", "pk_live_"];

const trimmedValue = (value: string | undefined) => {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
};

const isPlausibleClerkPublishableKey = (value: string) =>
  clerkPublishableKeyPrefixes.some((prefix) => value.startsWith(prefix) && value.length > prefix.length);

export const validateStartupConfiguration = (input: StartupConfigurationInput): StartupConfiguration => {
  const clerkPublishableKey = trimmedValue(input.clerkPublishableKey);

  if (!clerkPublishableKey || !isPlausibleClerkPublishableKey(clerkPublishableKey)) {
    return {
      isReady: false,
      missingKeys: ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"],
      reason: "missing-clerk-publishable-key",
    };
  }

  return {
    clerkPublishableKey,
    isReady: true,
    postHogHost: trimmedValue(input.postHogHost),
    postHogKey: trimmedValue(input.postHogKey),
  };
};
