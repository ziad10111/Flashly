import { Image } from "expo-image";
import { Text, View } from "react-native";
import type { ImageSourcePropType, StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";

import { images } from "@/constants/images";

type AnimatedOwlProps = {
  message?: string;
  mood?: OwlMood;
  showMessage?: boolean;
  size?: number;
  source?: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
  variant?: "float" | "bounce" | "celebrate";
};

export type OwlMood =
  | "idle"
  | "uploading"
  | "extracting"
  | "generating"
  | "success"
  | "correct"
  | "wrong"
  | "celebration"
  | "waiting";

const moodConfig: Record<OwlMood, { message: string; variant: AnimatedOwlProps["variant"] }> = {
  celebration: { message: "Great momentum.", variant: "celebrate" },
  correct: { message: "Great job!", variant: "celebrate" },
  extracting: { message: "Reading your material...", variant: "bounce" },
  generating: { message: "Creating your first cards...", variant: "bounce" },
  idle: { message: "Ready to learn?", variant: "float" },
  success: { message: "Your deck is ready!", variant: "celebrate" },
  uploading: { message: "Reading your material...", variant: "bounce" },
  waiting: { message: "More cards are on the way...", variant: "float" },
  wrong: { message: "Almost there.", variant: "float" },
};

export function AnimatedOwl({
  message,
  mood = "idle",
  showMessage = false,
  size = 96,
  source = images.mascot,
  style,
  variant,
}: AnimatedOwlProps) {
  const activeConfig = moodConfig[mood];
  const activeVariant = variant ?? activeConfig.variant ?? "float";
  const reducedMotion = useReducedMotion();
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }

    translateY.value = 0;
    rotate.value = 0;
    scale.value = 1;

    if (activeVariant === "celebrate") {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 320, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: 360, easing: Easing.inOut(Easing.cubic) }),
        ),
        -1,
        true,
      );
      rotate.value = withRepeat(
        withSequence(
          withTiming(-3, { duration: 360 }),
          withTiming(3, { duration: 360 }),
        ),
        -1,
        true,
      );
      return;
    }

    translateY.value = withRepeat(
      withSequence(
        withTiming(activeVariant === "bounce" ? -8 : -5, {
          duration: activeVariant === "bounce" ? 620 : 1400,
          easing: Easing.inOut(Easing.cubic),
        }),
        withTiming(0, {
          duration: activeVariant === "bounce" ? 620 : 1400,
          easing: Easing.inOut(Easing.cubic),
        }),
      ),
      -1,
      true,
    );
  }, [activeVariant, reducedMotion, rotate, scale, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  const owl = (
    <Animated.View style={[{ height: size, width: size }, style, animatedStyle]}>
      <Image source={source} style={{ height: "100%", width: "100%" }} contentFit="contain" />
    </Animated.View>
  );

  if (!showMessage) {
    return owl;
  }

  return (
    <View className="items-center">
      {owl}
      <View className="mt-2 rounded-full bg-white px-4 py-2 shadow-card">
        <Text selectable className="text-center font-poppins-semibold text-[12px] leading-[17px] text-lingua-purple">
          {message ?? activeConfig.message}
        </Text>
      </View>
    </View>
  );
}
