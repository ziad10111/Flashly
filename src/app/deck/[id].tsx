import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import semiBold from "expo-symbols/androidWeights/semiBold";
import { router, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { GetDeckResponse } from "@/api/contracts";
import { deleteDeck, getCardsForDeck, getDeckById } from "@/api/repositories/deckRepository";
import { PressableScale } from "@/components/animated/pressable-scale";
import { AnimatedOwl } from "@/components/mascot/animated-owl";
import { GenerationStatusPill } from "@/components/status/generation-status-pill";
import { formatPercent } from "@/lib/deck-utils";
import { triggerLightHaptic, triggerSuccessHaptic } from "@/lib/feedback/haptics";
import { celebrateXp } from "@/lib/feedback/xpCelebration";
import { safeBack } from "@/lib/navigation/safeBack";
import {
  BACKGROUND_BATCH_CARD_COUNT,
  MAX_PROGRESSIVE_PDF_CARDS,
  runRemainingGeneratedDeckBatches,
} from "@/lib/progressive-generation";
import { useActiveDeckStore } from "@/store/useActiveDeckStore";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";
import { useFlashlyUploadStore } from "@/store/useFlashlyUploadStore";

type LoadState = "loading" | "ready" | "not-found" | "error";

type DetailSymbol = {
  android: AndroidSymbol;
  ios: SFSymbol;
};

type DetailIconToken = {
  fallback: string;
  name: DetailSymbol;
};

function DetailIcon({
  color,
  fallback,
  name,
  size = 22,
}: {
  color: string;
  fallback: string;
  name: DetailSymbol;
  size?: number;
}) {
  return (
    <View className="items-center justify-center">
      <Text selectable={false} className="font-poppins-bold text-[15px] leading-[18px]" style={{ color }}>
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

const getSectionIcon = (section: string): DetailIconToken => {
  const normalized = section.toLowerCase();

  if (/(electric|voltage|current|resistance|circuit)/.test(normalized)) {
    return {
      fallback: "⚡",
      name: { android: "bolt", ios: "bolt.fill" },
    };
  }

  if (normalized.includes("safety")) {
    return {
      fallback: "✓",
      name: { android: "verified_user", ios: "shield.checkered" },
    };
  }

  if (normalized.includes("introduction") || normalized.includes("overview")) {
    return {
      fallback: "B",
      name: { android: "menu_book", ios: "book.closed.fill" },
    };
  }

  return {
    fallback: "T",
    name: { android: "description", ios: "doc.text.fill" },
  };
};

const formatReviewedDate = (value: string) => {
  if (value === "Not reviewed yet") {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const getHeroSubtitle = (status: GeneratedStatus | undefined) => {
  if (status === "generating") {
    return "More cards are still being created.";
  }

  if (status === "partial-error") {
    return "Some cards failed. You can retry remaining cards.";
  }

  return "Your cards are ready to review.";
};

type GeneratedStatus = "generating" | "complete" | "partial-error";

function IconBadge({
  color,
  fallback,
  icon,
  tint,
}: {
  color: string;
  fallback: string;
  icon: DetailSymbol;
  tint: string;
}) {
  return (
    <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: tint }}>
      <DetailIcon color={color} fallback={fallback} name={icon} size={21} />
    </View>
  );
}

function BackIcon() {
  return (
    <SymbolView
      name={{ android: "arrow_back", ios: "chevron.left" }}
      size={22}
      tintColor="#20233A"
      weight={{ android: semiBold, ios: "semibold" }}
      fallback={
        <Text selectable={false} className="font-poppins-semibold text-[26px] leading-[28px] text-ink">
          {"<"}
        </Text>
      }
    />
  );
}

function HeroDeckIcon({ status }: { status: GeneratedStatus | undefined }) {
  const mood = status === "generating" ? "waiting" : status === "partial-error" ? "wrong" : "success";

  return (
    <View className="h-[82px] w-[82px] items-center justify-center rounded-[24px] bg-white/20">
      <AnimatedOwl
        mood={mood}
        size={64}
        variant={status === "generating" ? "float" : status === "partial-error" ? "bounce" : "celebrate"}
      />
    </View>
  );
}

function StatCard({
  color,
  fallback,
  icon,
  label,
  value,
}: {
  color: string;
  fallback: string;
  icon: DetailSymbol;
  label: string;
  value: string;
}) {
  return (
    <PressableScale
      className="min-h-[104px] flex-1 basis-[46%] rounded-[24px] border border-[#E8E3FA] bg-white p-3"
      haptic
      pressedScale={0.98}
      style={styles.statCard}
    >
      <IconBadge color={color} fallback={fallback} icon={icon} tint={`${color}18`} />
      <Text selectable className="mt-2 font-poppins-bold text-[21px] leading-[26px] text-ink" style={{ fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      <Text selectable className="mt-1 text-[13px] leading-[18px] text-muted">
        {label}
      </Text>
    </PressableScale>
  );
}

function StateCard({ title, body }: { title: string; body: string }) {
  return (
    <ScrollView className="bg-lingua-background" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.stateContainer}>
      <PressableScale className="h-12 w-12 items-center justify-center rounded-full bg-white" haptic onPress={() => safeBack("/decks")} style={styles.cardShadow}>
        <Text selectable={false} className="font-poppins-semibold text-[30px] leading-[32px] text-ink">
          {"<"}
        </Text>
      </PressableScale>
      <View className="rounded-[30px] bg-white p-6" style={styles.cardShadow}>
        <Text selectable className="font-poppins-bold text-[24px] leading-[31px] text-ink">
          {title}
        </Text>
        <Text selectable className="mt-3 text-[15px] leading-[23px] text-muted">
          {body}
        </Text>
      </View>
    </ScrollView>
  );
}

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deckRouter = useRouter();
  const insets = useSafeAreaInsets();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [deckResponse, setDeckResponse] = useState<GetDeckResponse | null>(null);
  const [isRetryingGeneration, setIsRetryingGeneration] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const previousGenerationStatusRef = useRef<string | undefined>(undefined);
  const setActiveDeckId = useActiveDeckStore((state) => state.setActiveDeckId);
  const progress = useFlashlyProgressStore((state) => (id ? state.deckProgressById[id] : undefined));
  const generatedDecks = useFlashlyUploadStore((state) => state.generatedDecks);
  const generatedCardsByDeckId = useFlashlyUploadStore((state) => state.generatedCardsByDeckId);
  const generatedDeck = useMemo(
    () => (id ? generatedDecks.find((deck) => deck.id === id) : undefined),
    [generatedDecks, id],
  );
  const generationStatus = generatedDeck?.generationStatus;
  const contentStyle = useMemo(
    () => ({
      gap: 13,
      paddingBottom: Math.max(insets.bottom + 220, 250),
      paddingHorizontal: 18,
      paddingTop: Math.max(insets.top + 14, 28),
    }),
    [insets.bottom, insets.top],
  );

  useEffect(() => {
    if (!generationStatus) {
      return;
    }

    const previousStatus = previousGenerationStatusRef.current;
    previousGenerationStatusRef.current = generationStatus;

    if (previousStatus && previousStatus !== "complete" && generationStatus === "complete") {
      triggerSuccessHaptic();
      celebrateXp(25, "deck");
    }
  }, [generationStatus]);

  useEffect(() => {
    let isMounted = true;

    const loadDeck = async () => {
      if (!id) {
        setLoadState("not-found");
        return;
      }

      setLoadState((current) => (current === "ready" ? current : "loading"));

      try {
        const response = await getDeckById(id);

        if (!isMounted) {
          return;
        }

        if (!response) {
          setDeckResponse(null);
          setLoadState("not-found");
          return;
        }

        const cards = await getCardsForDeck(id);
        setDeckResponse({ ...response, cards });
        setLoadState("ready");
      } catch {
        if (isMounted) {
          setLoadState("error");
        }
      }
    };

    loadDeck();

    return () => {
      isMounted = false;
    };
  }, [generatedCardsByDeckId, generatedDecks, id]);

  const stats = useMemo(() => {
    if (!deckResponse) {
      return null;
    }

    const totalCards = deckResponse.cards.length || deckResponse.deck.cardCount;
    const deckCardIds = new Set(deckResponse.cards.map((card) => card.id));
    const reviewedCount = Math.min(progress?.reviewedCardIds.length ?? deckResponse.deck.reviewedCount, totalCards);
    const completion = totalCards > 0 ? reviewedCount / totalCards : 0;
    const weakCount = progress
      ? progress.weakCardIds.filter((cardId) => deckCardIds.has(cardId)).length
      : deckResponse.deck.weakCardCount;

    return {
      completion: progress ? Math.min(completion, 1) : deckResponse.deck.completionPercentage / 100,
      lastReviewedDate: progress?.lastReviewedDate ?? deckResponse.deck.lastReviewedAt ?? "Not reviewed yet",
      reviewedCount,
      totalCards,
      weakCount: Math.min(weakCount, totalCards),
      xpEarned: progress?.xpEarned ?? deckResponse.deck.xpEarned,
    };
  }, [deckResponse, progress]);

  if (loadState === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-lingua-background px-6">
        <ActivityIndicator size="large" color="#6C4EF5" />
        <Text selectable className="mt-4 text-center text-[15px] leading-[23px] text-muted">
          Loading deck...
        </Text>
      </View>
    );
  }

  if (loadState === "error") {
    return <StateCard title="Could not load deck" body="Something went wrong while reading local deck data." />;
  }

  if (!deckResponse || !stats) {
    return <StateCard title="Deck not found" body="This generated deck is not available on this device." />;
  }

  const { deck, cards } = deckResponse;
  const isStarted = stats.reviewedCount > 0 && stats.completion < 1;
  const primaryLabel = stats.completion >= 1 ? "Review Again" : isStarted ? "Continue Review" : "Start Review";
  const weakCardsLabel = stats.weakCount === 1 ? "1 weak card" : `${stats.weakCount} weak cards`;
  const sections = Array.from(new Set(cards.map((card) => card.sourceSection ?? card.topic ?? "Generated flashcards"))).slice(0, 5);
  const expectedCardCount = generatedDeck?.expectedCardCount;
  const isProgressiveDeck = Boolean(generationStatus && expectedCardCount);
  const heroSubtitle = getHeroSubtitle(generationStatus);
  const readyCardCount = cards.length;
  const generationProgress = expectedCardCount ? Math.min(readyCardCount / expectedCardCount, 1) : stats.completion;
  const heroProgress = generationStatus === "generating" || generationStatus === "partial-error" ? generationProgress : stats.completion;
  const heroProgressLabel =
    generationStatus === "generating" || generationStatus === "partial-error"
      ? `${readyCardCount} / ${expectedCardCount ?? readyCardCount} cards ready`
      : `${formatPercent(stats.completion)} complete`;
  const generationStatusLabel =
    generationStatus === "generating"
      ? `Generating: ${readyCardCount} / ${expectedCardCount ?? readyCardCount} cards ready`
      : generationStatus === "partial-error"
        ? `Partial deck: ${readyCardCount} / ${expectedCardCount ?? readyCardCount} cards ready`
        : generationStatus === "complete"
          ? "Generation complete"
          : null;
  const generationWarning =
    generationStatus === "generating"
      ? "More cards are being generated in the background."
      : generationStatus === "partial-error"
        ? "Some background batches failed. You can study the available cards or retry."
        : null;

  const handleRetryRemainingCards = async () => {
    if (!generatedDeck?.generationSourceText || !generatedDeck.idempotencyKey || !generatedDeck.materialId || isRetryingGeneration) {
      return;
    }

    setIsRetryingGeneration(true);
    triggerLightHaptic();

    try {
      await runRemainingGeneratedDeckBatches({
        batchSize: generatedDeck.backgroundBatchSize ?? BACKGROUND_BATCH_CARD_COUNT,
        deckId: generatedDeck.id,
        extractedTextPreview: generatedDeck.generationSourceText,
        idempotencyKey: generatedDeck.idempotencyKey,
        materialId: generatedDeck.materialId,
        maxCards: generatedDeck.maxGeneratedCards ?? MAX_PROGRESSIVE_PDF_CARDS,
        startQuestionIndex: generatedDeck.nextBatchStartIndex ?? cards.length,
      });
    } finally {
      setIsRetryingGeneration(false);
    }
  };

  const performDeleteDeck = async () => {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteDeck(deck.id);
      setActiveDeckId("");
      deckRouter.replace("/decks" as never);
    } catch (error) {
      console.warn("Delete deck failed", error);
      Alert.alert("Could not delete deck", "The deck was not deleted. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteDeck = () => {
    if (isDeleting) {
      return;
    }

    Alert.alert(
      "Delete deck",
      `"${deck.title}" will be permanently removed, including its review progress. This action cannot be undone.`,
      [
        { style: "cancel", text: "Cancel" },
        {
          onPress: () => void performDeleteDeck(),
          style: "destructive",
          text: "Delete",
        },
      ],
    );
  };

  return (
    <ScrollView className="bg-lingua-background" contentContainerStyle={contentStyle} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.duration(220)} className="flex-row items-center">
        <PressableScale className="h-12 w-12 items-center justify-center rounded-full bg-white" haptic onPress={() => safeBack("/decks")} style={styles.cardShadow}>
          <BackIcon />
        </PressableScale>
        <View className="ml-4 flex-1">
          <Text selectable className="text-[13px] leading-[18px] text-muted">
            Study command center
          </Text>
          <Text selectable className="font-poppins-bold text-[25px] leading-[32px] text-ink">
            Deck details
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(70).duration(220)} className="overflow-hidden rounded-[30px] bg-lingua-purple p-4" style={styles.cardShadow}>
        <View className="flex-row items-start">
          <View className="flex-1 pr-4">
            <View className="self-start rounded-full bg-white/15 px-4 py-2">
              <Text selectable className="font-poppins-semibold text-[12px] leading-[16px] text-white">
                {isProgressiveDeck ? `${readyCardCount} cards ready` : `${stats.totalCards} cards`}
              </Text>
            </View>
            <Text selectable className="mt-3 font-poppins-bold text-[25px] leading-[31px] text-white">
              {deck.title}
            </Text>
            <Text selectable className="mt-2 text-[14px] leading-[21px] text-[#EAE4FF]">
              {heroSubtitle}
            </Text>
            <Text selectable className="mt-1 text-[12px] leading-[18px] text-[#D9CEFF]">
              {deck.sourceFileName}
            </Text>
            <View className="mt-3">
              <GenerationStatusPill status={generationStatus} />
            </View>
          </View>
          <HeroDeckIcon status={generationStatus} />
        </View>

        <View className="mt-4 h-3 overflow-hidden rounded-full bg-white/25">
          <View className="h-full rounded-full bg-white" style={{ width: `${heroProgress * 100}%` }} />
        </View>
        <Text selectable className="mt-3 font-poppins-semibold text-[14px] leading-[19px] text-white">
          {heroProgressLabel}
        </Text>
        <Text selectable className="mt-1 text-[13px] leading-[19px] text-[#EAE4FF]">
          {stats.reviewedCount} / {stats.totalCards} mastered - {stats.xpEarned} XP earned
        </Text>
      </Animated.View>

      {generationStatusLabel || generationWarning ? (
        <Animated.View entering={FadeInDown.delay(120).duration(220)} className="rounded-[26px] border border-[#ECE8FF] bg-white p-4" style={styles.cardShadow}>
          <View className="flex-row items-start">
            <View className="h-[56px] w-[56px] items-center justify-center rounded-[20px] bg-[#F7F4FF]">
              <AnimatedOwl
                mood={generationStatus === "complete" ? "success" : generationStatus === "partial-error" ? "wrong" : "waiting"}
                size={46}
                variant={generationStatus === "complete" ? "celebrate" : "float"}
              />
            </View>
            <View className="ml-4 flex-1">
              {generationStatusLabel ? (
                <Text selectable className="font-poppins-bold text-[18px] leading-[24px] text-ink">
                  {generationStatusLabel}
                </Text>
              ) : null}
              {generationWarning ? (
                <Text selectable className="mt-2 text-[14px] leading-[21px] text-muted">
                  {generationWarning}
                </Text>
              ) : null}
              {generationStatus === "partial-error" && generatedDeck?.generationLastError ? (
                <Text selectable className="mt-2 text-[13px] leading-[19px] text-[#8B93AD]">
                  Last error: {generatedDeck.generationLastError}
                </Text>
              ) : null}
            </View>
          </View>

          {generationStatus === "partial-error" ? (
            <PressableScale
              className={`mt-3 items-center justify-center rounded-[22px] px-5 py-3 ${isRetryingGeneration ? "bg-[#E8E1FF]" : "bg-lingua-purple"}`}
              disabled={isRetryingGeneration || !generatedDeck?.generationSourceText}
              haptic
              onPress={handleRetryRemainingCards}
            >
              <Text selectable={false} className={`font-poppins-semibold text-[16px] leading-[22px] ${isRetryingGeneration ? "text-lingua-purple" : "text-white"}`}>
                {isRetryingGeneration ? "Retrying..." : "Retry remaining cards"}
              </Text>
            </PressableScale>
          ) : null}
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(160).duration(220)} className="flex-row flex-wrap gap-2">
        <StatCard color="#6C4EF5" fallback="C" icon={{ android: "style", ios: "rectangle.stack.fill" }} label={isProgressiveDeck ? "Cards ready" : "Total cards"} value={String(stats.totalCards)} />
        <StatCard color="#3D8BFF" fallback="R" icon={{ android: "fact_check", ios: "checkmark.circle.fill" }} label="Reviewed" value={String(stats.reviewedCount)} />
        <StatCard color="#FF4D4F" fallback="!" icon={{ android: "target", ios: "exclamationmark.triangle.fill" }} label="Weak cards" value={String(stats.weakCount)} />
        <StatCard color="#FF8A1F" fallback="XP" icon={{ android: "award_star", ios: "star.fill" }} label="XP earned" value={String(stats.xpEarned)} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(210).duration(220)} className="rounded-[28px] bg-white p-4" style={styles.cardShadow}>
        <View className="flex-row items-center justify-between">
          <Text selectable className="font-poppins-bold text-[20px] leading-[26px] text-ink">
            Card sets
          </Text>
          <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-muted">
            {sections.length || 1} sections
          </Text>
        </View>
        <View className="mt-3 gap-2">
          {(sections.length > 0 ? sections : ["Generated flashcards"]).map((section) => {
            const sectionIcon = getSectionIcon(section);

            return (
            <View key={section} className="flex-row items-center rounded-[20px] bg-[#F7F4FF] p-3">
              <View className="h-11 w-11 items-center justify-center rounded-full bg-white">
                <DetailIcon color="#6C4EF5" fallback={sectionIcon.fallback} name={sectionIcon.name} size={20} />
              </View>
              <View className="ml-4 flex-1">
                <Text selectable className="font-poppins-semibold text-[16px] leading-[22px] text-ink">
                  {section}
                </Text>
                <Text selectable className="mt-1 text-[13px] leading-[19px] text-muted">
                  Source section
                </Text>
              </View>
            </View>
            );
          })}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(260).duration(220)} className="rounded-[26px] bg-white p-4" style={styles.cardShadow}>
        <View className="flex-row items-center">
          <View className="h-11 w-11 items-center justify-center rounded-full bg-[#EEF5FF]">
            <DetailIcon color="#3D8BFF" fallback="D" name={{ android: "calendar_month", ios: "calendar" }} />
          </View>
          <View className="ml-4 flex-1">
            <Text selectable className="font-poppins-semibold text-[14px] leading-[19px] text-muted">
              Last reviewed
            </Text>
            <Text selectable className="mt-1 font-poppins-bold text-[22px] leading-[28px] text-ink">
              {formatReviewedDate(stats.lastReviewedDate)}
            </Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(310).duration(220)} className="gap-2 rounded-[28px] bg-white p-3" style={styles.cardShadow}>
        <PressableScale className="items-center justify-center rounded-[24px] bg-lingua-purple px-6 py-4" haptic onPress={() => router.push(`/review/${deck.id}` as never)}>
          <Text selectable={false} className="font-poppins-semibold text-[20px] leading-[26px] text-white">
            {primaryLabel}
          </Text>
        </PressableScale>

        {stats.weakCount > 0 ? (
          <PressableScale className="items-center justify-center rounded-[24px] bg-[#FFF0F0] px-6 py-4" haptic onPress={() => router.push(`/review/${deck.id}?mode=weak` as never)}>
            <Text selectable={false} className="font-poppins-semibold text-[18px] leading-[24px] text-[#FF4D4F]">
              Review Weak Cards ({weakCardsLabel})
            </Text>
          </PressableScale>
        ) : null}

        <PressableScale
          className={`items-center justify-center rounded-[24px] px-6 py-4 ${isDeleting ? "bg-[#FFE0E0]" : "bg-[#FFF0F0]"}`}
          disabled={isDeleting}
          haptic
          onPress={handleDeleteDeck}
        >
          <Text selectable={false} className="font-poppins-semibold text-[18px] leading-[24px] text-[#FF4D4F]">
            {isDeleting ? "Deleting..." : "Delete Deck"}
          </Text>
        </PressableScale>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    boxShadow: "0 8px 18px rgba(16, 24, 64, 0.06)",
  },
  statCard: {
    boxShadow: "0 10px 22px rgba(16, 24, 64, 0.07)",
  },
  stateContainer: {
    gap: 16,
    paddingBottom: 130,
    paddingHorizontal: 18,
    paddingTop: 18,
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
