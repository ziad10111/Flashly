import type {
  DeckStatusDTO,
  ExtractionStageDTO,
  AssistantMessageRoleDTO,
  FlashcardGenerationStageDTO,
  FlashcardGenerationStatusDTO,
  FlashcardDifficultyDTO,
  IdempotencyKey,
  ISODateTimeString,
  OCRStatusDTO,
  ResourceId,
  ReviewModeDTO,
  UploadStageDTO,
  UploadStatusDTO,
} from "@/api/contracts";

export type SchemaId = ResourceId;

export type SchemaTimestamp = ISODateTimeString;

export type SourceFileType = "pdf" | "image" | "text" | "document" | "unknown";

export type JsonPrimitive = string | number | boolean | null;

export type JsonRecord = {
  [key: string]: JsonPrimitive | JsonPrimitive[] | JsonRecord | JsonRecord[];
};

export type TimestampedRow = {
  createdAt: SchemaTimestamp;
  updatedAt: SchemaTimestamp;
};

export type UserOwnedRow = {
  userId: SchemaId;
};

export type IdempotentRow = {
  idempotencyKey: IdempotencyKey;
};

export type {
  DeckStatusDTO,
  ExtractionStageDTO,
  AssistantMessageRoleDTO,
  FlashcardDifficultyDTO,
  FlashcardGenerationStageDTO,
  FlashcardGenerationStatusDTO,
  IdempotencyKey,
  OCRStatusDTO,
  ReviewModeDTO,
  UploadStageDTO,
  UploadStatusDTO,
};
