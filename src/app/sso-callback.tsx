import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { useAuth } from "@clerk/expo";

import { FLASHLY_AUTH_MODE } from "@/api/config";
import { useStudySelectionStore } from "@/store/useStudySelectionStore";
import { colors } from "@/theme";

export default function SsoCallbackScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const hasHydrated = useStudySelectionStore((state) => state.hasHydrated);
  const selectedStudyType = useStudySelectionStore((state) => state.selectedStudyType);

  if (FLASHLY_AUTH_MODE === "mock") {
    return <Redirect href={selectedStudyType ? ("/" as never) : ("/study-type" as never)} />;
  }

  if (isLoaded && hasHydrated && isSignedIn) {
    return <Redirect href={selectedStudyType ? ("/" as never) : ("/study-type" as never)} />;
  }

  if (isLoaded && !isSignedIn) {
    return <Redirect href={"/sign-in" as never} />;
  }

  return (
    <View className="flex-1 items-center justify-center bg-lingua-background px-6">
      <ActivityIndicator size="large" color={colors.primary.purple} />
      <Text selectable className="mt-4 text-center text-[16px] leading-[24px] text-muted">
        Completing sign in...
      </Text>
    </View>
  );
}
