import type { ApiErrorDTO, ReviewModeDTO } from "./common";

export type CardReviewAnswerDTO = "known" | "again";

export type CardReviewInputDTO = {
  cardId: string;
  answer: CardReviewAnswerDTO;
  answeredAt: string;
};

export type CreateReviewSessionRequest = {
  deckId: string;
  mode: ReviewModeDTO;
  reviews: CardReviewInputDTO[];
  startedAt: string;
  completedAt: string;
  idempotencyKey: string;
};

export type CardReviewStateDTO = {
  cardId: string;
  deckId: string;
  reviewCount: number;
  knownCount: number;
  unknownCount: number;
  isWeak: boolean;
  lastReviewedAt?: string;
  nextReviewAt?: string;
};

export type CreateReviewSessionResponse = {
  sessionId: string;
  deckId: string;
  mode: ReviewModeDTO;
  cardsReviewed: number;
  reviewedCardIds: string[];
  knownCount: number;
  unknownCount: number;
  xpEarned: number;
  totalXp: number;
  dailyStreak: number;
  deckCompletionPercentage: number;
  completedDeck: boolean;
  weakCardCount: number;
  weakCardIds: string[];
  cardStates: CardReviewStateDTO[];
  startedAt: string;
  completedAt: string;
  retryable: boolean;
  error?: ApiErrorDTO;
};

export type ProgressResponse = {
  totalXp: number;
  dailyStreak: number;
  lastActivityDate: string | null;
  lastReviewedAt?: string;
  completedDeckIds: string[];
  reviewedCardCount: number;
  weakCardCount: number;
  weakCardIds: string[];
  generatedDeckCount: number;
};
