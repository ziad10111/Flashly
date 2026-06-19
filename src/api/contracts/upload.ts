import type { ApiErrorDTO, OCRStatusDTO, UploadStageDTO, UploadStatusDTO } from "./common";

export const MAX_DIRECT_UPLOAD_BYTES = 4 * 1024 * 1024;
export const UPLOAD_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
export const SAFE_BASE64_CHUNK_BYTES = 3 * 1024 * 1024;
export const MAX_CHUNKED_UPLOAD_BYTES = 50 * 1024 * 1024;

export type CreateUploadRequest = {
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  materialTypeId?: string;
  idempotencyKey: string;
};

export type CreateUploadResponse = {
  uploadJobId: string;
  materialId: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  sourceType: "pdf" | "image" | "text" | "document" | "unknown";
  status: UploadStatusDTO;
  stage: UploadStageDTO;
  progressPercentage: number;
  ocrStatus: OCRStatusDTO;
  ocrRequired: boolean;
  idempotencyKey: string;
  storageKey?: string;
  uploadUrl?: string;
};

export type UploadStatusResponse = {
  uploadJobId: string;
  materialId: string | null;
  deckId: string | null;
  fileName?: string;
  status: UploadStatusDTO;
  stage: UploadStageDTO | null;
  progressPercentage: number;
  ocrStatus: OCRStatusDTO;
  ocrRequired: boolean;
  storageKey?: string;
  error?: ApiErrorDTO;
};

export type StartChunkedUploadRequest = {
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey?: string;
  totalChunks: number;
};

export type StartChunkedUploadResponse = {
  uploadId: string;
};

export type UploadChunkPartRequest = {
  uploadId: string;
  chunkIndex: number;
  totalChunks: number;
  chunkBase64: string;
};

export type UploadChunkPartResponse = {
  received: true;
  chunkIndex: number;
};

export type CompleteChunkedUploadRequest = {
  uploadId: string;
};

export type CompleteChunkedUploadResponse = {
  fileName: string;
  mimeType: string;
  fileSize: number;
  contentType?: string;
  originalName?: string;
  sizeBytes?: number;
  sourceBase64?: string;
  sourceUploadId: string;
  storageKey?: string;
  storageProvider?: "local" | "s3";
  storageUrl?: string;
};
