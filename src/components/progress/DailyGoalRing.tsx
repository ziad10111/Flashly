import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { AnimatedProgressNumber } from "@/components/progress/AnimatedProgressNumber";

type DailyGoalRingProps = {
  goal: number;
  reviewed: number;
  xp: number;
};

const TICK_COUNT = 44;

function ProgressTick({
  index,
  progress,
}: {
  index: number;
  progress: SharedValue<number>;
}) {
  const tickStyle = useAnimatedStyle(() => {
    const active = progress.value >= (index + 1) / TICK_COUNT;

    return {
      backgroundColor: active ? "#6C4EF5" : "#E8E1FF",
      opacity: active ? 1 : 0.72,
      transform: [{ scaleY: active ? 1 : 0.74 }],
    };
  });

  return (
    <View
      style={{
        height: 112,
        left: 53,
        position: "absolute",
        top: 0,
        transform: [{ rotate: `${(360 / TICK_COUNT) * index}deg` }],
        width: 6,
      }}
    >
      <Animated.View
        style={[
          {
            borderRadius: 999,
            height: 13,
            width: 6,
          },
          tickStyle,
        ]}
      />
    </View>
  );
}

export function DailyGoalRing({ goal, reviewed, xp }: DailyGoalRingProps) {
  const progressValue = goal > 0 ? Math.min(reviewed / goal, 1) : 0;
  const progress = useSharedValue(progressValue);
  const isComplete = progressValue >= 1;

  useEffect(() => {
    progress.value = withTiming(progressValue, { duration: 520 });
  }, [progress, progressValue]);

  return (
    <View className="rounded-[34px] border border-[#ECE6FF] bg-white p-5 shadow-card">
      <View className="flex-row items-center">
        <View className="h-[112px] w-[112px] items-center justify-center">
          {Array.from({ length: TICK_COUNT }).map((_, index) => (
            <ProgressTick key={index} index={index} progress={progress} />
          ))}
          <View className="h-[84px] w-[84px] items-center justify-center rounded-full bg-[#F7F4FF]">
            <AnimatedProgressNumber
              selectable
              className="font-poppins-bold text-[27px] leading-[32px] text-lingua-purple"
              value={reviewed}
            />
            <Text selectable className="font-poppins-semibold text-[11px] leading-[15px] text-muted">
              / {goal}
            </Text>
          </View>
        </View>

        <View className="ml-5 flex-1">
          <Text selectable className="font-poppins-bold text-[22px] leading-[28px] text-ink">
            {isComplete ? "Daily goal completed 🎉" : "Daily goal"}
          </Text>
          <Text selectable className="mt-1 text-[14px] leading-[21px] text-muted">
            {reviewed} / {goal} cards reviewed
          </Text>
          <View className="mt-4 h-3 overflow-hidden rounded-full bg-[#E8E1FF]">
            <Animated.View
              className="h-full rounded-full bg-lingua-purple"
              style={{ width: `${Math.min(progressValue, 1) * 100}%` }}
            />
          </View>
          <Text selectable className="mt-3 font-poppins-semibold text-[13px] leading-[18px] text-lingua-purple">
            {isComplete ? "Daily goal completed 🎉" : `${xp} XP earned locally`}
          </Text>
        </View>
      </View>
    </View>
  );
}
