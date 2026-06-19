import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import semiBold from "expo-symbols/androidWeights/semiBold";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getCardsForDeck, getDeckById } from "@/api/repositories/deckRepository";
import { PressableScale } from "@/components/animated/pressable-scale";
import { AnimatedOwl } from "@/components/mascot/animated-owl";
import { triggerSuccessHaptic, triggerWarningHaptic } from "@/lib/feedback/haptics";
import { celebrateXp } from "@/lib/feedback/xpCelebration";
import { playAnswerSound } from "@/lib/feedback/sounds";
import { formatPercent } from "@/lib/deck-utils";
import { safeBack } from "@/lib/navigation/safeBack";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";
import { useFlashlyUploadStore } from "@/store/useFlashlyUploadStore";
import type { DeckDTO, FlashcardDTO, GetDeckResponse } from "@/api/contracts";

type ReviewMode = "all" | "weak";
type LoadState = "loading" | "ready" | "not-found" | "empty" | "weak-empty" | "error";

type ReviewSymbol = {
  android: AndroidSymbol;
  ios: SFSymbol;
};

function ReviewIcon({
  color,
  fallback,
  name,
  size = 22,
}: {
  color: string;
  fallback: string;
  name: ReviewSymbol;
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

function SummaryStat({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: ReviewSymbol;
  label: string;
  value: string;
}) {
  return (
    <View className="min-h-[98px] flex-1 basis-[46%] rounded-[24px] border border-[#F0ECFA] bg-white p-3" style={styles.cardShadow}>
      <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: `${color}18` }}>
        <ReviewIcon color={color} fallback={label.slice(0, 2).toUpperCase()} name={icon} size={21} />
      </View>
      <Text selectable className="mt-2 font-poppins-bold text-[24px] leading-[30px] text-ink">
        {value}
      </Text>
      <Text selectable className="mt-1 text-[13px] leading-[18px] text-muted">
        {label}
      </Text>
    </View>
  );
}

const getSummaryStats = (deck: DeckDTO, cards: FlashcardDTO[]) => {
  const latestProgress = useFlashlyProgressStore.getState().deckProgressById[deck.id];
  const reviewedCount = Math.min(latestProgress?.reviewedCardIds.length ?? deck.reviewedCount, cards.length || deck.cardCount);
  const totalCards = cards.length || deck.cardCount;
  const completion = totalCards > 0 ? Math.min(reviewedCount / totalCards, 1) : 0;

  return {
    completion,
    weakCardCount: latestProgress?.weakCardIds.length ?? deck.weakCardCount,
  };
};

