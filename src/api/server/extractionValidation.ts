import type { ApiErrorDTO, DeckDTO, ExtractMaterialRequest } from "@/api/contracts";
import { MAX_CHUNKED_UPLOAD_BYTES, MAX_SOURCE_IMAGE_INPUT_BYTES } from "@/api/contracts";
import { validationError } from "./apiErrors";
import {
  MAX_SOURCE_TEXT_INPUT_LENGTH,
  MIN_SOURCE_TEXT_INPUT_LENGTH,
  SUPPORTED_EXTRACTION_SOURCE_TYPES,
} from "./extractionLimits";

export type ExtractionValidationSuccess = {
  ok: true;
  metadata: {
    extractionStage: "ocr" | "cleaning-text";
    materialId: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    ocrRequired: boolean;
    ocrStatus: "complete" | "not-needed";
    sourceBase64?: string;
    storageKey?: string;
    sourceUploadId?: string;
    sourceText?: string;
    sourceType: DeckDTO["sourceType"];
    userId?: string;
  };
};

export type ExtractionValidationFailure = {
  error: ApiErrorDTO;
  ok: false;
};

export type ExtractionValidationResult = ExtractionValidationSuccess | ExtractionValidationFailure;

const getMockSourceType = (materialId: string): DeckDTO["sourceType"] => {
  const normalizedId = materialId.toLowerCase();

  if (normalizedId.includes("image") || normalizedId.includes("scan") || normalizedId.includes("photo")) {
    return "image";
  }

  if (normalizedId.includes("text") || normalizedId.includes("txt") || normalizedId.includes("md")) {
    return "text";
  }

  if (normalizedId.includes("ppt") || normalizedId.includes("document")) {
    return "document";
  }

  return "pdf";
};

const allowedRequestSourceTypes = new Set<DeckDTO["sourceType"]>(["pdf", "image", "text", "document", "unknown"]);

const isTextSourceType = (sourceType: DeckDTO["sourceType"]) => sourceType === "text";

const isBinarySourceType = (sourceType: DeckDTO["sourceType"]) => sourceType === "pdf" || sourceType === "image";

const allowedImageMimeTypes = new Set(["image/jpeg", "image/png"]);

const stripBase64DataUrlPrefix = (sourceBase64: string) => {
  const trimmed = sourceBase64.trim();
  const commaIndex = trimmed.indexOf(",");

  if (/^data:[^,]*;base64,/i.test(trimmed) && commaIndex !== -1) {
    return trimmed.slice(commaIndex + 1);
  }

  return trimmed;
};

