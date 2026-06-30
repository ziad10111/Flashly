import type {
  FlashcardDifficultyDTO,
  FlashcardGenerationStageDTO,
  FlashcardGenerationStatusDTO,
  IdempotentRow,
  JsonRecord,
  SchemaId,
  TimestampedRow,
  UserOwnedRow,
} from "./common";

export type FlashcardGenerationJobRow = TimestampedRow &
  UserOwnedRow &
  IdempotentRow & {
    id: SchemaId;
    materialId: SchemaId;
    deckId?: SchemaId;
    status: FlashcardGenerationStatusDTO;
    stage: FlashcardGenerationStageDTO;
    requestedCardCount: number;
    generatedCardCount: number;
    expectedCardCount?: number;
    totalBatchCount: number;
    completedBatchCount: number;
    failedBatchCount: number;
    retryCount: number;
    difficulty?: FlashcardDifficultyDTO;
    topicFocus?: string[];
    options?: JsonRecord;
    errorCode?: string;
    errorMessage?: string;
    lastErrorCode?: string;
    lastErrorMessage?: string;
    startedAt?: Date | string;
    completedAt?: Date | string;
    cancelledAt?: Date | string;
  };
