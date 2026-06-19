export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "validation-error"
  | "unsupported-media"
  | "conflict"
  | "not-ready"
  | "processing-failed"
  | "rate-limited"
  | "internal"
  | "unknown";

export type ApiErrorDTO = {
  code: ApiErrorCode;
  message: string;
  retryable?: boolean;
};

export type ISODateTimeString = string;

export type ResourceId = string;

export type IdempotencyKey = string;

export type UploadStatusDTO = "idle" | "queued" | "uploading" | "processing" | "ready" | "failed";

export type UploadStageDTO =
  | "uploading"
  | "assembling"
  | "extracting"
  | "ocr"
  | "ocr-skipped"
  | "generating-flashcards"
  | "creating-deck"
  | "ready";

export type OCRStatusDTO = "not-needed" | "queued" | "running" | "complete" | "failed";

export type ExtractionStageDTO =
  | "not-started"
  | "extracting-text"
  | "ocr"
  | "cleaning-text"
  | "complete"
  | "failed";

export type DeckStatusDTO =
  | "new"
  | "processing"
  | "ready"
  | "generating"
  | "in-progress"
  | "partial-error"
  | "completed"
  | "needs-review";

export type FlashcardDifficultyDTO = "easy" | "medium" | "hard";

export type FlashcardGenerationStatusDTO = "queued" | "generating" | "validating" | "complete" | "partial" | "failed";

export type FlashcardGenerationStageDTO =
  | "queued"
  | "reading-extracted-text"
  | "generating-cards"
  | "validating-schema"
  | "creating-deck"
  | "complete"
  | "failed";

export type ReviewModeDTO = "full-deck" | "weak-cards" | "quick-review";

export type AssistantMessageRoleDTO = "user" | "assistant";
