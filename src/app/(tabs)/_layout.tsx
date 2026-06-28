import { useAuth } from "@clerk/expo";
import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { FLASHLY_AUTH_MODE } from "@/api/config";
import { FlashlyTabBar } from "@/components/navigation/flashly-tab-bar";
import { ROUTES } from "@/lib/navigation/routes";
import { useStudySelectionStore } from "@/store/useStudySelectionStore";
import { colors } from "@/theme";

export default function TabsLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  const hasHydrated = useStudySelectionStore((state) => state.hasHydrated);
  const selectedStudyType = useStudySelectionStore((state) => state.selectedStudyType);

  if ((FLASHLY_AUTH_MODE === "clerk" && (!isLoaded || !isSignedIn)) || !hasHydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-lingua-background px-6">
        <ActivityIndicator size="large" color={colors.primary.purple} />
      </View>
    );
  }

  if (!selectedStudyType) {
    return <Redirect href={ROUTES.studyType as never} />;
  }

  return (
    <Tabs
      tabBar={(props) => <FlashlyTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.neutral.background,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="upload" options={{ title: "Upload" }} />
      <Tabs.Screen name="decks" options={{ title: "Decks" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
