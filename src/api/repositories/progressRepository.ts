import { apiRequest } from "@/api/client";
import { getAllDecks, getDeckCards, getDeckStats } from "@/lib/deck-utils";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";
import { useFlashlyUploadStore } from "@/store/useFlashlyUploadStore";
import type { ProgressResponse } from "../contracts";
import { withBackendFallback } from "./backendSwitch";

// Local/mock repository. Replace internals with backend progress endpoints later.
// Do not add secrets, AI calls, OCR logic, or file parsing here.

const getLocalProgressSummary = async (): Promise<ProgressResponse> => {
  const progressState = useFlashlyProgressStore.getState();
  const uploadState = useFlashlyUploadStore.getState();
  const deletedDeckIds = new Set(progressState.deletedDeckIds);
  const visibleGeneratedDecks = uploadState.generatedDecks.filter((deck) => !deletedDeckIds.has(deck.id));
  const allStats = getAllDecks(visibleGeneratedDecks)
    .filter((deck) => !deletedDeckIds.has(deck.id))
    .map((deck) =>
      getDeckStats(deck, getDeckCards(deck.id, uploadState.generatedCardsByDeckId), progressState.deckProgressById[deck.id]),
    );

  return {
    totalXp: progressState.totalXp,
    dailyStreak: progressState.dailyStreak,
    lastActivityDate: progressState.lastActivityDate,
    lastReviewedAt: progressState.reviewSessionHistory[0]?.completedAt,
    completedDeckIds: progressState.completedDeckIds.filter((deckId) => !deletedDeckIds.has(deckId)),
    reviewedCardCount: allStats.reduce((sum, stats) => sum + stats.reviewedCount, 0),
    weakCardCount: allStats.reduce((sum, stats) => sum + stats.weakCardCount, 0),
    weakCardIds: Object.entries(progressState.deckProgressById)
      .filter(([deckId]) => !deletedDeckIds.has(deckId))
      .flatMap(([, progress]) => progress.weakCardIds),
    generatedDeckCount: visibleGeneratedDecks.length,
  };
};

const getBackendProgressSummary = async (): Promise<ProgressResponse> => {
  const backendProgress = await apiRequest<ProgressResponse>("/api/progress");
  const deletedDeckIds = new Set(useFlashlyProgressStore.getState().deletedDeckIds);
  const generatedDeckCount = useFlashlyUploadStore.getState().generatedDecks.filter((deck) => !deletedDeckIds.has(deck.id)).length;

  return {
    ...backendProgress,
    completedDeckIds: backendProgress.completedDeckIds.filter((deckId) => !deletedDeckIds.has(deckId)),
    generatedDeckCount: Math.max(backendProgress.generatedDeckCount, generatedDeckCount),
  };
};

export const getProgressSummary = async (): Promise<ProgressResponse> =>
  withBackendFallback({
    backend: getBackendProgressSummary,
    fallback: getLocalProgressSummary,
    label: "getProgressSummary",
  });
