import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { deckMaterials } from "@/data/deckMaterials";
import { getReviewCardsForDeck } from "@/data/reviewFlashcards";

export type ReviewAnswer = "known" | "again";

export type DeckProgress = {
  completedAt: string | null;
  knownCardIds: string[];
  lastReviewedDate: string | null;
  reviewedCardIds: string[];
  sessionCount: number;
  unknownCardIds: string[];
  weakCardIds: string[];
  xpEarned: number;
};

export type ReviewSessionRecord = {
  id: string;
  deckId: string;
  reviewedCardIds: string[];
  knownCount: number;
  unknownCount: number;
  xpEarned: number;
  completedAt: string;
};

export type DailyReviewProgress = {
  date: string;
  reviewedCardIds: string[];
  reviewedCount: number;
};

type FlashlyProgressState = {
  completedDeckIds: string[];
  dailyReviewProgress: DailyReviewProgress;
  dailyStreak: number;
  deletedDeckIds: string[];
  deckProgressById: Record<string, DeckProgress>;
  lastCelebratedStreak: number;
  lastActivityDate: string | null;
  pendingStreakCelebration: number | null;
  reviewSessionHistory: ReviewSessionRecord[];
  totalXp: number;
  deleteDeckProgress: (deckId: string, options?: { hideDeck?: boolean }) => void;
  markStreakCelebrated: (streak: number) => void;
  recordCardReview: (deckId: string, cardId: string, answer: ReviewAnswer, totalCards: number) => void;
  recordSessionFinished: (deckId: string, reviewedCardIds: string[]) => void;
  refreshDailyReviewProgress: () => void;
  resetProgress: () => void;
};

const toLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const todayKey = () => toLocalDateKey();
const isoNow = () => new Date().toISOString();

const unique = (values: string[]) => Array.from(new Set(values));

const without = (values: string[], value: string) => values.filter((item) => item !== value);

const getInitialDeckProgress = (): Record<string, DeckProgress> =>
  Object.fromEntries(
    deckMaterials.map((deck) => {
      const cards = getReviewCardsForDeck(deck.id);
      const seededReviewedCount =
        deck.status === "completed" ? cards.length : Math.min(Math.round(cards.length * deck.progress), cards.length);
      const seededWeakCount = Math.min(deck.weakCardCount, Math.max(cards.length - seededReviewedCount, 0));
      const reviewedCardIds = cards.slice(0, seededReviewedCount).map((card) => card.id);
      const weakCardIds = cards.slice(seededReviewedCount, seededReviewedCount + seededWeakCount).map((card) => card.id);

      return [
        deck.id,
        {
          completedAt: deck.status === "completed" ? "2026-05-30T09:00:00.000Z" : null,
          knownCardIds: reviewedCardIds.filter((cardId) => !weakCardIds.includes(cardId)),
          lastReviewedDate: deck.lastReviewedDate,
          reviewedCardIds,
          sessionCount: deck.reviewedCount > 0 ? 1 : 0,
          unknownCardIds: weakCardIds,
          weakCardIds,
          xpEarned: deck.xpEarned,
        },
      ];
    }),
  );

const initialDeckProgress = getInitialDeckProgress();
const initialTotalXp = Object.values(initialDeckProgress).reduce((sum, deck) => sum + deck.xpEarned, 0);