function EmptyState({ body, fallback = "/decks", title }: { title: string; body: string; fallback?: "/decks" }) {
  const insets = useSafeAreaInsets();
  const contentStyle = useMemo(
    () => ({
      gap: 13,
      paddingBottom: Math.max(insets.bottom + 160, 190),
      paddingHorizontal: 18,
      paddingTop: Math.max(insets.top + 14, 28),
    }),
    [insets.bottom, insets.top],
  );

  return (
    <ScrollView className="bg-lingua-background" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={contentStyle}>
      <PressableScale className="h-12 w-12 items-center justify-center rounded-full bg-white" haptic style={styles.cardShadow} onPress={() => safeBack(fallback)}>
        <Text selectable={false} className="font-poppins-semibold text-[30px] leading-[32px] text-ink">
          {"<"}
        </Text>
      </PressableScale>
      <View className="items-center rounded-[30px] bg-white p-6" style={styles.cardShadow}>
        <AnimatedOwl size={88} variant="float" />
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

export default function ReviewSessionScreen() {
  const { deckId, mode } = useLocalSearchParams<{ deckId: string; mode?: ReviewMode }>();
  const insets = useSafeAreaInsets();
  useFlashlyProgressStore((state) => (deckId ? state.deckProgressById[deckId] : undefined));
  const recordCardReview = useFlashlyProgressStore((state) => state.recordCardReview);
  const recordSessionFinished = useFlashlyProgressStore((state) => state.recordSessionFinished);
  const generatedDecks = useFlashlyUploadStore((state) => state.generatedDecks);
  const generatedCardsByDeckId = useFlashlyUploadStore((state) => state.generatedCardsByDeckId);
  const generatedDeck = generatedDecks.find((deck) => deck.id === deckId);
  const [deckResponse, setDeckResponse] = useState<GetDeckResponse | null>(null);
  const [cards, setCards] = useState<FlashcardDTO[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [reviewedInSession, setReviewedInSession] = useState<string[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [isWaitingForMoreCards, setIsWaitingForMoreCards] = useState(false);
  const answeredMcqCardIdsRef = useRef(new Set<string>());
  const contentStyle = useMemo(
    () => ({
      gap: 16,
      paddingBottom: Math.max(insets.bottom + 180, 210),
      paddingHorizontal: 18,
      paddingTop: Math.max(insets.top + 18, 34),
    }),
    [insets.bottom, insets.top],
  );

  useEffect(() => {
    answeredMcqCardIdsRef.current.clear();
    setCurrentIndex(0);
    setIsAnswerVisible(false);
    setSelectedChoiceId(null);
    setIsFinished(false);
    setReviewedInSession([]);
    setIsWaitingForMoreCards(false);
  }, [deckId, mode]);

  useEffect(() => {
    let isMounted = true;

    const loadReview = async () => {
      if (!deckId) {
        setLoadState("not-found");
        return;
      }

      setLoadState((current) => (current === "ready" ? current : "loading"));

      try {
        const response = await getDeckById(deckId);

        if (!isMounted) {
          return;
        }

        if (!response) {
          setDeckResponse(null);
          setCards([]);
          setLoadState("not-found");
          return;
        }

        const allCards = await getCardsForDeck(deckId);
        const deckProgress = useFlashlyProgressStore.getState().deckProgressById[deckId];
        const reviewCards =
          mode === "weak" ? allCards.filter((card) => deckProgress?.weakCardIds.includes(card.id)) : allCards;

        setDeckResponse({ ...response, cards: allCards });
        setCards(reviewCards);
        setCurrentIndex((index) => Math.min(index, Math.max(reviewCards.length - 1, 0)));

        if (allCards.length === 0) {
          setLoadState("empty");
          return;
        }

        if (mode === "weak" && reviewCards.length === 0) {
          setLoadState("weak-empty");
          return;
        }

        setLoadState("ready");
      } catch {
        if (isMounted) {
          setLoadState("error");
        }
      }
    };

    loadReview();

    return () => {
      isMounted = false;
    };
  }, [deckId, generatedCardsByDeckId, generatedDecks, mode]);

  const deck = deckResponse?.deck ?? null;
  const currentCard = cards[currentIndex];
  const isDeckGenerating = generatedDeck?.generationStatus === "generating";
  const isDeckPartialError = generatedDeck?.generationStatus === "partial-error";
  const progressValue = cards.length > 0 ? (isFinished ? 1 : currentIndex / cards.length) : 0;
  const isMcqCard = currentCard?.type === "mcq" && (currentCard.choices?.length ?? 0) >= 2 && Boolean(currentCard.correctChoiceId);
  const selectedChoice = currentCard?.choices?.find((choice) => choice.id === selectedChoiceId);
  const correctChoice = currentCard?.choices?.find((choice) => choice.id === currentCard.correctChoiceId);
  const isSelectedChoiceCorrect = Boolean(selectedChoiceId && selectedChoiceId === currentCard?.correctChoiceId);

  useEffect(() => {
    if (isWaitingForMoreCards && currentIndex < cards.length - 1) {
      setCurrentIndex((index) => index + 1);
      setIsAnswerVisible(false);
      setSelectedChoiceId(null);
      setIsWaitingForMoreCards(false);
    }
  }, [cards.length, currentIndex, isWaitingForMoreCards]);

  const finishCurrentSession = (reviewedCardIds = reviewedInSession) => {
    if (!deckId) {
      return;
    }

    recordSessionFinished(deckId, reviewedCardIds);
    setIsFinished(true);
    setIsAnswerVisible(false);
    setSelectedChoiceId(null);
    setIsWaitingForMoreCards(false);
  };

  const handleAnswer = (answer: "known" | "again") => {
    if (!deckId || !currentCard) {
      return;
    }

    recordCardReview(deckId, currentCard.id, answer, cards.length);
    celebrateXp(answer === "known" ? 7 : 2, "answer");
    const nextReviewed = [...reviewedInSession, currentCard.id];
    setReviewedInSession(nextReviewed);

    if (currentIndex >= cards.length - 1) {
      if (isDeckGenerating || isDeckPartialError) {
        setIsWaitingForMoreCards(true);
        setIsAnswerVisible(false);
        return;
      }

      finishCurrentSession(nextReviewed);
      return;
    }

    setCurrentIndex((index) => index + 1);
    setIsAnswerVisible(false);
    setSelectedChoiceId(null);
  };

  const handleChoiceSelect = (choiceId: string) => {
    if (!deckId || !currentCard || !isMcqCard || selectedChoiceId || answeredMcqCardIdsRef.current.has(currentCard.id)) {
      return;
    }

    const isCorrect = choiceId === currentCard.correctChoiceId;
    const answer = isCorrect ? "known" : "again";
    answeredMcqCardIdsRef.current.add(currentCard.id);
    recordCardReview(deckId, currentCard.id, answer, cards.length);
    celebrateXp(isCorrect ? 7 : 2, "answer");
    setSelectedChoiceId(choiceId);
    setReviewedInSession((current) => [...current, currentCard.id]);
    void playAnswerSound(isCorrect);
    if (isCorrect) {
      triggerSuccessHaptic();
    } else {
      triggerWarningHaptic();
    }
  };

  const handleMcqNext = () => {
    if (!deckId || !currentCard || !selectedChoiceId) {
      return;
    }

    const nextReviewed = reviewedInSession.includes(currentCard.id)
      ? reviewedInSession
      : [...reviewedInSession, currentCard.id];

    if (currentIndex >= cards.length - 1) {
      if (isDeckGenerating || isDeckPartialError) {
        setIsWaitingForMoreCards(true);
        setSelectedChoiceId(null);
        return;
      }

      finishCurrentSession(nextReviewed);
      return;
    }

    setCurrentIndex((index) => index + 1);
    setSelectedChoiceId(null);
  };

  if (loadState === "loading") {
    return (
      <View className="flex-1 items-center justify-center bg-lingua-background px-6">
        <ActivityIndicator size="large" color="#6C4EF5" />
        <Text selectable className="mt-4 text-center text-[15px] leading-[23px] text-muted">
          Loading review...
        </Text>
      </View>
    );
  }

  if (loadState === "error") {
    return <EmptyState title="Could not load review" body="Something went wrong while reading local review data." />;
  }

  if (loadState === "not-found" || !deck) {
    return <EmptyState title="Deck not found" body="Choose a deck from the Decks tab to start a review." />;
  }

  if (loadState === "empty") {
    return <EmptyState title="Generated cards missing" body="This deck is saved, but its generated flashcards are not available on this device." />;
  }

  if (loadState === "weak-empty") {
    return <EmptyState title="No weak cards yet" body="This deck has no weak cards right now. Start a full review to build more progress." />;
  }

  if (isWaitingForMoreCards) {
    return (
      <ScrollView className="bg-lingua-background" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={contentStyle} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(220)} className="items-center rounded-[30px] bg-lingua-purple p-5" style={styles.cardShadow}>
          <AnimatedOwl
            mood={isDeckPartialError ? "wrong" : "waiting"}
            showMessage
            size={88}
            variant={isDeckPartialError ? "float" : "bounce"}
          />
          <Text selectable className="font-poppins-bold text-[30px] leading-[37px] text-white">
            {isDeckPartialError ? "Some cards could not be generated." : "More cards are being generated..."}
          </Text>
          <Text selectable className="mt-2 text-[15px] leading-[23px] text-[#EAE4FF]">
            {isDeckPartialError
              ? "You can retry from Deck Detail, or finish this session with the cards already available."
              : `${cards.length} cards are ready now${generatedDeck?.expectedCardCount ? ` out of about ${generatedDeck.expectedCardCount}` : ""}. New cards will appear here automatically.`}
          </Text>
        </Animated.View>

        {generatedDeck?.generationLastError ? (
          <View className="rounded-[26px] bg-white p-4" style={styles.cardShadow}>
            <Text selectable className="font-poppins-bold text-[18px] leading-[24px] text-[#C43D32]">
              Generation paused
            </Text>
            <Text selectable className="mt-2 text-[15px] leading-[23px] text-muted">
              {generatedDeck.generationLastError}
            </Text>
          </View>
        ) : null}

        <PressableScale className="items-center justify-center rounded-[26px] bg-lingua-purple px-6 py-4" haptic style={styles.cardShadow} onPress={() => finishCurrentSession()}>
          <Text selectable={false} className="font-poppins-semibold text-[20px] leading-[26px] text-white">
            Finish Current Session
          </Text>
        </PressableScale>

        <PressableScale className="items-center justify-center rounded-[26px] bg-[#F7F4FF] px-6 py-4" haptic onPress={() => router.replace(`/deck/${deck.id}` as never)}>
          <Text selectable={false} className="font-poppins-semibold text-[18px] leading-[24px] text-lingua-purple">
            Back to Deck
          </Text>
        </PressableScale>
      </ScrollView>
    );
  }

  if (isFinished) {
    const latestProgress = useFlashlyProgressStore.getState().deckProgressById[deck.id];
    const knownCount = reviewedInSession.filter((cardId) => latestProgress?.knownCardIds.includes(cardId)).length;
    const againCount = reviewedInSession.length - knownCount;
    const summaryStats = getSummaryStats(deck, deckResponse?.cards ?? cards);
    const xpEarned = knownCount * 7 + againCount * 2;
    const restartReview = () => {
      answeredMcqCardIdsRef.current.clear();
      setCurrentIndex(0);
      setIsAnswerVisible(false);
      setSelectedChoiceId(null);
      setIsFinished(false);
      setReviewedInSession([]);
    };

    return (
      <ScrollView className="bg-lingua-background" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={contentStyle} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(220)} className="rounded-[30px] bg-lingua-purple p-5" style={styles.cardShadow}>
          <View className="mb-3 self-start rounded-full bg-white/15 px-4 py-2">
            <Text selectable className="font-poppins-semibold text-[12px] leading-[16px] text-white">
              Session summary
            </Text>
          </View>
          <Text selectable className="font-poppins-bold text-[32px] leading-[39px] text-white">
            Review complete
          </Text>
          <View className="mt-3 flex-row items-center">
            <AnimatedOwl
              mood={againCount > knownCount ? "idle" : "celebration"}
              size={76}
              variant={againCount > knownCount ? "float" : "celebrate"}
            />
            <Text selectable className="ml-4 flex-1 text-[16px] leading-[25px] text-[#EAE4FF]">
              {reviewedInSession.length} cards reviewed - {knownCount} correct, {againCount} to retry, +{xpEarned} XP.
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(220)} className="flex-row flex-wrap gap-2">
          <SummaryStat color="#FF8A1F" icon={{ android: "award_star", ios: "star.fill" }} label="XP earned" value={String(xpEarned)} />
          <SummaryStat color="#6C4EF5" icon={{ android: "style", ios: "rectangle.stack.fill" }} label="Cards reviewed" value={String(reviewedInSession.length)} />
          <SummaryStat color="#21B36B" icon={{ android: "check_circle", ios: "checkmark.circle.fill" }} label="I knew it" value={String(knownCount)} />
          <SummaryStat color="#FF4D4F" icon={{ android: "target", ios: "target" }} label="Review again" value={String(againCount)} />
        </Animated.View>

        <View className="rounded-[26px] bg-white p-4" style={styles.cardShadow}>
          <Text selectable className="font-poppins-semibold text-[14px] leading-[19px] text-muted">
            Deck completion
          </Text>
          <Text selectable className="mt-1 font-poppins-bold text-[24px] leading-[31px] text-ink">
            {formatPercent(summaryStats.completion)} mastered
          </Text>
          <View className="mt-3 h-3 overflow-hidden rounded-full bg-[#EEF0F8]">
            <View className="h-full rounded-full bg-lingua-purple" style={{ width: `${summaryStats.completion * 100}%` }} />
          </View>
          <Text selectable className="mt-3 text-[14px] leading-[21px] text-muted">
            {summaryStats.weakCardCount > 0
              ? `${summaryStats.weakCardCount} weak cards are ready for another pass.`
              : "No weak cards from this session. Keep the streak moving."}
          </Text>
        </View>

        <PressableScale className="items-center justify-center rounded-[26px] bg-lingua-purple px-6 py-4" haptic style={styles.cardShadow} onPress={() => router.replace(`/deck/${deck.id}` as never)}>
          <Text selectable={false} className="font-poppins-semibold text-[20px] leading-[26px] text-white">
            Back to Deck
          </Text>
        </PressableScale>

        <PressableScale className="items-center justify-center rounded-[26px] bg-[#F7F4FF] px-6 py-4" haptic onPress={restartReview}>
          <Text selectable={false} className="font-poppins-semibold text-[18px] leading-[24px] text-lingua-purple">
            Review Again
          </Text>
        </PressableScale>

      </ScrollView>
    );
  }

  return (
    <ScrollView className="bg-lingua-background" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={contentStyle} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeInDown.duration(220)} className="flex-row items-center">
        <PressableScale
          className="h-12 w-12 items-center justify-center rounded-full bg-white"
          haptic
          style={styles.cardShadow}
          onPress={() => safeBack(`/deck/${deck.id}` as never)}
        >
          <Text selectable={false} className="font-poppins-semibold text-[30px] leading-[32px] text-ink">
            {"<"}
          </Text>
        </PressableScale>
        <View className="ml-4 flex-1">
          <Text selectable className="text-[13px] leading-[18px] text-muted">
            {mode === "weak" ? "Weak-card practice" : "Active recall"}
          </Text>
          <Text selectable className="font-poppins-bold text-[24px] leading-[31px] text-ink">
            {deck.title}
          </Text>
        </View>
        <View className="rounded-full bg-[#F7F4FF] px-4 py-2">
          <Text selectable className="font-poppins-bold text-[15px] leading-[20px] text-lingua-purple" style={{ fontVariant: ["tabular-nums"] }}>
            Card {currentIndex + 1} of {cards.length}
          </Text>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(70).duration(220)} className="rounded-[22px] bg-white p-3" style={styles.cardShadow}>
        <View className="flex-row items-center justify-between">
          <Text selectable className="font-poppins-semibold text-[13px] leading-[18px] text-muted">
            Session progress
          </Text>
          <Text selectable className="font-poppins-bold text-[13px] leading-[18px] text-lingua-purple">
            {formatPercent(progressValue)}
          </Text>
        </View>
        <View className="mt-2 h-3 overflow-hidden rounded-full bg-[#E8E1FF]">
          <View className="h-full rounded-full bg-lingua-purple" style={{ width: `${progressValue * 100}%` }} />
        </View>
      </Animated.View>

      <Animated.View key={currentCard.id} entering={SlideInRight.duration(220)} exiting={FadeOut.duration(120)}>
      <Pressable
        className="min-h-[340px] justify-between rounded-[30px] border border-[#F0ECFA] bg-white p-5"
        disabled={isMcqCard}
        style={styles.cardShadow}
        onPress={() => setIsAnswerVisible(true)}
      >
        <View>
          <View className="flex-row items-center justify-between">
            <View className="self-start rounded-full bg-[#F7F4FF] px-4 py-2">
              <Text selectable className="font-poppins-semibold text-[12px] leading-[16px] text-lingua-purple">
                {isMcqCard ? "MCQ" : currentCard.topic}
              </Text>
            </View>
            <View className="h-11 w-11 items-center justify-center rounded-full bg-[#F7F4FF]">
              <ReviewIcon
                color="#6C4EF5"
                fallback={isMcqCard ? "Q" : "A"}
                name={isMcqCard ? { android: "quiz", ios: "questionmark.circle.fill" } : { android: "style", ios: "rectangle.stack.fill" }}
              />
            </View>
          </View>
          <Text selectable className="mt-5 font-poppins-bold text-[25px] leading-[33px] text-ink">
            {currentCard.question}
          </Text>
        </View>

        {isMcqCard ? (
          <View className="mt-5 gap-2">
            {currentCard.choices?.map((choice) => {
              const isSelected = selectedChoiceId === choice.id;
              const isCorrect = currentCard.correctChoiceId === choice.id;
              const shouldShowCorrect = Boolean(selectedChoiceId && isCorrect);
              const shouldShowWrong = Boolean(selectedChoiceId && isSelected && !isCorrect);
              const hasFeedback = shouldShowCorrect || shouldShowWrong;
              const backgroundColor = shouldShowCorrect ? "#EAFBF2" : shouldShowWrong ? "#FFF0F0" : "#F8F9FD";
              const borderColor = shouldShowCorrect ? "#21C16B" : shouldShowWrong ? "#FF4D4F" : "#ECEEF5";
              const textColor = shouldShowCorrect ? "#158A4B" : shouldShowWrong ? "#C43D32" : "#20233A";
              const badgeBackgroundColor = shouldShowCorrect ? "#21C16B" : "#FF4D4F";
              const feedbackLabel = shouldShowCorrect ? "Correct answer" : shouldShowWrong ? "Wrong answer" : null;
              const feedbackIcon = shouldShowCorrect ? "\u2713" : "\u00D7";

              return (
                <PressableScale
                  key={choice.id}
                  className="rounded-[20px] border px-4 py-3"
                  disabled={Boolean(selectedChoiceId)}
                  haptic={!selectedChoiceId}
                  style={{
                    backgroundColor,
                    borderColor,
                    borderWidth: hasFeedback ? 2 : 1,
                    boxShadow: hasFeedback ? `0 0 0 3px ${shouldShowCorrect ? "rgba(33, 193, 107, 0.12)" : "rgba(255, 77, 79, 0.12)"}` : undefined,
                  }}
                  onPress={() => handleChoiceSelect(choice.id)}
                >
                  <View className="flex-row items-start gap-3">
                    <View className="h-8 w-8 items-center justify-center rounded-full bg-white">
                      <Text selectable={false} className="font-poppins-bold text-[14px] leading-[18px]" style={{ color: textColor }}>
                        {choice.label}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text selectable className="font-poppins-semibold text-[16px] leading-[23px]" style={{ color: textColor }}>
                        {choice.text}
                      </Text>
                      {feedbackLabel ? (
                        <Text selectable className="mt-2 font-poppins-semibold text-[13px] leading-[18px]" style={{ color: textColor }}>
                          {feedbackLabel}
                        </Text>
                      ) : null}
                    </View>
                    {hasFeedback ? (
                      <View className="h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: badgeBackgroundColor }}>
                        <Text selectable={false} className="font-poppins-bold text-[17px] leading-[20px] text-white">
                          {feedbackIcon}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </PressableScale>
              );
            })}

            {selectedChoiceId ? (
              <View className="rounded-[22px] bg-[#F8F9FD] p-4">
                <Text selectable className={`font-poppins-bold text-[18px] leading-[24px] ${isSelectedChoiceCorrect ? "text-[#158A4B]" : "text-[#C43D32]"}`}>
                  {isSelectedChoiceCorrect ? "Correct - +7 XP" : "Not quite - +2 XP"}
                </Text>
                <View className="mt-3 flex-row items-center rounded-[22px] bg-white px-4 py-3">
                  <AnimatedOwl mood={isSelectedChoiceCorrect ? "correct" : "wrong"} size={42} variant={isSelectedChoiceCorrect ? "celebrate" : "float"} />
                  <Text selectable className="ml-3 flex-1 font-poppins-semibold text-[14px] leading-[20px] text-muted">
                    {isSelectedChoiceCorrect ? "Great job!" : "Almost there."}
                  </Text>
                </View>
                {!isSelectedChoiceCorrect ? (
                  <Text selectable className="mt-2 text-[15px] leading-[23px] text-muted">
                    No worries - this is how you learn.
                  </Text>
                ) : null}
                {!isSelectedChoiceCorrect && correctChoice ? (
                  <Text selectable className="mt-2 text-[15px] leading-[23px] text-ink">
                    Correct answer: {correctChoice.label}. {correctChoice.text}
                  </Text>
                ) : null}
                {currentCard.explanation ? (
                  <Text selectable className="mt-3 text-[15px] leading-[23px] text-muted">
                    {currentCard.explanation}
                  </Text>
                ) : null}
                {selectedChoice ? (
                  <Text selectable className="mt-3 text-[14px] leading-[21px] text-muted">
                    Your answer: {selectedChoice.label}. {selectedChoice.text}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text selectable={false} className="text-center font-poppins-semibold text-[16px] leading-[22px] text-muted">
                Choose one answer
              </Text>
            )}
          </View>
        ) : isAnswerVisible ? (
          <View className="rounded-[24px] bg-[#F8F9FD] p-4">
            <Text selectable className="font-poppins-semibold text-[14px] leading-[19px] text-muted">
              Answer
            </Text>
            <Text selectable className="mt-2 font-poppins-bold text-[22px] leading-[29px] text-ink">
              {currentCard.answer}
            </Text>
            {currentCard.explanation ? (
              <Text selectable className="mt-3 text-[15px] leading-[23px] text-muted">
                {currentCard.explanation}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text selectable={false} className="text-center font-poppins-semibold text-[16px] leading-[22px] text-muted">
            Tap card to reveal answer
          </Text>
        )}
      </Pressable>
      </Animated.View>

      {isMcqCard ? (
        <PressableScale className={`items-center justify-center rounded-[26px] px-6 py-4 ${selectedChoiceId ? "bg-lingua-purple" : "bg-[#F2F3F8]"}`} disabled={!selectedChoiceId} haptic={Boolean(selectedChoiceId)} onPress={handleMcqNext}>
          <Text selectable={false} className={`font-poppins-semibold text-[20px] leading-[26px] ${selectedChoiceId ? "text-white" : "text-muted"}`}>
            {currentIndex >= cards.length - 1 ? "Finish Review" : "Next"}
          </Text>
        </PressableScale>
      ) : (
        <View className="flex-row gap-3">
          <PressableScale className={`flex-1 items-center justify-center rounded-[24px] px-5 py-4 ${isAnswerVisible ? "bg-[#FFF0F0]" : "bg-[#F2F3F8]"}`} disabled={!isAnswerVisible} haptic={isAnswerVisible} onPress={() => handleAnswer("again")}>
            <Text selectable={false} className={`font-poppins-semibold text-[17px] leading-[23px] ${isAnswerVisible ? "text-[#FF4D4F]" : "text-muted"}`}>
              Review again
            </Text>
          </PressableScale>
          <PressableScale className={`flex-1 items-center justify-center rounded-[24px] px-5 py-4 ${isAnswerVisible ? "bg-lingua-purple" : "bg-[#F2F3F8]"}`} disabled={!isAnswerVisible} haptic={isAnswerVisible} onPress={() => handleAnswer("known")}>
            <Text selectable={false} className={`font-poppins-semibold text-[17px] leading-[23px] ${isAnswerVisible ? "text-white" : "text-muted"}`}>
              I knew it
            </Text>
          </PressableScale>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cardShadow: {
    boxShadow: "0 8px 18px rgba(16, 24, 64, 0.06)",
  },
  contentContainer: {
    gap: 16,
    paddingBottom: 130,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  symbolOverlay: {
    height: 24,
    position: "absolute",
    width: 24,
  },
});
