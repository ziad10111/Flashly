import { useClerk, useUser } from "@clerk/expo";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import semiBold from "expo-symbols/androidWeights/semiBold";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FLASHLY_AUTH_MODE } from "@/api/config";
import { PressableScale } from "@/components/animated/pressable-scale";
import { AnimatedOwl } from "@/components/mascot/animated-owl";
import { useFlashlyDecks } from "@/hooks/useFlashlyDecks";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";

type ProfileSymbol = {
  android: AndroidSymbol;
  ios: SFSymbol;
};

type StatCardProps = {
  accent: string;
  fallback: string;
  icon: ProfileSymbol;
  label: string;
  value: string;
};

type ClerkUserWithProfileImage = {
  reload?: () => Promise<unknown>;
  setProfileImage?: (input: { file: { name: string; type: string; uri: string } | Blob }) => Promise<unknown>;
};

function ProfileIcon({
  accent,
  fallback,
  name,
  size = 22,
}: {
  accent: string;
  fallback: string;
  name: ProfileSymbol;
  size?: number;
}) {
  return (
    <View className="items-center justify-center">
      <Text selectable={false} className="font-poppins-bold text-[11px] leading-[16px]" style={{ color: accent }}>
        {fallback}
      </Text>
      <SymbolView
        name={name}
        size={size}
        tintColor={accent}
        weight={{ android: semiBold, ios: "semibold" }}
        fallback={
          <Text selectable={false} className="font-poppins-bold text-[11px] leading-[16px]" style={{ color: accent }}>
            {fallback}
          </Text>
        }
        style={styles.symbolOverlay}
      />
    </View>
  );
}