const getStreakForActivity = (previousDate: string | null) => {
  const today = todayKey();

  if (!previousDate) {
    return 1;
  }

  if (previousDate === today) {
    return null;
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return previousDate === yesterday.toISOString().slice(0, 10) ? "increment" : 1;
};

const createEmptyDeckProgress = (): DeckProgress => ({
  completedAt: null,
  knownCardIds: [],
  lastReviewedDate: null,
  reviewedCardIds: [],
  sessionCount: 0,
  unknownCardIds: [],
  weakCardIds: [],
  xpEarned: 0,
});

const createEmptyDailyReviewProgress = (date = todayKey()): DailyReviewProgress => ({
  date,
  reviewedCardIds: [],
  reviewedCount: 0,
});

const getDailyReviewProgressForToday = (progress: DailyReviewProgress | undefined) => {
  const today = todayKey();

  if (!progress || progress.date !== today) {
    return createEmptyDailyReviewProgress(today);
  }

  const reviewedCardIds = unique(progress.reviewedCardIds);

  return {
    date: today,
    reviewedCardIds,
    reviewedCount: reviewedCardIds.length,
  };
};

const streakMilestones = [3, 5, 7, 10, 30, 50, 100];

export const useFlashlyProgressStore = create<FlashlyProgressState>()(
  persist(
    (set) => ({
      completedDeckIds: Object.entries(initialDeckProgress)
        .filter(([, progress]) => progress.completedAt)
        .map(([deckId]) => deckId),
      dailyReviewProgress: createEmptyDailyReviewProgress(),
      dailyStreak: 5,
      deletedDeckIds: [],
      deckProgressById: initialDeckProgress,
      lastCelebratedStreak: 0,
      lastActivityDate: "2026-05-30",
      pendingStreakCelebration: null,
      reviewSessionHistory: [],
      totalXp: initialTotalXp,
      deleteDeckProgress: (deckId, options) =>
        set((state) => {
          const nextDeckProgressById = { ...state.deckProgressById };
          const removedProgress = nextDeckProgressById[deckId];
          delete nextDeckProgressById[deckId];
          const hideDeck = options?.hideDeck ?? true;

          return {
            completedDeckIds: state.completedDeckIds.filter((id) => id !== deckId),
            deletedDeckIds: hideDeck ? unique([...state.deletedDeckIds, deckId]) : state.deletedDeckIds.filter((id) => id !== deckId),
            deckProgressById: nextDeckProgressById,
            reviewSessionHistory: state.reviewSessionHistory.filter((session) => session.deckId !== deckId),
            totalXp: Math.max(0, state.totalXp - (removedProgress?.xpEarned ?? 0)),
          };
        }),
      markStreakCelebrated: (streak) =>
        set((state) => ({
          lastCelebratedStreak: Math.max(state.lastCelebratedStreak, streak),
          pendingStreakCelebration:
            state.pendingStreakCelebration === streak ? null : state.pendingStreakCelebration,
        })),
      recordCardReview: (deckId, cardId, answer, totalCards) =>
        set((state) => {
          const current = state.deckProgressById[deckId] ?? createEmptyDeckProgress();
          const wasReviewed = current.reviewedCardIds.includes(cardId);
          const dailyReviewProgress = getDailyReviewProgressForToday(state.dailyReviewProgress);
          const dailyReviewCardId = `${deckId}:${cardId}`;
          const nextDailyReviewedCardIds = dailyReviewProgress.reviewedCardIds.includes(dailyReviewCardId)
            ? dailyReviewProgress.reviewedCardIds
            : [...dailyReviewProgress.reviewedCardIds, dailyReviewCardId];
          const xpEarned = answer === "known" ? 7 : 2;
          const reviewedCardIds = unique([...current.reviewedCardIds, cardId]);
          const knownCardIds =
            answer === "known" ? unique([...current.knownCardIds, cardId]) : without(current.knownCardIds, cardId);
          const unknownCardIds =
            answer === "again" ? unique([...current.unknownCardIds, cardId]) : without(current.unknownCardIds, cardId);
          const weakCardIds =
            answer === "again" ? unique([...current.weakCardIds, cardId]) : without(current.weakCardIds, cardId);
          const completedAt = reviewedCardIds.length >= totalCards ? (current.completedAt ?? isoNow()) : current.completedAt;
          const completedDeckIds = completedAt ? unique([...state.completedDeckIds, deckId]) : state.completedDeckIds;
          const streakUpdate = getStreakForActivity(state.lastActivityDate);
          const dailyStreak =
            streakUpdate === null ? state.dailyStreak : streakUpdate === "increment" ? state.dailyStreak + 1 : streakUpdate;
          const shouldCelebrateStreak =
            streakUpdate !== null &&
            dailyStreak > state.lastCelebratedStreak &&
            streakMilestones.includes(dailyStreak);

          return {
            completedDeckIds,
            dailyReviewProgress: {
              date: dailyReviewProgress.date,
              reviewedCardIds: nextDailyReviewedCardIds,
              reviewedCount: nextDailyReviewedCardIds.length,
            },
            dailyStreak,
            deckProgressById: {
              ...state.deckProgressById,
              [deckId]: {
                ...current,
                completedAt,
                knownCardIds,
                lastReviewedDate: todayKey(),
                reviewedCardIds,
                unknownCardIds,
                weakCardIds,
                xpEarned: current.xpEarned + xpEarned,
              },
            },
            lastActivityDate: todayKey(),
            pendingStreakCelebration: shouldCelebrateStreak ? dailyStreak : state.pendingStreakCelebration,
            totalXp: state.totalXp + (wasReviewed ? Math.max(1, xpEarned - 2) : xpEarned),
          };
        }),
      recordSessionFinished: (deckId, reviewedCardIds) =>
        set((state) => {
          const current = state.deckProgressById[deckId] ?? createEmptyDeckProgress();
          const sessionKnownCount = reviewedCardIds.filter((cardId) => current.knownCardIds.includes(cardId)).length;
          const sessionUnknownCount = reviewedCardIds.filter((cardId) => current.unknownCardIds.includes(cardId)).length;
          const sessionXp = sessionKnownCount * 7 + sessionUnknownCount * 2;
          const completedAt = isoNow();

          return {
            deckProgressById: {
              ...state.deckProgressById,
              [deckId]: {
                ...current,
                sessionCount: current.sessionCount + 1,
              },
            },
            reviewSessionHistory: [
              {
                id: `session-${deckId}-${completedAt}`,
                deckId,
                reviewedCardIds,
                knownCount: sessionKnownCount,
                unknownCount: sessionUnknownCount,
                xpEarned: sessionXp,
                completedAt,
              },
              ...state.reviewSessionHistory,
            ].slice(0, 25),
          };
        }),
      refreshDailyReviewProgress: () =>
        set((state) => ({
          dailyReviewProgress: getDailyReviewProgressForToday(state.dailyReviewProgress),
        })),
      resetProgress: () =>
        set({
          completedDeckIds: [],
          dailyReviewProgress: createEmptyDailyReviewProgress(),
          dailyStreak: 0,
          deletedDeckIds: [],
          deckProgressById: {},
          lastCelebratedStreak: 0,
          lastActivityDate: null,
          pendingStreakCelebration: null,
          reviewSessionHistory: [],
          totalXp: 0,
        }),
    }),
    {
      name: "flashly-progress-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export const getTodayReviewedCount = (progress: DailyReviewProgress | undefined) =>
  getDailyReviewProgressForToday(progress).reviewedCount;

export const getDeckCompletion = (progress: DeckProgress | undefined, totalCards: number) => {
  if (!progress || totalCards <= 0) {
    return 0;
  }

  return Math.min(progress.reviewedCardIds.length / totalCards, 1);
};
