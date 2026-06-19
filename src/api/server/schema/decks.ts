import type { DeckStatusDTO, SchemaId, SourceFileType, TimestampedRow, UserOwnedRow } from "./common";

export type DeckRow = TimestampedRow &
  UserOwnedRow & {
    id: SchemaId;
    materialId?: SchemaId;
    title: string;
    description?: string;
    sourceFileName: string;
    sourceType: SourceFileType;
    status: DeckStatusDTO;
    cardCount: number;
    generationJobId?: SchemaId;
    lastReviewedAt?: string;
  };

// DeckDTO includes progress fields such as reviewedCount, weakCardCount, xpEarned,
// and completionPercentage. Those should be mapped from DeckRow plus progress rows.