const getBase64ByteLength = (sourceBase64: string) => {
  const normalized = sourceBase64.replace(/\s/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;

  return Math.floor((normalized.length * 3) / 4) - padding;
};

const isBase64Like = (sourceBase64: string) => /^[A-Za-z0-9+/]+={0,2}$/.test(sourceBase64);

const isSafeSourceUploadId = (sourceUploadId: string) => /^chunk-[a-zA-Z0-9_-]{12,96}$/.test(sourceUploadId);

const isSafeStorageKey = (storageKey: string) =>
  /^(mock\/uploads|uploads)\/[a-zA-Z0-9._/-]{6,240}$/.test(storageKey) && !storageKey.includes("..");

const normalizeSourceText = (sourceText: string) =>
  sourceText
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

export const validateExtractMaterialRequest = (
  routeMaterialId: string,
  request: ExtractMaterialRequest | null,
): ExtractionValidationResult => {
  const materialId = request?.materialId ?? routeMaterialId;

  if (!materialId.trim()) {
    return { ok: false, error: validationError("materialId is required.") };
  }

  if (materialId !== routeMaterialId) {
    return { ok: false, error: validationError("materialId must match the route id.") };
  }

  const requestedSourceType = request?.sourceType;

  if (requestedSourceType && !allowedRequestSourceTypes.has(requestedSourceType)) {
    return { ok: false, error: validationError("sourceType is not supported for extraction.") };
  }

  const sourceType = requestedSourceType ?? getMockSourceType(materialId);

  if (!SUPPORTED_EXTRACTION_SOURCE_TYPES.includes(sourceType)) {
    return { ok: false, error: validationError("This material source type is not supported for extraction.") };
  }

  const ocrRequired = sourceType === "image";
  const sourceText = typeof request?.sourceText === "string" ? normalizeSourceText(request.sourceText) : undefined;
  const sourceBase64 =
    typeof request?.sourceBase64 === "string"
      ? stripBase64DataUrlPrefix(request.sourceBase64).replace(/\s/g, "")
      : undefined;
  const sourceUploadId =
    typeof request?.sourceUploadId === "string"
      ? request.sourceUploadId.trim()
      : undefined;
  const storageKey =
    typeof request?.storageKey === "string"
      ? request.storageKey.trim()
      : undefined;
  const mimeType = request?.mimeType?.toLowerCase();
  const fileName = request?.fileName?.trim();
  const fileSize = request?.fileSize;

  if (sourceText !== undefined) {
    if (!isTextSourceType(sourceType) || ocrRequired) {
      return { ok: false, error: validationError("sourceText is only supported for text-based materials.") };
    }

    if (sourceText.length > MAX_SOURCE_TEXT_INPUT_LENGTH) {
      return {
        ok: false,
        error: validationError(`sourceText must be ${MAX_SOURCE_TEXT_INPUT_LENGTH} characters or fewer.`),
      };
    }

    if (sourceText.length < MIN_SOURCE_TEXT_INPUT_LENGTH) {
      return {
        ok: false,
        error: validationError(`sourceText must include at least ${MIN_SOURCE_TEXT_INPUT_LENGTH} useful characters.`),
      };
    }
  }

  const providedSourceCount = [sourceText, sourceBase64, sourceUploadId].filter((value) => value !== undefined).length;

  if (providedSourceCount > 1) {
    return { ok: false, error: validationError("Send only one source input: sourceText, sourceBase64, or sourceUploadId.") };
  }

  if (storageKey !== undefined && !isSafeStorageKey(storageKey)) {
    return { ok: false, error: validationError("storageKey is invalid.") };
  }

  if (sourceUploadId !== undefined) {
    if (!isBinarySourceType(sourceType)) {
      return { ok: false, error: validationError("sourceUploadId is only supported for PDF and image materials.") };
    }

    if (!isSafeSourceUploadId(sourceUploadId)) {
      return { ok: false, error: validationError("sourceUploadId is invalid.") };
    }
  }

  if (sourceBase64 !== undefined) {
    if (!isBinarySourceType(sourceType)) {
      return { ok: false, error: validationError("sourceBase64 is only supported for PDF and image materials.") };
    }

    if (!isBase64Like(sourceBase64)) {
      return { ok: false, error: validationError("sourceBase64 must be valid base64 content.") };
    }

    const byteLength = getBase64ByteLength(sourceBase64);
    const maxBytes = sourceType === "pdf" ? MAX_CHUNKED_UPLOAD_BYTES : MAX_SOURCE_IMAGE_INPUT_BYTES;

    if (byteLength <= 0 || byteLength > maxBytes) {
      return { ok: false, error: validationError(`sourceBase64 must decode to between 1 byte and ${maxBytes} bytes.`) };
    }

    if (fileSize !== undefined && (fileSize <= 0 || fileSize > maxBytes)) {
      return { ok: false, error: validationError(`fileSize must be between 1 byte and ${maxBytes} bytes for this extraction path.`) };
    }

    if (sourceType === "pdf" && mimeType && mimeType !== "application/pdf") {
      return { ok: false, error: validationError("PDF extraction requires application/pdf input.") };
    }

    if (sourceType === "image" && mimeType && !allowedImageMimeTypes.has(mimeType)) {
      return { ok: false, error: validationError("Image OCR supports JPEG and PNG files only.") };
    }
  }

  return {
    ok: true,
    metadata: {
      extractionStage: ocrRequired ? "ocr" : "cleaning-text",
      fileName,
      fileSize,
      materialId,
      mimeType,
      ocrRequired,
      ocrStatus: ocrRequired ? "complete" : "not-needed",
      sourceBase64,
      storageKey,
      sourceUploadId,
      sourceText,
      sourceType,
    },
  };
};
