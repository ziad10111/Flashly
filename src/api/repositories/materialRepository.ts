import { apiRequest } from "@/api/client";
import type {
  ExtractMaterialRequest,
  ExtractMaterialResponse,
  GenerateFlashcardsRequest,
  GenerateFlashcardsResponse,
} from "../contracts";

// Frontend repository for backend material operations.
// Keep file parsing, OCR, AI calls, and secrets inside server API routes.

export const extractMaterial = async (
  request: ExtractMaterialRequest,
): Promise<ExtractMaterialResponse> =>
  apiRequest<ExtractMaterialResponse, ExtractMaterialRequest>(
    `/api/materials/${encodeURIComponent(request.materialId)}/extract`,
    {
      method: "POST",
      body: request,
      debugLabel: "extractMaterial",
      debugMeta: {
        fileName: request.fileName,
        fileSize: request.fileSize,
        hasSourceBase64: Boolean(request.sourceBase64),
        hasSourceUploadId: Boolean(request.sourceUploadId),
        hasSourceText: Boolean(request.sourceText),
        mimeType: request.mimeType,
        sourceType: request.sourceType,
      },
    },
  );

export const generateFlashcardsForMaterial = async (
  request: GenerateFlashcardsRequest,
): Promise<GenerateFlashcardsResponse> =>
  apiRequest<GenerateFlashcardsResponse, GenerateFlashcardsRequest>(
    `/api/materials/${encodeURIComponent(request.materialId)}/generate-flashcards`,
    {
      method: "POST",
      body: request,
      debugLabel: "generateFlashcardsForMaterial",
      debugMeta: {
        batchIndex: request.batchIndex,
        batchMode: request.batchMode,
        batchSize: request.batchSize,
        generationMode: request.generationMode,
        hasExtractedTextPreview: Boolean(request.extractedTextPreview),
        maxCards: request.maxCards,
        materialId: request.materialId,
        requestedCardCount: request.requestedCardCount,
        startQuestionIndex: request.startQuestionIndex,
      },
    },
  );
