import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { PressableScale } from "@/components/animated/pressable-scale";
import { colors } from "@/theme";

type TabVisual = {
  activeGlyph: string;
  inactiveGlyph: string;
  label: string;
};

const TAB_VISUALS: Record<string, TabVisual> = {
  decks: {
    activeGlyph: "\u25A4",
    inactiveGlyph: "\u25A4",
    label: "Decks",
  },
  index: {
    activeGlyph: "\u2302",
    inactiveGlyph: "\u2302",
    label: "Home",
  },
  profile: {
    activeGlyph: "\u25C9",
    inactiveGlyph: "\u25C9",
    label: "Profile",
  },
  upload: {
    activeGlyph: "\u2191",
    inactiveGlyph: "\u2191",
    label: "Upload",
  },
};

const ACTIVE_SIZE = 62;
const CONTAINER_HORIZONTAL_PADDING = 14;
const INITIAL_BAR_WIDTH = 332;

export function FlashlyTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [contentWidth, setContentWidth] = useState(INITIAL_BAR_WIDTH);
  const routeCount = state.routes.length;
  const tabWidth = contentWidth / routeCount;
  const activeOffset = useSharedValue(0);

  useEffect(() => {
    activeOffset.value = withTiming(state.index * tabWidth, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [activeOffset, state.index, tabWidth]);

  const animatedBubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: activeOffset.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.outerWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}
    >
      <View
        style={styles.container}
        onLayout={(event) => {
          const nextWidth = event.nativeEvent.layout.width - CONTAINER_HORIZONTAL_PADDING * 2;

          if (nextWidth > 0 && Math.abs(nextWidth - contentWidth) > 1) {
            setContentWidth(nextWidth);
          }
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeBubble,
            {
              left: CONTAINER_HORIZONTAL_PADDING + (tabWidth - ACTIVE_SIZE) / 2,
            },
            animatedBubbleStyle,
          ]}
        >
          <Text selectable={false} style={styles.activeBubbleIcon}>
            {TAB_VISUALS[state.routes[state.index]?.name]?.activeGlyph ?? "\u2022"}
          </Text>
        </Animated.View>

        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const isFocused = state.index === index;
          const visual = TAB_VISUALS[route.name] ?? {
            activeGlyph: "\u2022",
            inactiveGlyph: "\u2022",
            label: route.name,
          };
          const label =
            typeof descriptor.options.tabBarLabel === "string"
              ? descriptor.options.tabBarLabel
              : typeof descriptor.options.title === "string"
                ? descriptor.options.title
                : visual.label;

          const onPress = () => {
            const event = navigation.emit({
              canPreventDefault: true,
              target: route.key,
              type: "tabPress",
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <PressableScale
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={descriptor.options.tabBarAccessibilityLabel}
              haptic
              onPress={onPress}
              pressedScale={0.92}
              style={[styles.tabButton, { width: tabWidth }]}
              testID={descriptor.options.tabBarButtonTestID}
            >
              <View style={[styles.tabInner, isFocused && styles.hiddenTabInner]}>
                <Text selectable={false} style={styles.inactiveIcon}>
                  {visual.inactiveGlyph}
                </Text>
                <Text selectable={false} style={styles.inactiveLabel}>
                  {label}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activeBubble: {
    alignItems: "center",
    backgroundColor: colors.primary.purple,
    borderRadius: ACTIVE_SIZE / 2,
    elevation: 10,
    height: ACTIVE_SIZE,
    justifyContent: "center",
    position: "absolute",
    shadowColor: "#7A54FF",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.26,
    shadowRadius: 24,
    top: 10,
    width: ACTIVE_SIZE,
    zIndex: 2,
  },
  activeBubbleIcon: {
    color: "#FFFFFF",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 25,
    lineHeight: 26,
  },
  container: {
    alignSelf: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 34,
    flexDirection: "row",
    minHeight: 84,
    paddingHorizontal: CONTAINER_HORIZONTAL_PADDING,
    paddingTop: 10,
    shadowColor: "#1F245214",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 1,
    shadowRadius: 28,
    elevation: 12,
  },
  hiddenTabInner: {
    opacity: 0,
  },
  inactiveIcon: {
    color: "#5D678A",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 20,
    lineHeight: 22,
  },
  inactiveLabel: {
    color: "#5D678A",
    fontFamily: "Poppins_500Medium",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  outerWrap: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  tabInner: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 74,
    paddingTop: 6,
  },
});
