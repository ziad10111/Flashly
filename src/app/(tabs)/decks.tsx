import { Image } from "expo-image";
import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import semiBold from "expo-symbols/androidWeights/semiBold";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { DeckDTO } from "@/api/contracts";
import { deleteDeck } from "@/api/repositories/deckRepository";
import { PressableScale } from "@/components/animated/pressable-scale";
import { AnimatedOwl } from "@/components/mascot/animated-owl";
import { images } from "@/constants/images";
import { useFlashlyDecks } from "@/hooks/useFlashlyDecks";
import { formatPercent } from "@/lib/deck-utils";
import { useActiveDeckStore } from "@/store/useActiveDeckStore";
import { useFlashlyAssistantStore } from "@/store/useFlashlyAssistantStore";

type MaterialTab = "cards" | "review";

type DeckSymbol = {
  android: AndroidSymbol;
  ios: SFSymbol;
};

function DeckIcon({
  color,
  fallback,
  name,
  size = 22,
}: {
  color: string;
  fallback: string;
  name: DeckSymbol;
  size?: number;
}) {
  return (
    <View className="items-center justify-center">
      <Text selectable={false} className="font-poppins-bold text-[12px] leading-[16px]" style={{ color }}>
        {fallback}
      </Text>
      <SymbolView
        name={name}
        size={size}
        tintColor={color}
        weight={{ android: semiBold, ios: "semibold" }}
        fallback={
          <Text selectable={false} className="font-poppins-bold text-[12px] leading-[16px]" style={{ color }}>
            {fallback}
          </Text>
        }
        style={styles.symbolOverlay}
      />
    </View>
  );
}

function getDeckMetaLine(deck: DeckDTO) {
  if (deck.status === "processing" || deck.status === "generating" || deck.status === "partial-error") {
    return `${deck.cardCount} cards`;
  }

  return `${deck.cardCount} cards - ${formatPercent(deck.completionPercentage / 100)} reviewed`;
}

function getDeckStatusLine(deck: DeckDTO) {
  if (deck.status === "processing" || deck.status === "generating") {
    return "Generating more...";
  }

  if (deck.status === "partial-error") {
    return "Generation paused. Available cards are ready.";
  }

  if (deck.weakCardCount > 0) {
    return `${deck.weakCardCount} weak ${deck.weakCardCount === 1 ? "card" : "cards"} need review`;
  }

  if (deck.reviewedCount > 0) {
    return "Continue where you left off";
  }

  return "Ready to review";
}

function formatReviewedDate(value: string | undefined) {
  if (!value) {
    return "Not reviewed yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return `Last reviewed ${value}`;
  }

  return `Last reviewed ${new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
  }).format(date)}`;
}

