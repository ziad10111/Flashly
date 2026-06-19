import type { ComponentProps, ReactNode } from "react";
import { Pressable } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { triggerLightHaptic } from "@/lib/feedback/haptics";

type PressableProps = ComponentProps<typeof Pressable>;

type PressableScaleProps = PressableProps & {
  children: ReactNode;
  haptic?: boolean;
  pressedScale?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  children,
  disabled,
  haptic = false,
  onPress,
  onPressIn,
  onPressOut,
  pressedScale = 0.97,
  style,
  ...props
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPress={(event) => {
        if (haptic && !disabled) {
          triggerLightHaptic();
        }

        onPress?.(event);
      }}
      onPressIn={(event) => {
        scale.value = withTiming(pressedScale, { duration: 90 });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withTiming(1, { duration: 120 });
        onPressOut?.(event);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
