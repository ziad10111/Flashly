import type { SchemaId, TimestampedRow, UserOwnedRow } from "./common";

export type CardReviewStateRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    cardId: SchemaId;
    deckId: SchemaId;
    reviewCount: number;
    knownCount: number;
    unknownCount: number;
    isWeak: boolean;
    lastReviewedAt?: string;
    nextReviewAt?: string;
  };

export type DeckProgressRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    deckId: SchemaId;
    reviewedCardCount: number;
    weakCardCount: number;
    xpEarned: number;
    completionPercentage: number;
    completedAt?: string;
    lastReviewedAt?: string;
  };

export type UserProgressRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    totalXp: number;
    dailyStreak: number;
    lastActivityDate: string | null;
    lastReviewedAt?: string;
    completedDeckCount: number;
    reviewedCardCount: number;
    weakCardCount: number;
    generatedDeckCount: number;
  };
