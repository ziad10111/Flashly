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
import { useFlashlyDecks } from "@/hooks/useFlashlyDecks";

type ProfileSymbol = {
  android: AndroidSymbol;
  ios: SFSymbol;
};

type CompactStatProps = {
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

function CompactStat({ label, value }: CompactStatProps) {
  return (
    <View className="flex-1 basis-[46%] rounded-[20px] border border-[#F0ECFA] bg-white px-4 py-3">
      <Text
        selectable
        className="font-poppins-bold text-[22px] leading-[27px] text-ink"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
      <Text selectable className="mt-1 text-[13px] leading-[18px] text-muted">
        {label}
      </Text>
    </View>
  );
}

function AchievementRow({
  accent,
  earned,
  icon,
  label,
  progressText,
  progressWidth,
}: {
  accent: string;
  earned: boolean;
  icon: ProfileSymbol;
  label: string;
  progressText: string;
  progressWidth: number;
}) {
  return (
    <View className="flex-row items-center rounded-[20px] bg-white p-3">
      <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: earned ? `${accent}18` : "#EEF0F8" }}>
        <ProfileIcon accent={earned ? accent : "#8B93AD"} fallback={earned ? "OK" : "--"} name={icon} size={18} />
      </View>
      <View className="ml-3 flex-1">
        <View className="flex-row items-center justify-between">
          <Text selectable className="font-poppins-semibold text-[15px] leading-[21px] text-ink">
            {label}
          </Text>
          <Text selectable className="text-[12px] leading-[17px] text-muted">
            {earned ? "Earned" : progressText}
          </Text>
        </View>
        <View className="mt-2 h-[5px] overflow-hidden rounded-full bg-[#E8EAF4]">
          <View className="h-full rounded-full" style={{ backgroundColor: accent, width: `${progressWidth}%` }} />
        </View>
      </View>
    </View>
  );
}

