import { apiRequest } from "@/api/client";
import { useFlashlyUploadStore } from "@/store/useFlashlyUploadStore";
import type { CreateUploadRequest, CreateUploadResponse, DeckDTO, OCRStatusDTO, UploadStageDTO, UploadStatusResponse } from "../contracts";
import { withBackendFallback } from "./backendSwitch";

// Local/mock repository. Replace internals with backend upload/status calls later.
// Do not add secrets, AI calls, OCR logic, or file parsing here.

const stageToDto = (stage: ReturnType<typeof useFlashlyUploadStore.getState>["currentStage"]): UploadStageDTO => {
  if (stage === "generating") {
    return "generating-flashcards";
  }

  if (stage === "creating") {
    return "creating-deck";
  }

  if (stage === "idle") {
    return "uploading";
  }

  return stage;
};

const getOcrStatus = (): OCRStatusDTO => {
  const state = useFlashlyUploadStore.getState();

  if (!state.ocrRequired) {
    return "not-needed";
  }

  if (state.currentStage === "ocr") {
    return "running";
  }

  if (state.status === "ready") {
    return "complete";
  }

  if (state.status === "failed") {
    return "failed";
  }

  return "queued";
};

const getSourceType = (fileName: string, mimeType?: string): DeckDTO["sourceType"] => {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "pdf" || mimeType === "application/pdf") {
    return "pdf";
  }

  if (["jpg", "jpeg", "png", "heic"].includes(extension) || mimeType?.startsWith("image/")) {
    return "image";
  }

  if (["txt", "md"].includes(extension) || mimeType?.startsWith("text/")) {
    return "text";
  }

  if (["ppt", "pptx"].includes(extension)) {
    return "document";
  }

  return "unknown";
};

const createLocalUploadJob = async (request: CreateUploadRequest): Promise<CreateUploadResponse> => {
  const state = useFlashlyUploadStore.getState();
  const uploadJobId = state.uploadJobId ?? `upload-job-${request.idempotencyKey}`;
  const materialId = state.materialId ?? `material-${request.idempotencyKey}`;
  const sourceType = getSourceType(request.fileName, request.mimeType);
  const ocrRequired = sourceType === "image";

  return {
    uploadJobId,
    materialId,
    fileName: request.fileName,
    fileSize: request.fileSize,
    mimeType: request.mimeType,
    sourceType,
    status: "queued",
    stage: "uploading",
    progressPercentage: 0,
    ocrStatus: ocrRequired ? "queued" : "not-needed",
    ocrRequired,
    idempotencyKey: request.idempotencyKey,
  };
};

const getLocalUploadStatus = async (uploadJobId?: string): Promise<UploadStatusResponse> => {
  const state = useFlashlyUploadStore.getState();

  return {
    uploadJobId: uploadJobId ?? state.uploadJobId ?? "local-upload-job",
    materialId: state.materialId,
    deckId: state.generatedDeckId,
    fileName: state.selectedFile?.name,
    status: state.status === "selected" ? "idle" : state.status === "processing" ? "processing" : state.status,
    stage: state.currentStage === "idle" ? null : stageToDto(state.currentStage),
    progressPercentage: state.progressPercentage,
    ocrStatus: getOcrStatus(),
    ocrRequired: state.ocrRequired,
    error: state.errorMessage ? { code: "processing-failed", message: state.errorMessage } : undefined,
  };
};

export const createUploadJob = async (request: CreateUploadRequest): Promise<CreateUploadResponse> =>
  withBackendFallback({
    backend: () =>
      apiRequest<CreateUploadResponse, CreateUploadRequest>("/api/uploads", {
        method: "POST",
        body: request,
      }),
    fallback: () => createLocalUploadJob(request),
    label: "createUploadJob",
  });

export const getUploadStatus = async (uploadJobId?: string): Promise<UploadStatusResponse> =>
  withBackendFallback({
    backend: () => apiRequest<UploadStatusResponse>(`/api/uploads/${encodeURIComponent(uploadJobId ?? "local-upload-job")}/status`),
    fallback: () => getLocalUploadStatus(uploadJobId),
    label: "getUploadStatus",
  });
