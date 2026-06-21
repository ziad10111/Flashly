import { useUser } from "@clerk/expo";
import { Image } from "expo-image";
import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import semiBold from "expo-symbols/androidWeights/semiBold";
import { router } from "expo-router";
import { useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PressableScale } from "@/components/animated/pressable-scale";
import { AnimatedOwl } from "@/components/mascot/animated-owl";
import { DailyGoalRing } from "@/components/progress/DailyGoalRing";
import { images } from "@/constants/images";
import { useFlashlyDecks } from "@/hooks/useFlashlyDecks";
import { getTodayReviewedCount, useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";
import { useStudySelectionStore } from "@/store/useStudySelectionStore";

type HomeSymbol = {
  android: AndroidSymbol;
  ios: SFSymbol;
};

function getInitials(name?: string | null) {
  if (!name) {
    return "FL";
  }

  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getTimeGreeting(name?: string | null) {
  const hour = new Date().getHours();
  const period = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";

  return `Good ${period}${name ? `, ${name}` : ""}`;
}

function SmallIcon({
  color,
  icon,
  label,
  tint,
}: {
  color: string;
  icon?: HomeSymbol;
  label: string;
  tint: string;
}) {
  return (
    <View
      className="h-12 w-12 items-center justify-center rounded-[18px]"
      style={{ backgroundColor: tint }}
    >
      <Text selectable={false} className="font-poppins-bold text-[13px] leading-[18px]" style={{ color }}>
        {label}
      </Text>
      {icon ? (
        <SymbolView
          name={icon}
          size={23}
          tintColor={color}
          weight={{ android: semiBold, ios: "semibold" }}
          fallback={
            <Text selectable={false} className="font-poppins-bold text-[13px] leading-[18px]" style={{ color }}>
              {label}
            </Text>
          }
          style={styles.symbolOverlay}
        />
      ) : null}
    </View>
  );
}

export default function HomeTabScreen() {
  const { user } = useUser();
  const insets = useSafeAreaInsets();
  const hasHydrated = useStudySelectionStore((state) => state.hasHydrated);
  const selectedStudyType = useStudySelectionStore((state) => state.selectedStudyType);
  const clearSelectedStudyType = useStudySelectionStore((state) => state.clearSelectedStudyType);
  const dailyReviewProgress = useFlashlyProgressStore((state) => state.dailyReviewProgress);
  const refreshDailyReviewProgress = useFlashlyProgressStore((state) => state.refreshDailyReviewProgress);
  const { decks, errorMessage, progress, status } = useFlashlyDecks();

  const displayName = user?.firstName ?? user?.fullName ?? null;
  const greeting = getTimeGreeting(displayName);
  const initials = getInitials(user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Flashly");
  const materialFormats = selectedStudyType?.supportedFileTypes.slice(0, 2).map((type) => type.toUpperCase()).join(", ") ?? "PDF";
  const materialCapability = selectedStudyType?.requiresOCR ? "OCR Ready" : "OCR Ready";
  const totalXp = progress?.totalXp ?? 0;
  const dailyStreak = progress?.dailyStreak ?? 0;
  const currentDeck =
    decks.find((deck) => deck.completionPercentage > 0 && deck.completionPercentage < 100) ??
    decks.find((deck) => deck.completionPercentage === 0) ??
    decks[0] ??
    null;
  const totalCardsAcrossDecks = decks.reduce((sum, deck) => sum + deck.cardCount, 0);
  const reviewedCardsAcrossDecks = progress?.reviewedCardCount ?? decks.reduce((sum, deck) => sum + deck.reviewedCount, 0);
  const weakCards = progress?.weakCardCount ?? decks.reduce((sum, deck) => sum + deck.weakCardCount, 0);
  const dailyCardGoal = 20;
  const dailyCardsReviewed = getTodayReviewedCount(dailyReviewProgress);
  const dailyCardsLeft = Math.max(dailyCardGoal - dailyCardsReviewed, 0);
  const reviewProgress = totalCardsAcrossDecks > 0 ? reviewedCardsAcrossDecks / totalCardsAcrossDecks : 0;
  const remainingCardsInCurrentDeck = currentDeck ? Math.max(currentDeck.cardCount - currentDeck.reviewedCount, 0) : 0;
  const suggestedReviewCount = currentDeck
    ? Math.min(currentDeck.cardCount, weakCards > 0 ? Math.max(4, Math.min(weakCards, 10)) : 8)
    : 0;
  const reviewTargetDetail = currentDeck
    ? remainingCardsInCurrentDeck > 0
      ? `${remainingCardsInCurrentDeck} unfinished cards in ${currentDeck.title}`
      : `${currentDeck.title} is ready for a quick refresh`
    : "Upload a file to create your first review target";
  const motivationMessage =
    dailyCardsLeft > 0
      ? `You're only ${dailyCardsLeft} ${dailyCardsLeft === 1 ? "card" : "cards"} away from today's goal.`
      : "You completed today's goal. Great work!";
  const homeStats = [
    { color: "#6C4EF5", icon: { android: "award_star", ios: "star.fill" } as HomeSymbol, label: "XP", value: String(totalXp), tint: "#F5F0FF" },
    { color: "#FF8A1F", icon: { android: "local_fire_department", ios: "flame.fill" } as HomeSymbol, label: "Streak", value: `${dailyStreak} days`, tint: "#FFF4EC" },
    { color: "#21B36B", icon: { android: "check_circle", ios: "checkmark.circle.fill" } as HomeSymbol, label: "Decks done", value: String(progress?.completedDeckIds.length ?? 0), tint: "#EFFFF6" },
    { color: "#3D8BFF", icon: { android: "fact_check", ios: "checklist.checked" } as HomeSymbol, label: "Cards", value: String(totalCardsAcrossDecks), tint: "#EEF5FF" },
  ];
  const quickActions = [
    {
      color: "#6C4EF5",
      detail: "Create cards",
      icon: { android: "upload_file", ios: "square.and.arrow.up.fill" } as HomeSymbol,
      onPress: () => router.push("/upload" as never),
      title: "Upload",
    },
    {
      color: "#3D8BFF",
      detail: currentDeck ? `${currentDeck.cardCount} cards` : "Pick a deck",
      icon: { android: "style", ios: "rectangle.stack.fill" } as HomeSymbol,
      onPress: () => (currentDeck ? router.push(`/review/${currentDeck.id}` as never) : router.push("/decks" as never)),
      title: "Review",
    },
    {
      color: "#FF4D4F",
      detail: weakCards > 0 ? `${weakCards} waiting` : "All clear",
      icon: { android: "target", ios: "target" } as HomeSymbol,
      onPress: () => (currentDeck ? router.push(`/review/${currentDeck.id}?mode=weak` as never) : router.push("/decks" as never)),
      title: "Weak",
    },
  ];
  const contentStyle = useMemo(
    () => ({
      gap: 14,
      paddingBottom: Math.max(insets.bottom + 160, 190),
      paddingHorizontal: 20,
      paddingTop: Math.max(insets.top + 14, 28),
    }),
    [insets.bottom, insets.top],
  );

  useEffect(() => {
    if (hasHydrated && !selectedStudyType) {
      router.replace("/study-type" as never);
    }
  }, [hasHydrated, selectedStudyType]);

  useEffect(() => {
    refreshDailyReviewProgress();
  }, [refreshDailyReviewProgress]);

  const handleClearStudySelection = () => {
    clearSelectedStudyType();
    router.replace("/study-type" as never);
  };

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-lingua-background px-6">
        <ActivityIndicator size="large" color="#6C4EF5" />
        <Text selectable className="mt-4 text-center text-[15px] leading-[23px] text-muted">
          Loading your study dashboard...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="bg-lingua-background"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={contentStyle}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View entering={FadeInDown.duration(220)} className="flex-row items-center">
        <PressableScale className="h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white shadow-card" haptic>
          {user?.imageUrl ? (
            <Image source={user.imageUrl} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <Text selectable={false} className="font-poppins-bold text-[17px] leading-[21px] text-lingua-purple">
              {initials}
            </Text>
          )}
        </PressableScale>

        <View className="ml-4 flex-1 pr-3">
          <Text selectable className="font-poppins-bold text-[24px] leading-[31px] text-ink">
            {greeting}
          </Text>
          <Text selectable className="mt-1 text-[13px] leading-[18px] text-muted">
            Ready to continue learning?
          </Text>
        </View>

        <View className="mr-3 flex-row items-center rounded-full bg-white px-3 py-2 shadow-card">
          <Image source={images.streakFire} style={styles.streakIcon} contentFit="contain" />
          <Text selectable className="ml-1 font-poppins-semibold text-[16px] leading-[20px] text-ink">
            {dailyStreak}
          </Text>
        </View>

        <PressableScale className="h-12 w-12 items-center justify-center rounded-full bg-white shadow-card" haptic onPress={() => router.push("/profile" as never)}>
          <SmallIcon color="#6C4EF5" icon={{ android: "person", ios: "person.fill" }} label="P" tint="#F5F0FF" />
        </PressableScale>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(60).duration(220)}>
        <DailyGoalRing goal={dailyCardGoal} reviewed={dailyCardsReviewed} xp={totalXp} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(90).duration(220)} className="gap-2">
        <View className="flex-row items-end justify-between px-1">
          <Text selectable className="font-poppins-bold text-[22px] leading-[28px] text-ink">
            Quick actions
          </Text>
          <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-muted">
            Tap to continue
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3 pr-2">
            {quickActions.map((action, index) => (
              <Animated.View key={action.title} entering={FadeInDown.delay(120 + index * 35).duration(220)}>
                <PressableScale className="w-[136px] rounded-[24px] border border-[#F0ECFA] bg-white p-3 shadow-card" haptic onPress={action.onPress} pressedScale={0.97}>
                  <SmallIcon color={action.color} icon={action.icon} label={action.title.slice(0, 2).toUpperCase()} tint={`${action.color}18`} />
                  <Text selectable className="mt-3 font-poppins-bold text-[16px] leading-[22px] text-ink">
                    {action.title}
                  </Text>
                  <Text selectable className="mt-1 text-[12px] leading-[17px] text-muted">
                    {action.detail}
                  </Text>
                </PressableScale>
              </Animated.View>
            ))}
          </View>
        </ScrollView>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(220)} className="flex-row items-center rounded-[28px] border border-[#ECE6FF] bg-[#F7F4FF] p-3 shadow-card">
        <View className="h-[68px] w-[68px] items-center justify-center rounded-[22px] bg-white/75">
          <AnimatedOwl
            mood={dailyCardsLeft > 0 ? "idle" : "celebration"}
            source={images.mascotWelcome}
            size={62}
            variant={dailyCardsLeft > 0 ? "float" : "celebrate"}
          />
        </View>
        <View className="ml-4 flex-1">
          <Text selectable className="font-poppins-bold text-[18px] leading-[24px] text-ink">
            {dailyCardsLeft > 0 ? "Keep the streak warm" : "Goal complete"}
          </Text>
          <Text selectable className="mt-1 text-[14px] leading-[21px] text-muted">
            {motivationMessage}
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(180).duration(220)}>
        <PressableScale
          className="rounded-[24px] border border-[#ECEEFA] bg-white p-3 shadow-card"
          haptic
          onPress={() => router.push("/upload" as never)}
          pressedScale={0.98}
        >
        <View className="flex-row items-center">
          <SmallIcon color="#7A54FF" icon={{ android: "menu_book", ios: "book.closed.fill" }} label="M" tint="#F5F0FF" />
          <View className="ml-4 flex-1">
            <Text selectable className="font-poppins-medium text-[13px] leading-[18px] text-muted">
              Current material
            </Text>
            <Text selectable className="mt-1 font-poppins-bold text-[21px] leading-[27px] text-ink">
              {selectedStudyType?.title ?? "Study material"}
            </Text>
            <Text selectable className="mt-1 font-poppins-semibold text-[13px] leading-[18px] text-lingua-purple">
              {materialFormats} - {materialCapability}
            </Text>
          </View>
          <Text selectable={false} className="font-poppins-bold text-[22px] leading-[26px] text-lingua-purple">
            {">"}
          </Text>
        </View>
        </PressableScale>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(230).duration(220)} className="gap-2">
        <View className="flex-row items-end justify-between px-1">
          <Text selectable className="font-poppins-bold text-[22px] leading-[28px] text-ink">
            Snapshot
          </Text>
          <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-muted">
            {Math.round(reviewProgress * 100)}% reviewed
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-3">
        {homeStats.map((stat, index) => (
          <Animated.View key={stat.label} entering={FadeInDown.delay(250 + index * 40).duration(220)} className="flex-1 basis-[46%]">
          <PressableScale className="min-h-[98px] rounded-[24px] border border-[#F0ECFA] bg-white p-3 shadow-card" haptic pressedScale={0.98}>
            <SmallIcon color={stat.color} icon={stat.icon} label={stat.label.slice(0, 2).toUpperCase()} tint={stat.tint} />
            <Text selectable className="mt-2 font-poppins-bold text-[21px] leading-[26px] text-ink">
              {stat.value}
            </Text>
            <Text selectable className="mt-1 text-[13px] leading-[18px] text-muted">
              {stat.label}
            </Text>
          </PressableScale>
          </Animated.View>
        ))}
        </View>
      </Animated.View>

      {status === "error" ? (
        <View className="rounded-[30px] border border-[#FFD6D6] bg-[#FFF6F6] p-5">
          <Text selectable className="font-poppins-bold text-[18px] leading-[24px] text-[#C43D32]">
            Could not load dashboard data
          </Text>
          <Text selectable className="mt-2 text-[14px] leading-[21px] text-[#C43D32]">
            {errorMessage ?? "Local deck data is unavailable right now."}
          </Text>
        </View>
      ) : null}

      {currentDeck ? (
        <Animated.View entering={FadeInDown.delay(300).duration(220)} className="rounded-[28px] bg-white p-4 shadow-card">
          <View className="flex-row items-start">
            <SmallIcon color="#4D8BFF" icon={{ android: "style", ios: "rectangle.stack.fill" }} label="D" tint="#EEF5FF" />
            <View className="ml-4 flex-1">
              <Text selectable className="font-poppins-medium text-[13px] leading-[18px] text-muted">
                Continue reviewing
              </Text>
              <Text selectable className="mt-1 font-poppins-bold text-[21px] leading-[27px] text-ink">
                {currentDeck.title}
              </Text>
              <Text selectable className="mt-2 text-[14px] leading-[21px] text-muted">
                {currentDeck.reviewedCount} of {currentDeck.cardCount} cards reviewed
              </Text>
            </View>
          </View>

          <View className="mt-4 h-3 overflow-hidden rounded-full bg-[#EEF0F8]">
            <View className="h-full rounded-full bg-lingua-purple" style={{ width: `${currentDeck.completionPercentage}%` }} />
          </View>

          <PressableScale
            className="mt-4 flex-row items-center justify-center rounded-[22px] bg-[#F2F0FA] px-5 py-3"
            haptic
            onPress={() => router.push(`/deck/${currentDeck.id}` as never)}
          >
            <Text selectable={false} className="font-poppins-semibold text-[16px] leading-[22px] text-lingua-purple">
              Review deck
            </Text>
            <Text selectable={false} className="ml-2 font-poppins-semibold text-[20px] leading-[22px] text-lingua-purple">
              {">"}
            </Text>
          </PressableScale>
        </Animated.View>
      ) : (
        <View className="items-center rounded-[28px] border border-dashed border-[#DADDEC] bg-white p-5">
          <AnimatedOwl size={88} variant="bounce" />
          <Text selectable className="text-center font-poppins-bold text-[22px] leading-[28px] text-ink">
            No decks yet
          </Text>
          <Text selectable className="mt-2 text-center text-[15px] leading-[23px] text-muted">
            Upload your first study material to generate flashcards.
          </Text>
          <PressableScale className="mt-5 items-center justify-center rounded-[24px] bg-lingua-purple px-5 py-4" haptic onPress={() => router.push("/upload" as never)}>
            <Text selectable={false} className="font-poppins-semibold text-[16px] leading-[22px] text-white">
              Upload study material
            </Text>
          </PressableScale>
        </View>
      )}

      <Animated.View entering={FadeInDown.delay(350).duration(220)} className="rounded-[28px] border border-[#ECEEFA] bg-white p-4 shadow-card">
        <View className="flex-row items-start">
          <SmallIcon color="#6C4EF5" icon={{ android: "target", ios: "target" }} label="GO" tint="#F7F4FF" />
          <View className="ml-4 flex-1">
            <Text selectable className="font-poppins-bold text-[22px] leading-[28px] text-ink">
              {"Today's review target"}
            </Text>
            <Text selectable className="mt-2 text-[14px] leading-[21px] text-muted">
              {reviewTargetDetail}
            </Text>
          </View>
        </View>

        <View className="mt-4 rounded-[24px] bg-[#F7F4FF] p-4">
          <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-lingua-purple">
            Suggested session
          </Text>
          <Text selectable className="mt-1 font-poppins-bold text-[30px] leading-[36px] text-ink">
            {currentDeck ? suggestedReviewCount : 0}
            <Text className="font-poppins-semibold text-[18px] leading-[24px] text-muted"> cards today</Text>
          </Text>
          <View className="mt-3 h-3 overflow-hidden rounded-full bg-[#E8E1FF]">
            <View className="h-full rounded-full bg-lingua-purple" style={{ width: `${currentDeck ? currentDeck.completionPercentage : 0}%` }} />
          </View>
          <Text selectable className="mt-3 text-[13px] leading-[19px] text-muted">
            {currentDeck ? `${currentDeck.reviewedCount} of ${currentDeck.cardCount} cards already reviewed` : "No deck selected yet"}
          </Text>
        </View>

        <View className="mt-3 flex-row gap-3">
          <PressableScale
            className="flex-1 items-center justify-center rounded-[22px] bg-lingua-purple px-4 py-3"
            haptic
            onPress={() => (currentDeck ? router.push(`/review/${currentDeck.id}` as never) : router.push("/upload" as never))}
          >
            <Text selectable={false} className="font-poppins-semibold text-[15px] leading-[21px] text-white">
              {currentDeck ? "Start review" : "Upload file"}
            </Text>
          </PressableScale>
          <PressableScale
            className="flex-1 items-center justify-center rounded-[22px] bg-[#F4F6FB] px-4 py-3"
            disabled={!currentDeck || weakCards === 0}
            haptic
            onPress={() => currentDeck && router.push(`/review/${currentDeck.id}?mode=weak` as never)}
          >
            <Text selectable={false} className={`font-poppins-semibold text-[15px] leading-[21px] ${currentDeck && weakCards > 0 ? "text-[#FF4D4F]" : "text-muted"}`}>
              {weakCards > 0 ? `${weakCards} weak` : "No weak cards"}
            </Text>
          </PressableScale>
        </View>
      </Animated.View>

      {__DEV__ ? (
      <View className="rounded-[24px] border border-dashed border-[#DADDEC] bg-white/70 p-4">
        <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-muted">
          Developer testing
        </Text>
        <Pressable className="mt-3 self-start rounded-full bg-[#F4F6FB] px-4 py-2" onPress={handleClearStudySelection}>
          <Text selectable={false} className="font-poppins-semibold text-[12px] leading-[16px] text-muted">
            Clear study selection
          </Text>
        </Pressable>
      </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatarImage: {
    borderRadius: 28,
    height: 56,
    width: 56,
  },
  streakIcon: {
    height: 24,
    width: 24,
  },
  symbolOverlay: {
    height: 24,
    position: "absolute",
    width: 24,
  },
});
