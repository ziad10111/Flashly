import "../../global.css";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { type ReactNode, useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { PostHogProvider } from "posthog-react-native";

import { apiRequest } from "@/api/client";
import { StreakCelebration } from "@/components/feedback/StreakCelebration";
import { XPFlyout } from "@/components/feedback/XPFlyout";
import { FLASHLY_AUTH_MODE } from "@/api/config";
import type { SubscriptionStatusResponse } from "@/api/contracts";
import { setApiAuthTokenProvider } from "@/api/authToken";
import { useStudySelectionStore } from "@/store/useStudySelectionStore";
import { initializeClientSentry, withSentryRoot } from "@/lib/monitoring/sentryClient";
import {
  createAuthRedirectGuard,
  getAuthRedirectDestination,
  isProtectedAuthPathname,
  isSignedInRedirectPathname,
  normalizeAuthPathname,
} from "@/lib/navigation/authRedirect";
import { getPostAuthRoute, logNavigation } from "@/lib/navigation/routes";
import {
  validateStartupConfiguration,
  type StartupConfigurationReady,
} from "@/lib/startup/startupConfiguration";
import { colors, useAppFonts } from "@/theme";

initializeClientSentry();

SplashScreen.preventAutoHideAsync().catch(() => {
  // Ignore duplicate prevention during fast refresh.
});

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const postHogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const postHogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST;

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

function AuthRouteGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const pathname = normalizeAuthPathname(usePathname());
  const authRedirectGuardRef = useRef(createAuthRedirectGuard());
  const hasHydrated = useStudySelectionStore((state) => state.hasHydrated);
  const selectedStudyType = useStudySelectionStore((state) => state.selectedStudyType);
  const isProtectedRoute = isProtectedAuthPathname(pathname);
  const signedInDestination = getPostAuthRoute(Boolean(selectedStudyType));
  const redirectDestination =
    FLASHLY_AUTH_MODE === "clerk"
      ? getAuthRedirectDestination({
          canRedirectSignedIn: hasHydrated,
          isLoaded,
          isProtectedRoute,
          isSignedIn: Boolean(isSignedIn),
          pathname,
          signedInDestination,
        })
      : null;

  useEffect(() => {
    if (FLASHLY_AUTH_MODE !== "clerk" || !redirectDestination) {
      authRedirectGuardRef.current.reset();
      return;
    }

    if (!authRedirectGuardRef.current.shouldNavigate({ destination: redirectDestination, pathname })) {
      return;
    }

    logNavigation({
      action: "auth-guard-redirect",
      from: pathname,
      reason: isSignedIn ? "signed-in auth route" : "signed-out protected route",
      to: redirectDestination,
    });
    router.replace(redirectDestination as never);
  }, [isSignedIn, pathname, redirectDestination, router]);

  const shouldCoverRoute =
    FLASHLY_AUTH_MODE === "clerk" &&
    ((isProtectedRoute && (!isLoaded || !isSignedIn)) ||
      (Boolean(isSignedIn) && !hasHydrated && isSignedInRedirectPathname(pathname)));

  return (
    <>
      {children}
      {shouldCoverRoute ? <View pointerEvents="auto" style={styles.authRouteOverlay} /> : null}
    </>
  );
}

function StartupConfigurationScreen() {
  return (
    <View style={styles.configurationScreen}>
      <View style={styles.configurationPanel}>
        <Text style={styles.configurationTitle}>Flashly needs a configuration update</Text>
        <Text style={styles.configurationMessage}>
          A required mobile sign-in setting is missing from this build. Please install the latest preview build after
          the app environment is updated.
        </Text>
      </View>
    </View>
  );
}

function AnalyticsProvider({
  children,
  configuration,
}: {
  children: ReactNode;
  configuration: StartupConfigurationReady;
}) {
  if (!configuration.postHogKey) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider
      apiKey={configuration.postHogKey}
      options={configuration.postHogHost ? { host: configuration.postHogHost } : undefined}
    >
      {children}
    </PostHogProvider>
  );
}

function RootLayout() {
  const [fontsLoaded] = useAppFonts();
  const startupConfiguration = validateStartupConfiguration({
    clerkPublishableKey,
    postHogHost,
    postHogKey,
  });

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

  if (!startupConfiguration.isReady) {
    return <StartupConfigurationScreen />;
  }

  return (
    <AnalyticsProvider configuration={startupConfiguration}>
      <ClerkProvider publishableKey={startupConfiguration.clerkPublishableKey} tokenCache={tokenCache}>
        <ApiAuthTokenBridge />
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          <AuthRouteGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.neutral.background },
              }}
            />
          </AuthRouteGate>
          <XPFlyout style={{ bottom: 160, left: 0, position: "absolute", right: 0 }} />
          <StreakCelebration />
        </View>
      </ClerkProvider>
    </AnalyticsProvider>
  );
}

const styles = StyleSheet.create({
  authRouteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.neutral.background,
  },
  configurationMessage: {
    color: colors.neutral.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  configurationPanel: {
    backgroundColor: colors.neutral.surface,
    borderColor: colors.neutral.border,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 360,
    paddingHorizontal: 20,
    paddingVertical: 22,
    rowGap: 10,
    width: "100%",
  },
  configurationScreen: {
    alignItems: "center",
    backgroundColor: colors.neutral.background,
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  configurationTitle: {
    color: colors.neutral.textPrimary,
    fontSize: 19,
    fontWeight: "800",
    lineHeight: 24,
    textAlign: "center",
  },
});

export default withSentryRoot(RootLayout);