function StatCard({ accent, fallback, icon, label, value }: StatCardProps) {
  return (
    <PressableScale
      className="min-h-[104px] flex-1 basis-[46%] rounded-[24px] border border-[#F0ECFA] bg-white p-3 shadow-card"
      haptic
      pressedScale={0.98}
      style={{ borderCurve: "continuous" }}
    >
      <View className="flex-row items-center justify-between">
        <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}18` }}>
          <ProfileIcon accent={accent} fallback={fallback} name={icon} />
        </View>
        <View className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
      </View>
      <Text
        selectable
        className="mt-2 font-poppins-bold text-[23px] leading-[29px] text-ink"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
      <Text selectable className="mt-1 text-[13px] leading-[18px] text-muted">
        {label}
      </Text>
    </PressableScale>
  );
}

function getAchievementProgress(label: string, earned: boolean, totals: { dailyStreak: number; reviewedCards: number; totalDecks: number; totalXp: number }) {
  if (label === "First Deck") {
    return { current: Math.min(totals.totalDecks, 1), target: 1, text: `${Math.min(totals.totalDecks, 1)} / 1 deck` };
  }

  if (label === "100 XP") {
    return { current: Math.min(totals.totalXp, 100), target: 100, text: `${Math.min(totals.totalXp, 100)} / 100 XP` };
  }

  if (label === "7 Day Streak") {
    return { current: Math.min(totals.dailyStreak, 7), target: 7, text: `${Math.min(totals.dailyStreak, 7)} / 7 days` };
  }

  return { current: Math.min(totals.reviewedCards, 100), target: 100, text: `${Math.min(totals.reviewedCards, 100)} / 100 cards` };
}

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

export default function ProfileTabScreen() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const insets = useSafeAreaInsets();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<"idle" | "uploading">("idle");
  const [avatarMessage, setAvatarMessage] = useState<string | null>(null);
  const reviewSessionHistory = useFlashlyProgressStore((state) => state.reviewSessionHistory);
  const { decks, errorMessage, progress, status } = useFlashlyDecks();
  const displayName = user?.fullName ?? user?.firstName ?? "Flashly Student";
  const email = user?.primaryEmailAddress?.emailAddress ?? "Local demo account";
  const totalXp = progress?.totalXp ?? 0;
  const dailyStreak = progress?.dailyStreak ?? 0;
  const completedDecks = progress?.completedDeckIds.length ?? decks.filter((deck) => deck.completionPercentage >= 100).length;
  const reviewedCards = progress?.reviewedCardCount ?? decks.reduce((sum, deck) => sum + deck.reviewedCount, 0);
  const weakCards = progress?.weakCardCount ?? decks.reduce((sum, deck) => sum + deck.weakCardCount, 0);
  const generatedDecks = progress?.generatedDeckCount ?? decks.filter((deck) => deck.materialId).length;
  const totalDecks = decks.length;
  const totalCards = decks.reduce((sum, deck) => sum + deck.cardCount, 0);
  const reviewCompletion = totalCards > 0 ? Math.min(reviewedCards / totalCards, 1) : 0;
  const level = Math.max(1, Math.floor(totalXp / 100) + 1);
  const latestReviewSessions = reviewSessionHistory.slice(0, 3);
  const achievements = [
    {
      accent: "#6C4EF5",
      earned: totalDecks > 0,
      icon: { android: "style", ios: "rectangle.stack.fill" } as ProfileSymbol,
      label: "First Deck",
    },
    {
      accent: "#FF8A1F",
      earned: totalXp >= 100,
      icon: { android: "award_star", ios: "star.fill" } as ProfileSymbol,
      label: "100 XP",
    },
    {
      accent: "#FF5A62",
      earned: dailyStreak >= 7,
      icon: { android: "local_fire_department", ios: "flame.fill" } as ProfileSymbol,
      label: "7 Day Streak",
    },
    {
      accent: "#21B36B",
      earned: reviewedCards >= 100,
      icon: { android: "fact_check", ios: "checklist.checked" } as ProfileSymbol,
      label: "100 Cards",
    },
  ];
  const reviewHistoryText =
    reviewSessionHistory.length > 0
      ? `${reviewSessionHistory.length} review ${reviewSessionHistory.length === 1 ? "session is" : "sessions are"} saved on this device.`
      : "Start a review to build your streak and fill this history.";
  const profileImageUri = avatarUri ?? user?.imageUrl ?? null;
  const contentStyle = useMemo(
    () => ({
      gap: 14,
      paddingBottom: Math.max(insets.bottom + 165, 195),
      paddingHorizontal: 20,
      paddingTop: Math.max(insets.top + 14, 28),
    }),
    [insets.bottom, insets.top],
  );

  const stats: StatCardProps[] = [
    {
      accent: "#6C4EF5",
      fallback: "XP",
      icon: { android: "award_star", ios: "star.fill" },
      label: "Total XP",
      value: String(totalXp),
    },
    {
      accent: "#FF8A3D",
      fallback: "ST",
      icon: { android: "local_fire_department", ios: "flame.fill" },
      label: "Daily streak",
      value: `${dailyStreak} ${dailyStreak === 1 ? "day" : "days"}`,
    },
    {
      accent: "#21B36B",
      fallback: "OK",
      icon: { android: "check_circle", ios: "checkmark.circle.fill" },
      label: "Completed decks",
      value: String(completedDecks),
    },
    {
      accent: "#3D8BFF",
      fallback: "RV",
      icon: { android: "fact_check", ios: "checklist.checked" },
      label: "Reviewed cards",
      value: String(reviewedCards),
    },
    {
      accent: "#FF5A62",
      fallback: "WK",
      icon: { android: "target", ios: "target" },
      label: "Weak cards",
      value: String(weakCards),
    },
    {
      accent: "#8B5CF6",
      fallback: "AI",
      icon: { android: "auto_awesome", ios: "sparkles" },
      label: "Generated decks",
      value: String(generatedDecks),
    },
  ];

  const handleSignOut = async () => {
    if (FLASHLY_AUTH_MODE === "clerk") {
      await signOut();
    }

    router.replace("/onboarding");
  };

  const uploadAvatarToClerk = async (asset: ImagePicker.ImagePickerAsset) => {
    const clerkUser = user as ClerkUserWithProfileImage | null | undefined;

    if (!clerkUser?.setProfileImage) {
      setAvatarUri(asset.uri);
      setAvatarMessage("Profile photo updated on this device. Cloud avatar upload is not available in this build.");
      return;
    }

    await clerkUser.setProfileImage({
      file: {
        name: asset.fileName ?? "flashly-avatar.jpg",
        type: asset.mimeType ?? "image/jpeg",
        uri: asset.uri,
      },
    });
    await clerkUser.reload?.();
    setAvatarUri(asset.uri);
    setAvatarMessage("Profile photo updated.");
  };

  const pickAvatar = async (source: "camera" | "library") => {
    setAvatarMessage(null);
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        source === "camera" ? "Camera permission needed" : "Photo permission needed",
        source === "camera"
          ? "Allow camera access to take a profile photo."
          : "Allow photo library access to choose a profile photo.",
      );
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            mediaTypes: ["images"],
            quality: 0.82,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            mediaTypes: ["images"],
            quality: 0.82,
          });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    setAvatarStatus("uploading");

    try {
      await uploadAvatarToClerk(result.assets[0]);
    } catch {
      Alert.alert("Could not update photo", "Flashly could not save this profile photo. Please try another image.");
      setAvatarMessage("Profile photo upload failed.");
    } finally {
      setAvatarStatus("idle");
    }
  };

  const removeAvatar = async () => {
    setAvatarUri(null);
    setAvatarMessage("Profile photo removed on this device.");
  };

  const handleAvatarPress = () => {
    Alert.alert("Profile photo", "Choose how you want to update your avatar.", [
      { text: "Take Photo", onPress: () => void pickAvatar("camera") },
      { text: "Choose From Gallery", onPress: () => void pickAvatar("library") },
      { style: "destructive", text: "Remove Photo", onPress: () => void removeAvatar() },
      { style: "cancel", text: "Cancel" },
    ]);
  };

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-lingua-background px-6">
        <ActivityIndicator size="large" color="#6C4EF5" />
        <Text selectable className="mt-4 text-center text-[15px] leading-[23px] text-muted">
          Loading profile stats...
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
      <Animated.View entering={FadeInDown.duration(220)} className="overflow-hidden rounded-[28px] bg-lingua-purple p-4 shadow-card" style={{ borderCurve: "continuous" }}>
        <View className="flex-row items-center">
          <PressableScale className="h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full bg-white/20" haptic onPress={handleAvatarPress}>
            {profileImageUri ? (
              <Image source={profileImageUri} style={{ height: 76, width: 76 }} contentFit="cover" />
            ) : (
              <Text selectable={false} className="font-poppins-bold text-[20px] leading-[24px] text-white">
                {getInitials(displayName)}
              </Text>
            )}
            <View className="absolute bottom-0 right-0 h-7 w-7 items-center justify-center rounded-full bg-white">
              {avatarStatus === "uploading" ? (
                <ActivityIndicator size="small" color="#6C4EF5" />
              ) : (
                <ProfileIcon accent="#6C4EF5" fallback="+" name={{ android: "photo_camera", ios: "camera.fill" }} size={16} />
              )}
            </View>
          </PressableScale>
          <View className="ml-4 flex-1">
            <Text selectable className="font-poppins-bold text-[25px] leading-[32px] text-white">
              {displayName}
            </Text>
            <Text selectable className="mt-1 text-[14px] leading-[21px] text-[#EAE4FF]">
              {email}
            </Text>
            <Text selectable className="mt-2 font-poppins-semibold text-[13px] leading-[18px] text-white">
              Level {level} - {totalXp} XP
            </Text>
            <Text selectable className="mt-1 text-[13px] leading-[18px] text-[#EAE4FF]">
              {totalDecks} {totalDecks === 1 ? "Deck" : "Decks"} - {dailyStreak} Day Streak
            </Text>
          </View>
        </View>

        <View className="mt-3 rounded-[20px] bg-white/15 p-3">
          <View className="flex-row items-center justify-between">
            <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-white">
              Progress
            </Text>
            <Text selectable className="font-poppins-bold text-[13px] leading-[18px] text-white">
              {Math.round(reviewCompletion * 100)}%
            </Text>
          </View>
          <View className="mt-2 h-3 overflow-hidden rounded-full bg-white/25">
            <View className="h-full rounded-full bg-white" style={{ width: `${reviewCompletion * 100}%` }} />
          </View>
        </View>
        {avatarMessage ? (
          <Text selectable className="mt-2 text-[12px] leading-[17px] text-[#EAE4FF]">
            {avatarMessage}
          </Text>
        ) : null}
      </Animated.View>

      <Animated.View
        entering={FadeInDown.delay(70).duration(220)}
        className="overflow-hidden rounded-[28px] border border-[#ECE6FF] bg-[#F7F4FF] p-3 shadow-card"
        style={{ borderCurve: "continuous" }}
      >
        <View className="flex-row items-center">
          <View className="h-[74px] w-[74px] items-center justify-center rounded-[22px] bg-white/75">
            <AnimatedOwl size={62} variant="float" />
          </View>
          <View className="ml-4 flex-1">
            <Text selectable className="font-poppins-bold text-[18px] leading-[24px] text-ink">
              Keep learning today!
            </Text>
            <Text selectable className="mt-1 text-[14px] leading-[21px] text-muted">
              Review a few cards and your weak cards will shrink fast.
            </Text>
          </View>
        </View>

        <View className="mt-3 flex-row gap-2">
          <PressableScale className="flex-1 items-center justify-center rounded-[20px] bg-lingua-purple px-4 py-3" haptic onPress={() => router.push("/decks" as never)}>
            <Text selectable={false} className="font-poppins-semibold text-[14px] leading-[20px] text-white">
              Open Decks
            </Text>
          </PressableScale>
          <PressableScale className="flex-1 items-center justify-center rounded-[20px] bg-white px-4 py-3" haptic onPress={() => router.push("/upload" as never)}>
            <Text selectable={false} className="font-poppins-semibold text-[14px] leading-[20px] text-lingua-purple">
              Upload
            </Text>
          </PressableScale>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(220)} className="gap-2">
        <Text selectable className="px-1 font-poppins-bold text-[20px] leading-[26px] text-ink">
          Achievements
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3 pr-2">
            {achievements.map((achievement, index) => (
              <Animated.View key={achievement.label} entering={FadeInDown.delay(130 + index * 35).duration(220)}>
                <PressableScale
                  className={`w-[124px] rounded-[24px] border p-3 shadow-card ${achievement.earned ? "border-[#F0ECFA] bg-white" : "border-[#ECEEF5] bg-[#F7F8FC]"}`}
                  haptic
                  pressedScale={0.98}
                >
                  <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: achievement.earned ? `${achievement.accent}18` : "#EEF0F8" }}>
                    <ProfileIcon accent={achievement.earned ? achievement.accent : "#8B93AD"} fallback="BD" name={achievement.icon} />
                  </View>
                  <Text selectable className={`mt-2 font-poppins-bold text-[14px] leading-[20px] ${achievement.earned ? "text-ink" : "text-muted"}`}>
                    {achievement.label}
                  </Text>
                  {(() => {
                    const achievementProgress = getAchievementProgress(achievement.label, achievement.earned, {
                      dailyStreak,
                      reviewedCards,
                      totalDecks,
                      totalXp,
                    });
                    const percent = Math.min(100, (achievementProgress.current / achievementProgress.target) * 100);

                    return (
                      <>
                        <Text selectable className="mt-1 text-[12px] leading-[17px] text-muted">
                          {achievement.earned ? "Earned" : achievementProgress.text}
                        </Text>
                        <View className="mt-2 h-2 overflow-hidden rounded-full bg-[#E8EAF4]">
                          <View className="h-full rounded-full" style={{ backgroundColor: achievement.accent, width: `${percent}%` }} />
                        </View>
                      </>
                    );
                  })()}
                </PressableScale>
              </Animated.View>
            ))}
          </View>
        </ScrollView>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(180).duration(220)} className="gap-2">
        <Text selectable className="px-1 font-poppins-bold text-[20px] leading-[26px] text-ink">
          Learning snapshot
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {stats.map((stat, index) => (
            <Animated.View
              key={stat.label}
              entering={FadeInDown.delay(150 + index * 45).duration(220)}
              className="flex-1 basis-[46%]"
            >
              <StatCard {...stat} />
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      {status === "error" ? (
        <View className="rounded-[30px] border border-[#FFD6D6] bg-[#FFF6F6] p-5">
          <Text selectable className="font-poppins-bold text-[18px] leading-[24px] text-[#C43D32]">
            Could not load profile stats
          </Text>
          <Text selectable className="mt-2 text-[14px] leading-[21px] text-[#C43D32]">
            {errorMessage ?? "Local progress data is unavailable right now."}
          </Text>
        </View>
      ) : null}

      <Animated.View
        entering={FadeInDown.delay(430).duration(220)}
        className="rounded-[28px] border border-[#F0ECFA] bg-white p-4 shadow-card"
        style={{ borderCurve: "continuous" }}
      >
        <View className="flex-row items-start">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-[#F7F4FF]">
            <ProfileIcon accent="#6C4EF5" fallback="HI" name={{ android: "history_edu", ios: "clock.arrow.circlepath" }} size={23} />
          </View>
          <View className="ml-4 flex-1">
            <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
              Local review history
            </Text>
            <Text selectable className="mt-1 text-[14px] leading-[21px] text-muted">
              {reviewHistoryText}
            </Text>
          </View>
        </View>
        <View className="mt-4 h-2 overflow-hidden rounded-full bg-[#F2EFFB]">
          <View
            className="h-full rounded-full bg-lingua-purple"
            style={{ width: `${Math.min(100, Math.max(12, reviewSessionHistory.length * 12))}%` }}
          />
        </View>
        {latestReviewSessions.length > 0 ? (
          <View className="mt-4 gap-2">
            {latestReviewSessions.map((session) => (
              <View key={session.id} className="rounded-[20px] bg-[#F8F9FD] p-3">
                <View className="flex-row items-center justify-between">
                  <Text selectable className="font-poppins-semibold text-[14px] leading-[20px] text-ink">
                    {session.reviewedCardIds.length} cards reviewed
                  </Text>
                  <Text selectable className="font-poppins-bold text-[13px] leading-[18px] text-lingua-purple">
                    +{session.xpEarned} XP
                  </Text>
                </View>
                <Text selectable className="mt-1 text-[12px] leading-[17px] text-muted">
                  {new Date(session.completedAt).toLocaleDateString()}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(500).duration(220)} className="gap-2 rounded-[28px] bg-white p-3 shadow-card" style={{ borderCurve: "continuous" }}>
        <View className="px-1">
          <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
            Quick actions
          </Text>
          <Text selectable className="mt-1 text-[13px] leading-[19px] text-muted">
            Manage study material and account access.
          </Text>
        </View>
        <PressableScale
          className="flex-row items-center justify-center rounded-[24px] bg-[#F7F4FF] px-6 py-4"
          haptic
          onPress={() => router.push("/upload" as never)}
        >
          <ProfileIcon accent="#6C4EF5" fallback="UP" name={{ android: "upload_file", ios: "square.and.arrow.up.fill" }} size={20} />
          <Text selectable={false} className="ml-2 font-poppins-semibold text-[17px] leading-[23px] text-lingua-purple">
            Upload Study Material
          </Text>
        </PressableScale>

        <PressableScale className="flex-row items-center justify-center rounded-[24px] bg-[#FFF5F5] px-6 py-4" haptic onPress={handleSignOut}>
          <ProfileIcon accent="#FF4D4F" fallback="SO" name={{ android: "logout", ios: "rectangle.portrait.and.arrow.right" }} size={20} />
          <Text selectable={false} className="ml-2 font-poppins-semibold text-[17px] leading-[23px] text-[#FF4D4F]">
            Sign Out
          </Text>
        </PressableScale>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  symbolOverlay: {
    height: 24,
    position: "absolute",
    width: 24,
  },
});
