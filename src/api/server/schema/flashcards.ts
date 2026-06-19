import type { FlashcardDifficultyDTO, SchemaId, TimestampedRow, UserOwnedRow } from "./common";

export type FlashcardRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    deckId: SchemaId;
    materialId?: SchemaId;
    sourceChunkId?: SchemaId;
    question: string;
    answer: string;
    explanation?: string;
    difficulty: FlashcardDifficultyDTO;
    topic?: string;
    sourcePage?: number;
    sourceSection?: string;
    position: number;
  };
