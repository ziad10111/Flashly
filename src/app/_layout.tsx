import "../../global.css";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { View } from "react-native";
import { PostHogProvider } from "posthog-react-native";

import { apiRequest } from "@/api/client";
import { StreakCelebration } from "@/components/feedback/StreakCelebration";
import { XPFlyout } from "@/components/feedback/XPFlyout";
import { FLASHLY_AUTH_MODE } from "@/api/config";
import type { SubscriptionStatusResponse } from "@/api/contracts";
import { setApiAuthTokenProvider } from "@/api/authToken";
import { useStudySelectionStore } from "@/store/useStudySelectionStore";
import { initializeClientSentry, withSentryRoot } from "@/lib/monitoring/sentryClient";
import { colors, useAppFonts } from "@/theme";

initializeClientSentry();

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore duplicate prevention during fast refresh.
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

function ApiAuthTokenBridge() {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth();

  useEffect(() => {
    if (FLASHLY_AUTH_MODE !== "clerk" || !isLoaded || !isSignedIn) {
      setApiAuthTokenProvider(null);
      return;
    }

    setApiAuthTokenProvider(() => getToken());
    void apiRequest<SubscriptionStatusResponse>("/api/me/subscription", {
      debugLabel: "recordTrialActivity",
    }).catch(() => undefined);

    return () => setApiAuthTokenProvider(null);
  }, [getToken, isLoaded, isSignedIn, userId]);

  return null;
}

function RootLayout() {
  const [fontsLoaded] = useAppFonts();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.neutral.background).catch(() => {
      // Ignore unsupported platforms.
    });
  }, []);

  useEffect(() => {
    if (useStudySelectionStore.persist.hasHydrated()) {
      useStudySelectionStore.getState().setHasHydrated(true);
      return;
    }

    Promise.resolve(useStudySelectionStore.persist.rehydrate()).catch(() => {
      useStudySelectionStore.getState().setHasHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore repeated hide calls during fast refresh.
      });
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.neutral.background }} />;
  }

  if (!publishableKey) {
    throw new Error("Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to the .env file.");
  }

  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_KEY!}
      options={{ host: process.env.EXPO_PUBLIC_POSTHOG_HOST }}
    >
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <ApiAuthTokenBridge />
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.neutral.background },
            }}
          />
          <XPFlyout style={{ bottom: 160, left: 0, position: "absolute", right: 0 }} />
          <StreakCelebration />
        </View>
      </ClerkProvider>
    </PostHogProvider>
  );
}

export default withSentryRoot(RootLayout);
