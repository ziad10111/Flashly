import type { ApiErrorCode, DeckDTO, ExtractMaterialResponse, OCRStatusDTO } from "@/api/contracts";
import type { FlashlyExtractionMode } from "../config";
import type { ExtractionValidationSuccess } from "../extractionValidation";

export type ExtractionReadinessResult =
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type ExtractionOcrRequirement = {
  ocrRequired: boolean;
  ocrStatus: OCRStatusDTO;
  reason: "force-ocr" | "image-like-material" | "text-extraction-sufficient";
};

export type ExtractionSourceReference = {
  storageKey?: string;
};

export type ExtractionTextReference = {
  storageKey: string;
  textLength: number;
};

export type ExtractionSourceChunkHandoff = {
  chunkCount: number;
  materialId: string;
  sourceStorageKey?: string;
  textStorageKey?: string;
};

export type PrepareExtractionInput = {
  forceOcr?: boolean;
  materialId: string;
  metadata: ExtractionValidationSuccess["metadata"];
  sourceRef?: ExtractionSourceReference;
};

export type PreparedExtractionLifecycle = ExtractMaterialResponse & {
  fullTextRef?: ExtractionTextReference;
  sourceChunkHandoff?: ExtractionSourceChunkHandoff;
};

export type DetermineOcrInput = {
  forceOcr?: boolean;
  sourceType: DeckDTO["sourceType"];
};

export type ExtractTextPreviewInput = PrepareExtractionInput;

export type FlashlyExtractionService = {
  determineOcrRequirement: (input: DetermineOcrInput) => ExtractionOcrRequirement;
  extractTextPreview: (input: ExtractTextPreviewInput) => Promise<PreparedExtractionLifecycle>;
  mode: FlashlyExtractionMode;
  prepareExtractionJob: (input: PrepareExtractionInput) => Promise<PreparedExtractionLifecycle>;
  validateReadiness: () => ExtractionReadinessResult;
};

export class ExtractionServiceNotConfiguredError extends Error {
  constructor(operation: string) {
    super(
      `Extraction operation "${operation}" is not implemented yet. Set FLASHLY_EXTRACTION_MODE=mock to use the current mock extraction behavior.`,
    );
    this.name = "ExtractionServiceNotConfiguredError";
  }
}

export class ExtractionServiceFailureError extends Error {
  code: Extract<ApiErrorCode, "not-ready" | "processing-failed" | "validation-error">;
  retryable: boolean;

  constructor(
    code: Extract<ApiErrorCode, "not-ready" | "processing-failed" | "validation-error">,
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = "ExtractionServiceFailureError";
    this.code = code;
    this.retryable = retryable;
  }
}

export const isExtractionServiceNotConfiguredError = (
  error: unknown,
): error is ExtractionServiceNotConfiguredError => error instanceof ExtractionServiceNotConfiguredError;

export const isExtractionServiceFailureError = (
  error: unknown,
): error is ExtractionServiceFailureError => error instanceof ExtractionServiceFailureError;
