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
import { GenerationStatusPill } from "@/components/status/generation-status-pill";
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

const statusCopy: Record<DeckDTO["status"] | "needs-review", { color: string; icon: DeckSymbol; tint: string }> = {
  completed: { color: "#21C16B", icon: { android: "check_circle", ios: "checkmark.circle.fill" }, tint: "#E8FFF2" },
  "in-progress": { color: "#6C4EF5", icon: { android: "donut_large", ios: "chart.pie.fill" }, tint: "#F3EFFF" },
  generating: { color: "#6C4EF5", icon: { android: "auto_awesome", ios: "sparkles" }, tint: "#F3EFFF" },
  new: { color: "#4D8BFF", icon: { android: "star", ios: "star.fill" }, tint: "#EEF5FF" },
  "partial-error": { color: "#FF8A00", icon: { android: "warning", ios: "exclamationmark.triangle.fill" }, tint: "#FFF4EC" },
  processing: { color: "#FF8A00", icon: { android: "hourglass_top", ios: "hourglass" }, tint: "#FFF4EC" },
  ready: { color: "#2563EB", icon: { android: "bolt", ios: "bolt.fill" }, tint: "#EAF1FF" },
  "needs-review": { color: "#FF4D4F", icon: { android: "target", ios: "target" }, tint: "#FFF0F0" },
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

function getSourceLabel(deck: DeckDTO) {
  if (deck.sourceType === "pdf") {
    return "PDF material";
  }

  if (deck.sourceType === "image") {
    return "Image material";
  }

  if (deck.sourceType === "text") {
    return "Text material";
  }

  return "Study material";
}

function getStatusLine(deck: DeckDTO) {
  if (deck.status === "processing" || deck.status === "generating") {
    return `${deck.cardCount} cards ready - generating more`;
  }

  if (deck.status === "partial-error") {
    return `${deck.cardCount} cards ready - generation paused`;
  }

  if (deck.weakCardCount > 0) {
    return `${deck.weakCardCount} weak cards need review`;
  }

  if (deck.completionPercentage >= 100) {
    return `${deck.cardCount} cards - ${deck.xpEarned} XP earned`;
  }

  if (deck.reviewedCount > 0) {
    return `Continue review - ${formatPercent(deck.completionPercentage / 100)}`;
  }

  return `${deck.cardCount} cards - ready to review`;
}

function StatPill({ color, icon, label, value }: { color: string; icon: DeckSymbol; label: string; value: string }) {
  return (
    <View className="min-w-[104px] flex-1 rounded-[22px] bg-white/95 p-3">
      <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: `${color}18` }}>
        <DeckIcon color={color} fallback={label.slice(0, 2).toUpperCase()} name={icon} size={20} />
      </View>
      <Text selectable className="mt-2 font-poppins-bold text-[20px] leading-[25px] text-ink">
        {value}
      </Text>
      <Text selectable className="mt-1 font-poppins-semibold text-[12px] leading-[16px] text-[#5D678A]">
        {label}
      </Text>
    </View>
  );
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
  const isCompleted = deck.completionPercentage >= 100 && !isGeneratingDeck;
  const isProgressItem = !isGeneratingDeck && !isCompleted && deck.reviewedCount > 0;
  const hasWeakCards = deck.weakCardCount > 0 && !isGeneratingDeck;
  const status = hasWeakCards ? statusCopy["needs-review"] : isCompleted ? statusCopy.completed : statusCopy[deck.status];

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      className={`rounded-[26px] border bg-white p-3 ${isActive ? "border-lingua-purple" : "border-[#ECEEFA]"}`}
      haptic
      onPress={onPress}
      style={isActive ? styles.activeCard : styles.card}
    >
      <View className="flex-row items-start">
        <View className="h-[64px] w-[64px] items-center justify-center overflow-hidden rounded-[20px] bg-[#F3EFFF]">
          <Image source={images.studyMaterialIllustration} style={styles.thumbnail} contentFit="cover" />
        </View>

        <View className="ml-4 flex-1">
          <View className="flex-row items-start">
            <View className="flex-1 pr-2">
              <Text selectable className="font-poppins-medium text-[13px] leading-[18px] text-[#5D678A]">
                Material {index + 1} - {getSourceLabel(deck)}
              </Text>
              <Text selectable className="mt-1 font-poppins-bold text-[18px] leading-[24px] text-ink">
                {deck.title}
              </Text>
            </View>

            <PressableScale
              accessibilityLabel={`Delete ${deck.title}`}
              accessibilityRole="button"
              className="h-9 w-9 items-center justify-center rounded-full bg-[#FFF0F0]"
              haptic
              onPress={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              pressedScale={0.92}
            >
              <DeckIcon color="#FF4D4F" fallback="X" name={{ android: "delete", ios: "trash.fill" }} size={18} />
            </PressableScale>
          </View>

          <Text selectable className={`mt-1 font-poppins-medium text-[13px] leading-[19px] ${hasWeakCards ? "text-[#FF4D4F]" : "text-[#5D678A]"}`}>
            {getStatusLine(deck)}
          </Text>

          {isGeneratingDeck ? (
            <View className="mt-2">
              <GenerationStatusPill status={deck.status === "partial-error" ? "partial-error" : "generating"} />
            </View>
          ) : null}
        </View>
      </View>

      <View className="mt-3 flex-row items-center">
        <View className="h-2 flex-1 overflow-hidden rounded-full bg-[#EEF0F8]">
          <View className="h-full rounded-full bg-lingua-purple" style={{ width: `${Math.min(Math.max(deck.completionPercentage, 0), 100)}%` }} />
        </View>

        <View className="ml-3 flex-row items-center rounded-full px-3 py-2" style={{ backgroundColor: status.tint }}>
          <DeckIcon color={status.color} fallback="S" name={status.icon} size={16} />
          <Text selectable={false} className="ml-1 font-poppins-bold text-[12px] leading-[16px]" style={{ color: status.color }}>
            {isCompleted ? "Done" : isProgressItem ? formatPercent(deck.completionPercentage / 100) : hasWeakCards ? "Weak" : "Open"}
          </Text>
        </View>
      </View>

      <View className="mt-2 flex-row items-center justify-between">
        <Text selectable className="flex-1 text-[12px] leading-[17px] text-[#8B93AD]">
          {deck.lastReviewedAt ? `Last reviewed ${deck.lastReviewedAt}` : "Not reviewed yet"}
        </Text>

        {!isCompleted ? (
          <View className="flex-row items-center">
            <Text selectable={false} className="font-poppins-semibold text-[13px] leading-[18px] text-lingua-purple">
              Open
            </Text>
            <Text selectable={false} className="ml-1 font-poppins-semibold text-[18px] leading-[20px] text-lingua-purple">
              {">"}
            </Text>
          </View>
        ) : null}
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
  const activeDeck = decks.find((deck) => deck.id === activeDeckId) ?? decks[0] ?? null;
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
  const weakCards = decks.reduce((sum, deck) => sum + deck.weakCardCount, 0);
  const completedDecks = decks.filter((deck) => deck.completionPercentage >= 100).length;
  const generatedDecks = decks.filter((deck) => deck.materialId).length;
  const reviewPercent = totalCards > 0 ? reviewedCards / totalCards : 0;
  const contentStyle = useMemo(
    () => ({
      gap: 13,
      paddingBottom: Math.max(insets.bottom + 160, 190),
      paddingHorizontal: 18,
      paddingTop: Math.max(insets.top + 14, 28),
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
            await deleteDeck(deck.id);
            clearAssistantConversation(deck.id);

            if (activeDeckId === deck.id) {
              const nextDeck = decks.find((item) => item.id !== deck.id);
              setActiveDeckId(nextDeck?.id ?? "");
            }
          },
        },
      ],
    );
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
          <Text selectable className="font-poppins-bold text-[25px] leading-[32px] text-ink">
            Your Library
          </Text>
          <Text selectable className="mt-1 font-poppins-medium text-[15px] leading-[21px] text-[#5D678A]">
            {activeDeck ? `${decks.length} decks - ${reviewedCards} cards reviewed` : "Upload study material to create your first deck"}
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

      <Animated.View entering={FadeInDown.delay(70).duration(220)} className="overflow-hidden rounded-[30px] bg-lingua-purple p-4" style={styles.card}>
        <View className="flex-row items-start">
          <View className="flex-1 pr-4">
            <View className="self-start rounded-full bg-white/15 px-4 py-2">
              <Text selectable className="font-poppins-semibold text-[12px] leading-[16px] text-white">
                {activeDeck ? "Continue studying" : "Build your library"}
              </Text>
            </View>
            <Text selectable className="mt-3 font-poppins-bold text-[25px] leading-[31px] text-white">
              {activeDeck?.title ?? "No decks yet"}
            </Text>
            <Text selectable className="mt-2 text-[14px] leading-[21px] text-[#EAE4FF]">
              {activeDeck
                ? `${activeDeck.cardCount} cards in this deck, ${activeDeck.reviewedCount} already reviewed.`
                : "Upload your first file and Flashly will create cards here."}
            </Text>
          </View>
          <View className="h-[82px] w-[82px] overflow-hidden rounded-[24px] bg-white/15">
            <Image source={images.studyMaterialIllustration} style={styles.thumbnail} contentFit="cover" />
          </View>
        </View>

        <View className="mt-4 h-3 overflow-hidden rounded-full bg-white/25">
          <View className="h-full rounded-full bg-white" style={{ width: `${Math.min(reviewPercent, 1) * 100}%` }} />
        </View>
        <Text selectable className="mt-3 font-poppins-semibold text-[13px] leading-[18px] text-white">
          {formatPercent(reviewPercent)} of all cards reviewed
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).duration(220)} className="rounded-[28px] bg-[#F5F0FF] p-3" style={styles.card}>
        <Image source={images.studyMaterialIllustration} style={styles.heroImage} contentFit="cover" />
        <View className="mt-2 flex-row flex-wrap gap-2">
          <StatPill color="#3D8BFF" icon={{ android: "style", ios: "rectangle.stack.fill" }} label="Cards" value={String(totalCards)} />
          <StatPill color="#FF4D4F" icon={{ android: "target", ios: "target" }} label="Weak" value={String(weakCards)} />
          <StatPill color="#21B36B" icon={{ android: "check_circle", ios: "checkmark.circle.fill" }} label="Done" value={String(completedDecks)} />
          <StatPill color="#8B5CF6" icon={{ android: "auto_awesome", ios: "sparkles" }} label="Generated" value={String(generatedDecks)} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(170).duration(220)} className="flex-row rounded-[24px] bg-[#F7F5FF] p-1">
        {(["cards", "review"] as MaterialTab[]).map((tab) => {
          const isSelected = activeTab === tab;
          return (
            <Pressable key={tab} accessibilityRole="button" accessibilityState={{ selected: isSelected }} className={`flex-1 items-center justify-center rounded-[20px] py-3 ${isSelected ? "bg-white" : ""}`} style={isSelected ? styles.selectedTab : undefined} onPress={() => setActiveTab(tab)}>
              <Text selectable={false} className={`font-poppins-semibold text-[18px] leading-[24px] ${isSelected ? "text-lingua-purple" : "text-[#5D678A]"}`}>
                {tab === "cards" ? "Cards" : "Review"}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>

      {visibleDecks.length > 0 ? (
        <Animated.View entering={FadeInDown.delay(220).duration(220)} className="gap-2">
          <View className="flex-row items-end justify-between px-1">
            <Text selectable className="font-poppins-bold text-[22px] leading-[28px] text-ink">
              {activeTab === "cards" ? "All decks" : "Ready to review"}
            </Text>
            <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-muted">
              {visibleDecks.length} shown
            </Text>
          </View>
          {visibleDecks.map((deck, index) => (
            <Animated.View key={deck.id} entering={FadeInDown.delay(250 + index * 45).duration(220)}>
              <DeckRow
                index={index}
                isActive={deck.id === activeDeckId}
                deck={deck}
                onDelete={() => handleDeleteDeck(deck)}
                onPress={() => handleOpenDeck(deck)}
              />
            </Animated.View>
          ))}
        </Animated.View>
      ) : (
        <Animated.View entering={FadeInDown.delay(220).duration(220)} className="items-center rounded-[30px] border border-dashed border-[#DADDEC] bg-white p-6">
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
                Upload your first material
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
  heroImage: {
    borderRadius: 22,
    height: 130,
    width: "100%",
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
