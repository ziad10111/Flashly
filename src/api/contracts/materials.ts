import type {
  ApiErrorDTO,
  ExtractionStageDTO,
  FlashcardDifficultyDTO,
  FlashcardGenerationStageDTO,
  FlashcardGenerationStatusDTO,
  OCRStatusDTO,
} from "./common";
import type { DeckDTO, FlashcardDTO } from "./decks";

export const MAX_SOURCE_TEXT_INPUT_LENGTH = 12_000;
export const MIN_SOURCE_TEXT_INPUT_LENGTH = 40;
export const MAX_SOURCE_PDF_INPUT_BYTES = 4 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_INPUT_BYTES = 3 * 1024 * 1024;

export type StudyMaterialDTO = {
  id: string;
  userId?: string;
  fileName: string;
  fileType: "pdf" | "image" | "text" | "document" | "unknown";
  mimeType?: string;
  fileSize?: number;
  storageKey?: string;
  uploadJobId?: string;
  extractionStatus: "not-started" | "extracting" | "ocr-needed" | "complete" | "failed";
  extractionStage: ExtractionStageDTO;
  ocrStatus: OCRStatusDTO;
  ocrRequired: boolean;
  extractedTextPreview?: string;
  pageCount?: number;
  textLength?: number;
  createdAt: string;
  updatedAt: string;
};

export type ExtractMaterialRequest = {
  fileName?: string;
  fileSize?: number;
  materialId: string;
  mimeType?: string;
  forceOcr?: boolean;
  sourceBase64?: string;
  storageKey?: string;
  sourceUploadId?: string;
  sourceText?: string;
  sourceType?: DeckDTO["sourceType"];
};

export type ExtractMaterialResponse = {
  material: StudyMaterialDTO;
  extractionStage: ExtractionStageDTO;
  extractionStatus: StudyMaterialDTO["extractionStatus"];
  extractedTextPreview?: string;
  pageCount?: number;
  textLength: number;
  ocrRequired: boolean;
  ocrStatus: OCRStatusDTO;
  error?: ApiErrorDTO;
};

export type GenerateFlashcardsRequest = {
  materialId: string;
  extractedTextPreview?: string;
  generationMode?: "sample" | "comprehensive";
  batchMode?: "all" | "batch";
  batchIndex?: number;
  batchSize?: number;
  maxCards?: number;
  startQuestionIndex?: number;
  requestedCardCount?: number;
  difficulty?: FlashcardDifficultyDTO;
  topicFocus?: string[];
  idempotencyKey: string;
};

export type GenerateFlashcardsResponse = {
  materialId: string;
  generationJobId: string;
  generationStatus: FlashcardGenerationStatusDTO;
  generationStage: FlashcardGenerationStageDTO;
  deckId: string;
  deckStatus: DeckDTO["status"];
  requestedCardCount: number;
  generatedCardCount: number;
  batchIndex?: number;
  batchCardCount?: number;
  deck: DeckDTO;
  cards: FlashcardDTO[];
  expectedTotalCards?: number;
  generationDebug?: {
    mcqDetection?: {
      acceptedSourceBlocks: number;
      candidateBlocksBuilt: number;
      candidateQuestionStarts: number;
      expectedCardCount: number;
      mode: string;
      normalizedLines: number;
      rawOcrChars: number;
      rejectedSourceBlocks: number;
      rejectionReasons: Record<string, number>;
    };
  };
  hasMore?: boolean;
  idempotencyKey: string;
  retryable: boolean;
  error?: ApiErrorDTO;
};
