import type { ApiErrorDTO, CreateUploadRequest, DeckDTO } from "@/api/contracts";
import { unsupportedMediaError, validationError } from "./apiErrors";
import { ALLOWED_UPLOAD_EXTENSIONS, ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_FILE_SIZE_BYTES } from "./uploadLimits";

export type UploadValidationSuccess = {
  ok: true;
  metadata: {
    extension: string;
    fileName: string;
    fileSize?: number;
    mimeType?: string;
    ocrRequired: boolean;
    sourceType: DeckDTO["sourceType"];
  };
};

export type UploadValidationFailure = {
  error: ApiErrorDTO;
  ok: false;
};

export type UploadValidationResult = UploadValidationSuccess | UploadValidationFailure;

const allowedExtensions = new Set<string>(ALLOWED_UPLOAD_EXTENSIONS);
const allowedMimeTypes = new Set<string>(ALLOWED_UPLOAD_MIME_TYPES);

const normalizeFileName = (fileName: string) =>
  fileName
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "upload";

const getExtension = (fileName: string) => fileName.split(".").pop()?.toLowerCase() ?? "";

const getSourceType = (extension: string, mimeType?: string): DeckDTO["sourceType"] => {
  if (extension === "pdf" || mimeType === "application/pdf") {
    return "pdf";
  }

  if (["jpg", "jpeg", "png"].includes(extension) || mimeType === "image/jpeg" || mimeType === "image/png") {
    return "image";
  }

  if (["txt", "md"].includes(extension) || mimeType === "text/plain" || mimeType === "text/markdown" || mimeType === "text/x-markdown") {
    return "text";
  }

  return "unknown";
};

const shouldUseOcr = (sourceType: DeckDTO["sourceType"]) => sourceType === "image";

export const validateCreateUploadRequest = (request: CreateUploadRequest | null): UploadValidationResult => {
  if (!request) {
    return { ok: false, error: validationError("Upload metadata is required.") };
  }

  const fileName = normalizeFileName(request.fileName);

  if (!fileName) {
    return { ok: false, error: validationError("fileName is required.") };
  }

  if (!request.idempotencyKey.trim()) {
    return { ok: false, error: validationError("idempotencyKey is required.") };
  }

  if (request.fileSize !== undefined && (request.fileSize <= 0 || request.fileSize > MAX_UPLOAD_FILE_SIZE_BYTES)) {
    return { ok: false, error: validationError(`fileSize must be between 1 byte and ${MAX_UPLOAD_FILE_SIZE_BYTES} bytes.`) };
  }

  const extension = getExtension(fileName);
  const mimeType = request.mimeType?.toLowerCase();
  const hasAllowedExtension = allowedExtensions.has(extension);
  const hasAllowedMimeType = mimeType ? allowedMimeTypes.has(mimeType) : false;

  if (!hasAllowedExtension || !hasAllowedMimeType) {
    return { ok: false, error: unsupportedMediaError("Unsupported file type. Upload a PDF, PNG, JPG, TXT, or MD file.") };
  }

  const sourceType = getSourceType(extension, mimeType);
  return {
    ok: true,
    metadata: {
      extension,
      fileName,
      fileSize: request.fileSize,
      mimeType,
      ocrRequired: shouldUseOcr(sourceType),
      sourceType,
    },
  };
};
