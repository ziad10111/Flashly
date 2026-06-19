import type {
  ApiErrorCode,
  DeckDTO,
  FlashcardDTO,
  GenerateFlashcardsResponse,
} from "@/api/contracts";
import type { FlashlyGenerationMode } from "../config";
import type { GenerationValidationSuccess } from "../generationValidation";
import type { McqDetectionDiagnostics } from "./textChunking";

export type GenerationReadinessResult =
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type GenerationTextReference = {
  storageKey: string;
  textLength: number;
};

export type GenerationSourceChunkReference = {
  chunkCount: number;
  materialId: string;
  textStorageKey?: string;
};

export type PrepareGenerationInput = {
  extractedTextPreview?: string;
  fullTextRef?: GenerationTextReference;
  materialId: string;
  metadata: GenerationValidationSuccess["metadata"];
  sourceChunks?: GenerationSourceChunkReference;
};

export type PreparedGenerationJob = Pick<
  GenerateFlashcardsResponse,
  | "generationJobId"
  | "generationStatus"
  | "generationStage"
  | "idempotencyKey"
  | "materialId"
  | "requestedCardCount"
  | "retryable"
>;

export type GenerateFlashcardDTOsInput = PrepareGenerationInput & {
  deckId: string;
};

export type GeneratedFlashcardDTOs = {
  batchIndex?: number;
  cards: FlashcardDTO[];
  expectedTotalCards?: number;
  generationDebug?: {
    mcqDetection?: McqDetectionDiagnostics;
  };
  hasMore?: boolean;
};

export type PreparedGenerationLifecycle = PreparedGenerationJob & {
  deck: DeckDTO;
  deckId: string;
  deckStatus: DeckDTO["status"];
  generatedCardCount: number;
  cards: FlashcardDTO[];
};

export type FlashlyGenerationService = {
  generateFlashcardDTOs: (input: GenerateFlashcardDTOsInput) => Promise<GeneratedFlashcardDTOs>;
  mode: FlashlyGenerationMode;
  prepareGeneration: (input: PrepareGenerationInput) => Promise<GenerateFlashcardsResponse>;
  prepareGenerationJob: (input: PrepareGenerationInput) => PreparedGenerationJob;
  validateReadiness: () => GenerationReadinessResult;
};

export class GenerationServiceNotConfiguredError extends Error {
  constructor(operation: string, message?: string) {
    super(
      message ??
        `Generation operation "${operation}" is not implemented yet. Set FLASHLY_GENERATION_MODE=mock to use the current mock flashcard generation behavior.`,
    );
    this.name = "GenerationServiceNotConfiguredError";
  }
}

export const isGenerationServiceNotConfiguredError = (
  error: unknown,
): error is GenerationServiceNotConfiguredError => error instanceof GenerationServiceNotConfiguredError;

export class GenerationServiceFailureError extends Error {
  code: ApiErrorCode;
  retryable: boolean;

  constructor(code: ApiErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "GenerationServiceFailureError";
    this.code = code;
    this.retryable = retryable;
  }
}

export const isGenerationServiceFailureError = (
  error: unknown,
): error is GenerationServiceFailureError => error instanceof GenerationServiceFailureError;
