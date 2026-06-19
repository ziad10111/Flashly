import type { DeckDTO, StudyMaterialDTO } from "@/api/contracts";
import {
  MAX_EXTRACTED_TEXT_PREVIEW_LENGTH,
  MOCK_EXTRACTED_PAGE_COUNT,
  MOCK_EXTRACTED_TEXT_LENGTH,
} from "../extractionLimits";
import type {
  DetermineOcrInput,
  ExtractTextPreviewInput,
  FlashlyExtractionService,
  PrepareExtractionInput,
} from "./types";

const nowIso = () => new Date().toISOString();

const getMockFileMetadata = (sourceType: DeckDTO["sourceType"]) => {
  if (sourceType === "image") {
    return {
      fileName: "mock-scanned-study-material.png",
      mimeType: "image/png",
    };
  }

  if (sourceType === "text") {
    return {
      fileName: "mock-study-material.txt",
      mimeType: "text/plain",
    };
  }

  if (sourceType === "document") {
    return {
      fileName: "mock-study-material.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
  }

  return {
    fileName: "mock-study-material.pdf",
    mimeType: "application/pdf",
  };
};

const mockExtractedTextPreview =
  "This mock extraction preview represents cleaned study material text. It is intentionally short and metadata-only so real extraction, OCR, parsing, and storage can be added later on the backend.";

const determineMockOcrRequirement = (input: DetermineOcrInput) => {
  if (input.forceOcr) {
    return {
      ocrRequired: true,
      ocrStatus: "complete" as const,
      reason: "force-ocr" as const,
    };
  }

  if (input.sourceType === "image") {
    return {
      ocrRequired: true,
      ocrStatus: "complete" as const,
      reason: "image-like-material" as const,
    };
  }

  return {
    ocrRequired: false,
    ocrStatus: "not-needed" as const,
    reason: "text-extraction-sufficient" as const,
  };
};

const createMockMaterial = (input: PrepareExtractionInput): StudyMaterialDTO => {
  const sourceType = input.metadata.sourceType;
  const fileMetadata = getMockFileMetadata(sourceType);
  const ocrRequirement = determineMockOcrRequirement({
    forceOcr: input.forceOcr ?? input.metadata.ocrRequired,
    sourceType,
  });
  const now = nowIso();
  const preview = mockExtractedTextPreview.slice(0, MAX_EXTRACTED_TEXT_PREVIEW_LENGTH);

  return {
    id: input.materialId,
    fileName: fileMetadata.fileName,
    fileType: sourceType,
    mimeType: fileMetadata.mimeType,
    storageKey: input.sourceRef?.storageKey ?? `mock/uploads/${input.materialId}`,
    uploadJobId: `mock-upload-job-${input.materialId}`,
    extractionStatus: "complete",
    extractionStage: "complete",
    ocrStatus: ocrRequirement.ocrStatus,
    ocrRequired: ocrRequirement.ocrRequired,
    extractedTextPreview: preview,
    pageCount: MOCK_EXTRACTED_PAGE_COUNT,
    textLength: MOCK_EXTRACTED_TEXT_LENGTH,
    createdAt: now,
    updatedAt: now,
  };
};

const createMockExtractionLifecycle = async (input: ExtractTextPreviewInput) => {
  const material = createMockMaterial(input);

  return {
    material,
    extractionStage: material.extractionStage,
    extractionStatus: material.extractionStatus,
    extractedTextPreview: material.extractedTextPreview,
    pageCount: material.pageCount,
    textLength: material.textLength ?? MOCK_EXTRACTED_TEXT_LENGTH,
    ocrRequired: material.ocrRequired,
    ocrStatus: material.ocrStatus,
  };
};

export const mockExtractionService: FlashlyExtractionService = {
  determineOcrRequirement: determineMockOcrRequirement,
  extractTextPreview: createMockExtractionLifecycle,
  mode: "mock",
  prepareExtractionJob: createMockExtractionLifecycle,
  validateReadiness: () => ({ ok: true }),
};
