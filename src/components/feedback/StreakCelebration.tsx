import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { AnimatedOwl } from "@/components/mascot/animated-owl";
import { triggerLightHaptic } from "@/lib/feedback/haptics";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";

const streakCopy = (streak: number) => {
  if (streak >= 30) {
    return "Amazing consistency.";
  }

  if (streak >= 7) {
    return "Keep the streak alive.";
  }

  return "You're building momentum.";
};

export function StreakCelebration() {
  const pendingStreakCelebration = useFlashlyProgressStore((state) => state.pendingStreakCelebration);
  const markStreakCelebrated = useFlashlyProgressStore((state) => state.markStreakCelebrated);
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!pendingStreakCelebration) {
      return;
    }

    triggerLightHaptic();
    opacity.value = withTiming(1, { duration: 140 });
    scale.value = withSequence(
      withTiming(1.05, { duration: 180, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
    );

    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 220 });
      markStreakCelebrated(pendingStreakCelebration);
    }, 2100);

    return () => clearTimeout(timer);
  }, [markStreakCelebrated, opacity, pendingStreakCelebration, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (!pendingStreakCelebration) {
    return null;
  }

  return (
    <Animated.View
      exiting={FadeOut.duration(180)}
      pointerEvents="none"
      style={[
        {
          bottom: 118,
          left: 18,
          position: "absolute",
          right: 18,
          zIndex: 30,
        },
        animatedStyle,
      ]}
    >
      <View className="flex-row items-center rounded-[30px] border border-[#FFE0BD] bg-white p-4 shadow-card">
        <View className="h-[72px] w-[72px] items-center justify-center rounded-[24px] bg-[#FFF4EC]">
          <AnimatedOwl size={58} mood="celebration" />
        </View>
        <View className="ml-4 flex-1">
          <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
            {pendingStreakCelebration} Day Streak
          </Text>
          <Text selectable className="mt-1 text-[14px] leading-[21px] text-muted">
            {streakCopy(pendingStreakCelebration)}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}