function DeckRow({
  index,
  isActive,
  deck,
  onDelete,
  onPress,
}: {
  index: number;
  isActive: boolean;
  deck: DeckDTO;
  onDelete: () => void;
  onPress: () => void;
}) {
  const isGeneratingDeck = deck.status === "generating" || deck.status === "partial-error" || deck.status === "processing";
  const hasWeakCards = deck.weakCardCount > 0 && !isGeneratingDeck;
  const progressWidth = isGeneratingDeck
    ? Math.min(Math.max(deck.completionPercentage, deck.cardCount > 0 ? 34 : 12), 88)
    : Math.min(Math.max(deck.completionPercentage, 0), 100);
  const statusColor = hasWeakCards ? "#FF4D4F" : isGeneratingDeck ? "#6C4EF5" : "#5D678A";

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      className={`rounded-[24px] border bg-white px-3 py-3 ${isActive ? "border-lingua-purple" : "border-[#ECEEFA]"}`}
      haptic
      onPress={onPress}
      style={isActive ? styles.activeCard : styles.card}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-[18px] bg-[#F3EFFF]">
          <Image source={images.studyMaterialIllustration} style={styles.thumbnail} contentFit="cover" />
        </View>

        <View className="flex-1">
          <View className="flex-row items-start">
            <View className="flex-1 pr-2">
              <Text selectable className="font-poppins-bold text-[20px] leading-[24px] text-ink" numberOfLines={2} ellipsizeMode="tail">
                {deck.title}
              </Text>
              <Text selectable className="mt-1 font-poppins-medium text-[14px] leading-[19px] text-[#5D678A]" numberOfLines={1}>
                Material {index + 1} - {getDeckMetaLine(deck)}
              </Text>
            </View>

            <PressableScale
              accessibilityLabel={`More actions for ${deck.title}`}
              accessibilityRole="button"
              className="h-8 w-8 items-center justify-center rounded-full bg-[#F4F6FB]"
              haptic
              onPress={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              pressedScale={0.92}
            >
              <DeckIcon color="#8B93AD" fallback="..." name={{ android: "more_horiz", ios: "ellipsis" }} size={18} />
            </PressableScale>
          </View>

          <Text selectable className="mt-1 font-poppins-medium text-[13px] leading-[18px]" style={{ color: statusColor }} numberOfLines={1}>
            {getDeckStatusLine(deck)}
          </Text>

          <View className="mt-2 h-[6px] overflow-hidden rounded-full bg-[#EEF0F8]">
            <View className="h-full rounded-full bg-lingua-purple" style={{ width: `${progressWidth}%` }} />
          </View>

          <View className="mt-2 flex-row items-center justify-between">
            <Text selectable className="flex-1 pr-3 text-[12px] leading-[17px] text-[#8B93AD]" numberOfLines={1}>
              {formatReviewedDate(deck.lastReviewedAt)}
            </Text>

            <View className="flex-row items-center">
              <Text selectable={false} className="font-poppins-semibold text-[13px] leading-[18px] text-lingua-purple">
                Open
              </Text>
              <Text selectable={false} className="ml-1 font-poppins-semibold text-[16px] leading-[18px] text-lingua-purple">
                {">"}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

export default function DecksTabScreen() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<MaterialTab>("cards");
  const [searchQuery, setSearchQuery] = useState("");
  const activeDeckId = useActiveDeckStore((state) => state.activeDeckId);
  const setActiveDeckId = useActiveDeckStore((state) => state.setActiveDeckId);
  const clearAssistantConversation = useFlashlyAssistantStore((state) => state.clearConversation);
  const { decks, errorMessage, status } = useFlashlyDecks();
  const visibleDecks = useMemo(() => {
    const tabDecks =
      activeTab === "cards"
        ? decks
        : decks.filter((deck) => deck.completionPercentage > 0 || deck.weakCardCount > 0 || deck.status === "ready");
    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return tabDecks;
    }

    return tabDecks.filter((deck) =>
      [deck.title, deck.sourceFileName, deck.sourceType]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [activeTab, decks, searchQuery]);

  const totalCards = decks.reduce((sum, deck) => sum + deck.cardCount, 0);
  const reviewedCards = decks.reduce((sum, deck) => sum + deck.reviewedCount, 0);
  const contentStyle = useMemo(
    () => ({
      gap: 12,
      paddingBottom: Math.max(insets.bottom + 142, 170),
      paddingHorizontal: 16,
      paddingTop: Math.max(insets.top + 12, 24),
    }),
    [insets.bottom, insets.top],
  );

  const handleOpenDeck = (deck: DeckDTO) => {
    setActiveDeckId(deck.id);
    router.push(`/deck/${deck.id}` as never);
  };

  const handleDeleteDeck = (deck: DeckDTO) => {
    Alert.alert(
      "Delete deck?",
      `"${deck.title}" will be removed from this device, including its local review progress.`,
      [
        { style: "cancel", text: "Cancel" },
        {
          style: "destructive",
          text: "Delete",
          onPress: async () => {
            try {
              await deleteDeck(deck.id);
              clearAssistantConversation(deck.id);

              if (activeDeckId === deck.id) {
                const nextDeck = decks.find((item) => item.id !== deck.id);
                setActiveDeckId(nextDeck?.id ?? "");
              }
            } catch {
              Alert.alert("Could not delete deck", "Flashly could not delete this deck. Please try again.");
            }
          },
        },
      ],
    );
  };

  const handleDeckActions = (deck: DeckDTO) => {
    Alert.alert("Deck actions", deck.title, [
      { style: "cancel", text: "Cancel" },
      {
        style: "destructive",
        text: "Delete deck",
        onPress: () => handleDeleteDeck(deck),
      },
    ]);
  };

  if (status === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-lingua-background px-6">
        <ActivityIndicator size="large" color="#6C4EF5" />
        <Text selectable className="mt-4 text-center text-[15px] leading-[23px] text-muted">
          Loading decks...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="bg-lingua-background" contentContainerStyle={contentStyle} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.duration(220)} className="flex-row items-center">
        <PressableScale accessibilityRole="button" className="h-12 w-12 items-center justify-center rounded-full bg-white" haptic onPress={() => router.push("/" as never)} style={styles.card}>
          <Text selectable={false} className="font-poppins-semibold text-[34px] leading-[36px] text-ink">
            {"<"}
          </Text>
        </PressableScale>

        <View className="ml-3 flex-1">
          <Text selectable className="text-[13px] leading-[18px] text-muted">
            Your study library
          </Text>
          <Text selectable className="font-poppins-bold text-[28px] leading-[34px] text-ink">
            Your Library
          </Text>
          <Text selectable className="mt-0.5 font-poppins-medium text-[14px] leading-[20px] text-[#5D678A]">
            {decks.length > 0 ? `${decks.length} decks - ${totalCards} cards - ${reviewedCards} reviewed` : "Upload material to create your first deck"}
          </Text>
        </View>

        <PressableScale
          accessibilityRole="button"
          className="h-[58px] w-[58px] items-center justify-center rounded-[18px] bg-white"
          haptic
          onPress={() => router.push("/upload" as never)}
          style={styles.card}
        >
          <DeckIcon color="#6C4EF5" fallback="UP" name={{ android: "upload_file", ios: "square.and.arrow.up.fill" }} size={25} />
        </PressableScale>
      </Animated.View>

      {status === "error" ? (
        <View className="rounded-[30px] border border-[#FFD6D6] bg-[#FFF6F6] p-5">
          <Text selectable className="font-poppins-bold text-[18px] leading-[24px] text-[#C43D32]">
            Could not load decks
          </Text>
          <Text selectable className="mt-2 text-[14px] leading-[21px] text-[#C43D32]">
            {errorMessage ?? "Local deck data is unavailable right now."}
          </Text>
        </View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(50).duration(220)} className="flex-row items-center rounded-[24px] border border-[#ECEEFA] bg-white px-4 py-3" style={styles.card}>
        <DeckIcon color="#8B93AD" fallback="S" name={{ android: "search", ios: "magnifyingglass" }} size={19} />
        <TextInput
          className="ml-3 flex-1 font-poppins-medium text-[15px] leading-[21px] text-ink"
          onChangeText={setSearchQuery}
          placeholder="Search decks"
          placeholderTextColor="#8B93AD"
          value={searchQuery}
        />
        {searchQuery ? (
          <PressableScale className="h-8 w-8 items-center justify-center rounded-full bg-[#F4F6FB]" haptic onPress={() => setSearchQuery("")}>
            <DeckIcon color="#8B93AD" fallback="X" name={{ android: "close", ios: "xmark" }} size={15} />
          </PressableScale>
        ) : null}
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(70).duration(220)} className="flex-row rounded-[22px] bg-[#F7F5FF] p-1">
        {(["cards", "review"] as MaterialTab[]).map((tab) => {
          const isSelected = activeTab === tab;
          return (
            <Pressable key={tab} accessibilityRole="button" accessibilityState={{ selected: isSelected }} className={`flex-1 items-center justify-center rounded-[18px] py-2.5 ${isSelected ? "bg-white" : ""}`} style={isSelected ? styles.selectedTab : undefined} onPress={() => setActiveTab(tab)}>
              <Text selectable={false} className={`font-poppins-semibold text-[15px] leading-[21px] ${isSelected ? "text-lingua-purple" : "text-[#5D678A]"}`}>
                {tab === "cards" ? "Cards" : "Review"}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>

      {visibleDecks.length > 0 ? (
        <Animated.View entering={FadeInDown.delay(120).duration(220)} className="gap-2">
          <View className="flex-row items-end justify-between px-1">
            <Text selectable className="font-poppins-bold text-[21px] leading-[27px] text-ink">
              {activeTab === "cards" ? "All decks" : "Ready to review"}
            </Text>
            <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-muted">
              {visibleDecks.length}
            </Text>
          </View>
          {visibleDecks.map((deck, index) => (
            <Animated.View key={deck.id} entering={FadeInDown.delay(150 + index * 40).duration(220)}>
              <DeckRow
                index={index}
                isActive={deck.id === activeDeckId}
                deck={deck}
                onDelete={() => handleDeckActions(deck)}
                onPress={() => handleOpenDeck(deck)}
              />
            </Animated.View>
          ))}
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(120).duration(220)} className="items-center rounded-[28px] border border-dashed border-[#DADDEC] bg-white p-6">
          <AnimatedOwl size={92} variant="bounce" />
          <Text selectable className="text-center font-poppins-bold text-[22px] leading-[28px] text-ink">
            {searchQuery ? "No matching decks" : "No decks yet"}
          </Text>
          <Text selectable className="mt-2 text-center text-[15px] leading-[23px] text-muted">
            {searchQuery ? "Try a different title, file name, or material type." : "Upload your first study material and Flashly will create cards for you."}
          </Text>
          {searchQuery ? null : (
            <PressableScale className="mt-5 items-center justify-center rounded-[24px] bg-lingua-purple px-5 py-4" haptic onPress={() => router.push("/upload" as never)}>
              <Text selectable={false} className="font-poppins-semibold text-[16px] leading-[22px] text-white">
                Upload material
              </Text>
            </PressableScale>
          )}
        </Animated.View>
      )}

      <Text selectable className="text-center text-[12px] leading-[18px] text-[#8B93AD]">
        {reviewedCards} cards reviewed across uploaded materials
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  activeCard: {
    boxShadow: "0 10px 24px rgba(108, 78, 245, 0.12)",
  },
  card: {
    boxShadow: "0 8px 18px rgba(16, 24, 64, 0.06)",
  },
  selectedTab: {
    boxShadow: "0 6px 12px rgba(108, 78, 245, 0.12)",
  },
  thumbnail: {
    height: "100%",
    width: "100%",
  },
  symbolOverlay: {
    height: 24,
    position: "absolute",
    width: 24,
  },
});
