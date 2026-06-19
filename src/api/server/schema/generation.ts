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
    difficulty?: FlashcardDifficultyDTO;
    topicFocus?: string[];
    options?: JsonRecord;
    errorCode?: string;
    errorMessage?: string;
  };
