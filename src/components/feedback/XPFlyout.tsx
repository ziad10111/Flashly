import { useEffect, useState } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  subscribeToXpCelebrations,
  type XPCelebrationEvent,
} from "@/lib/feedback/xpCelebration";

type XPFlyoutProps = {
  style?: StyleProp<ViewStyle>;
};

type VisibleXPEvent = XPCelebrationEvent & {
  offset: number;
};

function XPFlyoutItem({
  event,
  onDone,
}: {
  event: VisibleXPEvent;
  onDone: (id: string) => void;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(18);
  const scale = useSharedValue(0.94);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 120 });
    translateY.value = withTiming(-42 - event.offset, {
      duration: 850,
      easing: Easing.out(Easing.cubic),
    });
    scale.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });

    const fadeTimer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 260 });
    }, 560);
    const doneTimer = setTimeout(() => onDone(event.id), 920);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [event.id, event.offset, onDone, opacity, scale, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          alignSelf: "center",
          backgroundColor: "#6C4EF5",
          borderCurve: "continuous",
          borderRadius: 999,
          boxShadow: "0 8px 18px rgba(108, 78, 245, 0.18)",
          paddingHorizontal: 14,
          paddingVertical: 8,
          position: "absolute",
        },
        animatedStyle,
      ]}
    >
      <Text selectable={false} className="font-poppins-bold text-[15px] leading-[20px] text-white">
        +{event.amount} XP
      </Text>
    </Animated.View>
  );
}

export function XPFlyout({ style }: XPFlyoutProps) {
  const [events, setEvents] = useState<VisibleXPEvent[]>([]);

  useEffect(
    () =>
      subscribeToXpCelebrations((event) => {
        setEvents((current) => [
          ...current.slice(-3),
          { ...event, offset: current.length * 10 },
        ]);
      }),
    [],
  );

  const handleDone = (id: string) => {
    setEvents((current) => current.filter((event) => event.id !== id));
  };

  return (
    <View pointerEvents="none" style={[{ alignItems: "center", height: 1, zIndex: 20 }, style]}>
      {events.map((event) => (
        <XPFlyoutItem key={event.id} event={event} onDone={handleDone} />
      ))}
    </View>
  );
}
