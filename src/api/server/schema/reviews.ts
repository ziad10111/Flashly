import type { IdempotentRow, ReviewModeDTO, SchemaId, TimestampedRow, UserOwnedRow } from "./common";

export type CardReviewAnswerValue = "known" | "again";

export type ReviewSessionRow = TimestampedRow &
  UserOwnedRow &
  IdempotentRow & {
    id: SchemaId;
    deckId: SchemaId;
    mode: ReviewModeDTO;
    cardsReviewed: number;
    knownCount: number;
    unknownCount: number;
    xpEarned: number;
    startedAt: string;
    completedAt: string;
  };

export type ReviewAnswerRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    sessionId: SchemaId;
    deckId: SchemaId;
    cardId: SchemaId;
    answer: CardReviewAnswerValue;
    answeredAt: string;
  };