function AccountAction({
  accent,
  fallback,
  icon,
  label,
  onPress,
}: {
  accent: string;
  fallback: string;
  icon: ProfileSymbol;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressableScale className="flex-row items-center rounded-[20px] bg-[#F8F9FD] px-4 py-3" haptic onPress={onPress}>
      <ProfileIcon accent={accent} fallback={fallback} name={icon} size={19} />
      <Text selectable={false} className="ml-3 flex-1 font-poppins-semibold text-[15px] leading-[21px] text-ink">
        {label}
      </Text>
      <Text selectable={false} className="font-poppins-semibold text-[17px] leading-[19px] text-muted">
        {">"}
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
  const { decks, errorMessage, progress, status } = useFlashlyDecks();
  const displayName = user?.fullName ?? user?.firstName ?? "Flashly Student";
  const email = user?.primaryEmailAddress?.emailAddress ?? "Local demo account";
  const totalXp = progress?.totalXp ?? 0;
  const dailyStreak = progress?.dailyStreak ?? 0;
  const reviewedCards = progress?.reviewedCardCount ?? decks.reduce((sum, deck) => sum + deck.reviewedCount, 0);
  const totalDecks = decks.length;
  const totalCards = decks.reduce((sum, deck) => sum + deck.cardCount, 0);
  const reviewCompletion = totalCards > 0 ? Math.min(reviewedCards / totalCards, 1) : 0;
  const level = Math.max(1, Math.floor(totalXp / 100) + 1);
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
  const profileImageUri = avatarUri ?? user?.imageUrl ?? null;
  const contentStyle = useMemo(
    () => ({
      gap: 12,
      paddingBottom: Math.max(insets.bottom + 142, 170),
      paddingHorizontal: 16,
      paddingTop: Math.max(insets.top + 12, 24),
    }),
    [insets.bottom, insets.top],
  );

  const stats: CompactStatProps[] = [
    {
      label: "XP",
      value: String(totalXp),
    },
    {
      label: "Reviewed",
      value: String(reviewedCards),
    },
    {
      label: "Decks",
      value: String(totalDecks),
    },
    {
      label: "Streak",
      value: String(dailyStreak),
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
    Alert.alert("Profile photo", "Change or remove your avatar.", [
      { text: "Take Photo", onPress: () => void pickAvatar("camera") },
      { text: "Change Photo", onPress: () => void pickAvatar("library") },
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
      <Animated.View entering={FadeInDown.duration(220)} className="overflow-hidden rounded-[26px] bg-white p-4 shadow-card" style={{ borderCurve: "continuous" }}>
        <View className="flex-row items-center">
          <PressableScale className="h-[70px] w-[70px] items-center justify-center overflow-hidden rounded-full bg-[#F3EFFF]" haptic onPress={handleAvatarPress}>
            {profileImageUri ? (
              <Image source={profileImageUri} style={{ height: 70, width: 70 }} contentFit="cover" />
            ) : (
              <Text selectable={false} className="font-poppins-bold text-[20px] leading-[24px] text-lingua-purple">
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
            <Text selectable className="font-poppins-bold text-[25px] leading-[31px] text-ink" numberOfLines={1}>
              {displayName}
            </Text>
            <Text selectable className="mt-1 text-[14px] leading-[20px] text-muted" numberOfLines={1}>
              {email}
            </Text>
            <Text selectable className="mt-2 font-poppins-semibold text-[13px] leading-[18px] text-ink">
              Level {level} - {totalXp} XP
            </Text>
            <Text selectable className="mt-1 text-[13px] leading-[18px] text-muted">
              {totalDecks} {totalDecks === 1 ? "Deck" : "Decks"} - {dailyStreak} Day Streak
            </Text>
          </View>
        </View>

        <View className="mt-3">
          <View className="flex-row items-center justify-between">
            <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-muted">
              Progress
            </Text>
            <Text selectable className="font-poppins-bold text-[13px] leading-[18px] text-lingua-purple">
              {Math.round(reviewCompletion * 100)}%
            </Text>
          </View>
          <View className="mt-2 h-[6px] overflow-hidden rounded-full bg-[#EEF0F8]">
            <View className="h-full rounded-full bg-lingua-purple" style={{ width: `${reviewCompletion * 100}%` }} />
          </View>
        </View>
        {avatarMessage ? (
          <Text selectable className="mt-2 text-[12px] leading-[17px] text-muted">
            {avatarMessage}
          </Text>
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(70).duration(220)} className="gap-2">
        <Text selectable className="px-1 font-poppins-bold text-[21px] leading-[27px] text-ink">
          Progress
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {stats.map((stat, index) => (
            <Animated.View key={stat.label} entering={FadeInDown.delay(90 + index * 35).duration(220)} className="flex-1 basis-[46%]">
              <CompactStat {...stat} />
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(140).duration(220)} className="gap-2 rounded-[24px] bg-[#F7F4FF] p-3 shadow-card" style={{ borderCurve: "continuous" }}>
        <Text selectable className="px-1 font-poppins-bold text-[21px] leading-[27px] text-ink">
          Achievements
        </Text>
        {achievements.map((achievement, index) => {
          const achievementProgress = getAchievementProgress(achievement.label, achievement.earned, {
            dailyStreak,
            reviewedCards,
            totalDecks,
            totalXp,
          });
          const percent = Math.min(100, (achievementProgress.current / achievementProgress.target) * 100);

          return (
            <Animated.View key={achievement.label} entering={FadeInDown.delay(160 + index * 35).duration(220)}>
              <AchievementRow
                accent={achievement.accent}
                earned={achievement.earned}
                icon={achievement.icon}
                label={achievement.label}
                progressText={achievementProgress.text}
                progressWidth={percent}
              />
            </Animated.View>
          );
        })}
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

      <Animated.View entering={FadeInDown.delay(220).duration(220)} className="gap-2 rounded-[24px] bg-white p-3 shadow-card" style={{ borderCurve: "continuous" }}>
        <View className="px-1">
          <Text selectable className="font-poppins-bold text-[21px] leading-[27px] text-ink">
            Account
          </Text>
          <Text selectable className="mt-1 text-[13px] leading-[19px] text-muted">
            Manage your profile and access.
          </Text>
        </View>
        <AccountAction
          accent="#6C4EF5"
          fallback="PH"
          icon={{ android: "photo_camera", ios: "camera.fill" }}
          label="Edit Profile Photo"
          onPress={handleAvatarPress}
        />
        <AccountAction
          accent="#6C4EF5"
          fallback="PRO"
          icon={{ android: "workspace_premium", ios: "star.circle.fill" }}
          label="Manage Subscription"
          onPress={() => router.push("/upgrade" as never)}
        />
        <AccountAction
          accent="#5D678A"
          fallback="ST"
          icon={{ android: "settings", ios: "gearshape.fill" }}
          label="Settings"
          onPress={() => Alert.alert("Settings", "Profile settings will be added in a future update.")}
        />
        <AccountAction
          accent="#FF4D4F"
          fallback="SO"
          icon={{ android: "logout", ios: "rectangle.portrait.and.arrow.right" }}
          label="Sign Out"
          onPress={handleSignOut}
        />
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
