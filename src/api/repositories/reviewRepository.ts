import { apiRequest } from "@/api/client";
import { getDeckById } from "./deckRepository";
import { useFlashlyProgressStore } from "@/store/useFlashlyProgressStore";
import type { CardReviewStateDTO, CreateReviewSessionRequest, CreateReviewSessionResponse } from "../contracts";
import { withBackendFallback } from "./backendSwitch";

// Local/mock repository. Replace internals with backend review/progress calls later.
// Do not add secrets, AI calls, OCR logic, or file parsing here.

const createLocalReviewSession = async (
  request: CreateReviewSessionRequest,
): Promise<CreateReviewSessionResponse> => {
  const progressState = useFlashlyProgressStore.getState();
  const deckResponse = await getDeckById(request.deckId);

  if (!deckResponse) {
    return {
      sessionId: `local-review-session-${request.idempotencyKey}`,
      deckId: request.deckId,
      mode: request.mode,
      cardsReviewed: 0,
      reviewedCardIds: [],
      knownCount: 0,
      unknownCount: 0,
      xpEarned: 0,
      totalXp: progressState.totalXp,
      dailyStreak: progressState.dailyStreak,
      deckCompletionPercentage: 0,
      completedDeck: false,
      weakCardCount: 0,
      weakCardIds: [],
      cardStates: [],
      startedAt: request.startedAt,
      completedAt: request.completedAt,
      retryable: false,
    };
  }

  const cardIds = new Set(deckResponse.cards.map((card) => card.id));
  const validReviews = request.reviews.filter((review) => cardIds.has(review.cardId));
  const validKnownCount = validReviews.filter((review) => review.answer === "known").length;
  const unknownCount = validReviews.length - validKnownCount;
  const xpEarned = validKnownCount * 7 + unknownCount * 2;
  const deckProgress = progressState.deckProgressById[request.deckId];
  const reviewedIds = new Set(deckProgress?.reviewedCardIds ?? []);
  const weakIds = new Set(deckProgress?.weakCardIds ?? []);

  const cardStates: CardReviewStateDTO[] =
    deckResponse.cards.map((card) => ({
      cardId: card.id,
      deckId: request.deckId,
      reviewCount: reviewedIds.has(card.id) ? 1 : 0,
      knownCount: deckProgress?.knownCardIds.includes(card.id) ? 1 : 0,
      unknownCount: deckProgress?.unknownCardIds.includes(card.id) ? 1 : 0,
      isWeak: weakIds.has(card.id),
      lastReviewedAt: deckProgress?.lastReviewedDate ?? undefined,
    }));

  return {
    sessionId: `local-review-session-${request.idempotencyKey}`,
    deckId: request.deckId,
    mode: request.mode,
    cardsReviewed: validReviews.length,
    reviewedCardIds: validReviews.map((review) => review.cardId),
    knownCount: validKnownCount,
    unknownCount,
    xpEarned,
    totalXp: progressState.totalXp,
    dailyStreak: progressState.dailyStreak,
    deckCompletionPercentage: deckResponse.deck.completionPercentage,
    completedDeck: deckResponse.deck.completionPercentage >= 100,
    weakCardCount: weakIds.size,
    weakCardIds: Array.from(weakIds),
    cardStates,
    startedAt: request.startedAt,
    completedAt: request.completedAt,
    retryable: false,
  };
};

export const createReviewSession = async (
  request: CreateReviewSessionRequest,
): Promise<CreateReviewSessionResponse> =>
  withBackendFallback({
    backend: () =>
      apiRequest<CreateReviewSessionResponse, CreateReviewSessionRequest>("/api/review-sessions", {
        method: "POST",
        body: request,
      }),
    fallback: () => createLocalReviewSession(request),
    label: "createReviewSession",
  });
