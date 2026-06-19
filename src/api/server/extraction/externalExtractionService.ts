import type { DeckDTO, OCRStatusDTO, StudyMaterialDTO } from "@/api/contracts";
import {
  FLASHLY_OCR_API_KEY,
  FLASHLY_OCR_API_URL,
  FLASHLY_OCR_PROVIDER,
  FLASHLY_OCR_TIMEOUT_MS,
  FLASHLY_PDF_EXTRACTION_PROVIDER,
} from "../config";
import {
  MAX_EXTRACTED_TEXT_PREVIEW_LENGTH,
  MIN_SOURCE_TEXT_INPUT_LENGTH,
} from "../extractionLimits";
import { extractScannedPdfWithOcr, PDF_OCR_TEXT_THRESHOLD } from "./pdfOcrExtraction";
import { cleanupCompletedChunkUpload, readCompletedChunkUploadBase64 } from "../uploadChunkStore";
import { storageService } from "../storage";
import type {
  DetermineOcrInput,
  ExtractTextPreviewInput,
  FlashlyExtractionService,
  PrepareExtractionInput,
} from "./types";
import { ExtractionServiceFailureError } from "./types";

type OcrSpaceParsedResult = {
  ParsedText?: unknown;
};

type OcrSpaceResponse = {
  ErrorMessage?: unknown;
  IsErroredOnProcessing?: unknown;
  ParsedResults?: unknown;
};

type NodeZlibModule = {
  inflateRawSync: (bytes: Uint8Array) => Uint8Array;
  inflateSync: (bytes: Uint8Array) => Uint8Array;
};

const nowIso = () => new Date().toISOString();

const isDevelopmentRuntime = () => typeof __DEV__ !== "undefined" && __DEV__;

const getErrorDetails = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
    name: typeof error,
    stack: undefined,
  };
};

const logPdfParserFailure = (
  error: unknown,
  metadata: {
    byteLength: number;
    parser: string;
    startsWithPdf: boolean;
  },
) => {
  if (!isDevelopmentRuntime()) {
    return;
  }

  console.error("[Flashly PDF Parser] failed", {
    ...metadata,
    ...getErrorDetails(error),
  });
};

const cleanSourceText = (sourceText: string) =>
  sourceText
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

const getExternalFileMetadata = (input: PrepareExtractionInput) => {
  const sourceType = input.metadata.sourceType;

  if (input.metadata.fileName || input.metadata.mimeType) {
    return {
      fileName: input.metadata.fileName ?? getDefaultFileName(sourceType),
      mimeType: input.metadata.mimeType,
    };
  }

  return {
    fileName: getDefaultFileName(sourceType),
    mimeType: getDefaultMimeType(sourceType),
  };
};

const getDefaultFileName = (sourceType: DeckDTO["sourceType"]) => {
  if (sourceType === "text") {
    return "uploaded-text-material.txt";
  }

  if (sourceType === "image") {
    return "uploaded-image-material.png";
  }

  if (sourceType === "document") {
    return "uploaded-document-material";
  }

  return "uploaded-study-material.pdf";
};

const getDefaultMimeType = (sourceType: DeckDTO["sourceType"]) => {
  if (sourceType === "text") {
    return "text/plain";
  }

  if (sourceType === "image") {
    return "image/png";
  }

  if (sourceType === "pdf") {
    return "application/pdf";
  }

  return undefined;
};

const determineExternalOcrRequirement = (input: DetermineOcrInput) => {
  if (input.forceOcr) {
    return {
      ocrRequired: true,
      ocrStatus: "queued" as const,
      reason: "force-ocr" as const,
    };
  }

  if (input.sourceType === "image") {
    return {
      ocrRequired: true,
      ocrStatus: "queued" as const,
      reason: "image-like-material" as const,
    };
  }

  return {
    ocrRequired: false,
    ocrStatus: "not-needed" as const,
    reason: "text-extraction-sufficient" as const,
  };
};

const stripBase64DataUrlPrefix = (sourceBase64: string) => {
  const trimmed = sourceBase64.trim();
  const commaIndex = trimmed.indexOf(",");

  if (/^data:[^,]*;base64,/i.test(trimmed) && commaIndex !== -1) {
    return trimmed.slice(commaIndex + 1);
  }

  return trimmed;
};

const decodeBase64ToBytes = (sourceBase64: string) => {
  const normalizedBase64 = stripBase64DataUrlPrefix(sourceBase64).replace(/\s/g, "");
  const binary = atob(normalizedBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const decodeLatin1 = (bytes: Uint8Array) => {
  let value = "";
  const chunkSize = 8192;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.slice(index, index + chunkSize);
    value += String.fromCharCode(...chunk);
  }

  return value;
};

const decodeUtf16Be = (bytes: number[]) => {
  let value = "";

  for (let index = 0; index + 1 < bytes.length; index += 2) {
    value += String.fromCharCode((bytes[index] << 8) + bytes[index + 1]);
  }

  return value;
};

const decodePdfHexString = (hexValue: string) => {
  const cleanHex = hexValue.replace(/\s/g, "");
  const bytes: number[] = [];

  for (let index = 0; index + 1 < cleanHex.length; index += 2) {
    bytes.push(Number.parseInt(cleanHex.slice(index, index + 2), 16));
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16Be(bytes.slice(2));
  }

  return String.fromCharCode(...bytes);
};

const decodePdfLiteralString = (value: string) =>
  value.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_match, escape: string) => {
    if (escape === "n") {
      return "\n";
    }

    if (escape === "r") {
      return "\r";
    }

    if (escape === "t") {
      return "\t";
    }

    if (escape === "b") {
      return "\b";
    }

    if (escape === "f") {
      return "\f";
    }

    if (/^[0-7]+$/.test(escape)) {
      return String.fromCharCode(Number.parseInt(escape, 8));
    }

    return escape;
  });

const getPdfPageCount = (pdfText: string) => {
  const pages = pdfText.match(/\/Type\s*\/Page(?!s)\b/g);

  return Math.max(1, pages?.length ?? 1);
};

const getNodeZlib = async (): Promise<NodeZlibModule | null> => {
  try {
    const importNodeZlib = Function("return import('node:zlib')") as () => Promise<NodeZlibModule>;

    return await importNodeZlib();
  } catch {
    try {
      const importZlib = Function("return import('zlib')") as () => Promise<NodeZlibModule>;

      return await importZlib();
    } catch {
      return null;
    }
  }
};

const inflatePdfStream = async (bytes: Uint8Array) => {
  const zlib = await getNodeZlib();

  if (!zlib) {
    throw new ExtractionServiceFailureError(
      "processing-failed",
      "PDF parser could not access backend deflate support for compressed PDF text streams.",
      true,
    );
  }

  try {
    return new Uint8Array(zlib.inflateSync(bytes));
  } catch (zlibError) {
    try {
      return new Uint8Array(zlib.inflateRawSync(bytes));
    } catch {
      throw zlibError;
    }
  }
};

const trimPdfStreamBoundaries = (bytes: Uint8Array) => {
  let start = 0;
  let end = bytes.length;

  if (bytes[start] === 13 && bytes[start + 1] === 10) {
    start += 2;
  } else if (bytes[start] === 10 || bytes[start] === 13) {
    start += 1;
  }

  while (end > start && (bytes[end - 1] === 10 || bytes[end - 1] === 13 || bytes[end - 1] === 32)) {
    end -= 1;
  }

  return bytes.slice(start, end);
};

const isPdfImageStreamDictionary = (dictionary: string) =>
  /\/Subtype\s*\/Image\b/.test(dictionary) || /\/DCTDecode\b/.test(dictionary);

const isPdfFlateStreamDictionary = (dictionary: string) => /\/FlateDecode\b/.test(dictionary);

const getPdfContentStreams = async (bytes: Uint8Array, pdfText: string) => {
  const streams: string[] = [];
  let searchIndex = 0;

  while (searchIndex < pdfText.length) {
    const streamKeywordIndex = pdfText.indexOf("stream", searchIndex);

    if (streamKeywordIndex === -1) {
      break;
    }

    const endStreamIndex = pdfText.indexOf("endstream", streamKeywordIndex + "stream".length);

    if (endStreamIndex === -1) {
      break;
    }

    const dictionaryStart = pdfText.lastIndexOf("<<", streamKeywordIndex);
    const dictionaryEnd = pdfText.lastIndexOf(">>", streamKeywordIndex);

    if (dictionaryStart === -1 || dictionaryEnd === -1 || dictionaryEnd < dictionaryStart) {
      searchIndex = endStreamIndex + "endstream".length;
      continue;
    }

    const dictionary = pdfText.slice(dictionaryStart, dictionaryEnd + 2);
    let streamStart = streamKeywordIndex + "stream".length;

    if (pdfText[streamStart] === "\r" && pdfText[streamStart + 1] === "\n") {
      streamStart += 2;
    } else if (pdfText[streamStart] === "\n" || pdfText[streamStart] === "\r") {
      streamStart += 1;
    }

    const streamBytes = trimPdfStreamBoundaries(bytes.slice(streamStart, endStreamIndex));

    if (isPdfImageStreamDictionary(dictionary)) {
      searchIndex = endStreamIndex + "endstream".length;
      continue;
    }

    let decodedBytes = streamBytes;

    if (isPdfFlateStreamDictionary(dictionary)) {
      try {
        decodedBytes = await inflatePdfStream(streamBytes);
      } catch (error) {
        logPdfParserFailure(error, {
          byteLength: streamBytes.byteLength,
          parser: "flashly-local-pdf-text-extractor:zlib",
          startsWithPdf: true,
        });
        searchIndex = endStreamIndex + "endstream".length;
        continue;
      }
    }

    streams.push(decodeLatin1(decodedBytes));
    searchIndex = endStreamIndex + "endstream".length;
  }

  return streams;
};

const extractTextOperators = (content: string) => {
  const textParts: string[] = [];
  const literalTextPattern = /\(((?:\\.|[^\\)])*)\)\s*Tj/gms;
  const hexTextPattern = /<([0-9A-Fa-f\s]+)>\s*Tj/gms;
  const arrayTextPattern = /\[(.*?)\]\s*TJ/gms;
  let match: RegExpExecArray | null;

  while ((match = literalTextPattern.exec(content)) !== null) {
    textParts.push(decodePdfLiteralString(match[1]));
  }

  while ((match = hexTextPattern.exec(content)) !== null) {
    textParts.push(decodePdfHexString(match[1]));
  }

  while ((match = arrayTextPattern.exec(content)) !== null) {
    const arrayContent = match[1];
    const arrayParts: string[] = [];
    const arrayLiteralPattern = /\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/gms;
    let arrayMatch: RegExpExecArray | null;

    while ((arrayMatch = arrayLiteralPattern.exec(arrayContent)) !== null) {
      arrayParts.push(
        arrayMatch[1] !== undefined
          ? decodePdfLiteralString(arrayMatch[1])
          : decodePdfHexString(arrayMatch[2]),
      );
    }

    textParts.push(arrayParts.join(""));
  }

  return textParts.join("\n");
};

const extractPdfText = async (sourceBase64: string) => {
  if (FLASHLY_PDF_EXTRACTION_PROVIDER !== "local") {
    throw new ExtractionServiceFailureError(
      "not-ready",
      "PDF extraction provider is not supported. Use FLASHLY_PDF_EXTRACTION_PROVIDER=local.",
      true,
    );
  }

  const bytes = decodeBase64ToBytes(sourceBase64);
  const pdfText = decodeLatin1(bytes);
  const startsWithPdf = pdfText.startsWith("%PDF-");

  if (isDevelopmentRuntime()) {
    console.info("[PDF Extraction] decoded input", {
      byteLength: bytes.byteLength,
      fileSize: bytes.byteLength,
      parser: "flashly-local-pdf-text-extractor:zlib",
      startsWithPdf,
    });
  }

  if (!startsWithPdf) {
    throw new ExtractionServiceFailureError(
      "validation-error",
      "This file does not look like a valid PDF.",
      false,
    );
  }

  let streams: string[];

  try {
    streams = await getPdfContentStreams(bytes, pdfText);
  } catch (error) {
    if (error instanceof ExtractionServiceFailureError) {
      logPdfParserFailure(error, {
        byteLength: bytes.byteLength,
        parser: "flashly-local-pdf-text-extractor:zlib",
        startsWithPdf,
      });
      throw error;
    }

    logPdfParserFailure(error, {
      byteLength: bytes.byteLength,
      parser: "flashly-local-pdf-text-extractor:zlib",
      startsWithPdf,
    });

    throw new ExtractionServiceFailureError(
      "processing-failed",
      "PDF parser failed while reading selectable text from this file.",
      true,
    );
  }

  const extractedText = cleanSourceText(streams.map(extractTextOperators).join("\n"));

  if (isDevelopmentRuntime()) {
    console.info("[PDF Extraction] selectable text extracted", {
      pageCount: getPdfPageCount(pdfText),
      ocrFallbackTriggered: extractedText.length < PDF_OCR_TEXT_THRESHOLD,
      selectableTextLength: extractedText.length,
      threshold: PDF_OCR_TEXT_THRESHOLD,
    });
  }

  return {
    pageCount: getPdfPageCount(pdfText),
    text: extractedText,
  };
};

const getSafeOcrProviderName = () => FLASHLY_OCR_PROVIDER?.toLowerCase();

const getOcrProviderText = async (input: ExtractTextPreviewInput) => {
  if (getSafeOcrProviderName() !== "ocrspace") {
    throw new ExtractionServiceFailureError(
      "not-ready",
      "Image OCR is not configured. Set FLASHLY_OCR_PROVIDER=ocrspace and a server-only FLASHLY_OCR_API_KEY.",
      true,
    );
  }

  if (!FLASHLY_OCR_API_KEY) {
    throw new ExtractionServiceFailureError(
      "not-ready",
      "Image OCR provider is missing server-only configuration.",
      true,
    );
  }

  if (!input.metadata.sourceBase64) {
    throw new ExtractionServiceFailureError("validation-error", "Image OCR requires sourceBase64 input.", false);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLASHLY_OCR_TIMEOUT_MS);
  const mimeType = input.metadata.mimeType ?? "image/png";
  const body = new FormData();
  body.append("apikey", FLASHLY_OCR_API_KEY);
  body.append("base64Image", `data:${mimeType};base64,${input.metadata.sourceBase64}`);
  body.append("language", "eng");
  body.append("scale", "true");
  body.append("OCREngine", "2");

  try {
    const response = await fetch(FLASHLY_OCR_API_URL, {
      body,
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ExtractionServiceFailureError(
        "processing-failed",
        "The OCR provider could not process this image right now.",
        true,
      );
    }

    const result = (await response.json()) as OcrSpaceResponse;

    if (result.IsErroredOnProcessing === true) {
      throw new ExtractionServiceFailureError(
        "processing-failed",
        "The OCR provider could not read this image.",
        true,
      );
    }

    const parsedResults = Array.isArray(result.ParsedResults) ? result.ParsedResults : [];
    const text = cleanSourceText(
      parsedResults
        .map((item) => (item as OcrSpaceParsedResult).ParsedText)
        .filter((item): item is string => typeof item === "string")
        .join("\n"),
    );

    if (text.length < MIN_SOURCE_TEXT_INPUT_LENGTH) {
      throw new ExtractionServiceFailureError(
        "not-ready",
        "OCR did not find enough readable study text in this image.",
        true,
      );
    }

    return text;
  } catch (error) {
    if (error instanceof ExtractionServiceFailureError) {
      throw error;
    }

    throw new ExtractionServiceFailureError(
      "processing-failed",
      "The OCR provider timed out or could not be reached.",
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
};

const createExternalMaterial = (
  input: PrepareExtractionInput,
  cleanedText: string,
  options: {
    ocrRequired: boolean;
    ocrStatus: OCRStatusDTO;
    pageCount: number;
  },
): StudyMaterialDTO => {
  const now = nowIso();
  const fileMetadata = getExternalFileMetadata(input);

  return {
    id: input.materialId,
    fileName: fileMetadata.fileName,
    fileType: input.metadata.sourceType,
    fileSize: input.metadata.fileSize,
    mimeType: fileMetadata.mimeType,
    storageKey: input.sourceRef?.storageKey ?? `local-upload/${input.materialId}`,
    uploadJobId: `local-upload-${input.materialId}`,
    extractionStatus: "complete",
    extractionStage: "complete",
    ocrStatus: options.ocrStatus,
    ocrRequired: options.ocrRequired,
    extractedTextPreview: cleanedText.slice(0, MAX_EXTRACTED_TEXT_PREVIEW_LENGTH),
    pageCount: options.pageCount,
    textLength: cleanedText.length,
    createdAt: now,
    updatedAt: now,
  };
};

const persistDirectUploadToStorage = async (input: ExtractTextPreviewInput) => {
  if (storageService.mode !== "cloud" || !storageService.storeObject || !input.sourceRef?.storageKey) {
    return;
  }

  if (input.metadata.sourceUploadId) {
    return;
  }

  if (!input.metadata.sourceBase64 && !input.metadata.sourceText) {
    return;
  }

  await storageService.storeObject({
    contentBase64: input.metadata.sourceBase64,
    contentType: input.metadata.mimeType,
    fileName: input.metadata.fileName ?? getDefaultFileName(input.metadata.sourceType),
    metadata: {
      "flashly-material-id": input.materialId,
      "flashly-source-type": input.metadata.sourceType,
    },
    sizeBytes: input.metadata.fileSize,
    storageKey: input.sourceRef.storageKey,
    textContent: input.metadata.sourceText,
  });
};

const loadSourceFromStorage = async (input: ExtractTextPreviewInput) => {
  if (storageService.mode !== "cloud" || !storageService.readObject || !input.sourceRef?.storageKey) {
    return null;
  }

  const storedObject = await storageService.readObject(input.sourceRef.storageKey);

  if (isDevelopmentRuntime()) {
    console.info("[Flashly Extraction] loaded source from cloud storage", {
      contentType: storedObject.contentType,
      sizeBytes: storedObject.sizeBytes,
      storageKey: storedObject.storageKey,
    });
  }

  return storedObject;
};

const createExtractionLifecycle = async (input: ExtractTextPreviewInput) => {
  let cleanedText = "";
  let pageCount = 1;
  let ocrRequired = false;
  let ocrStatus: OCRStatusDTO = "not-needed";
  let sourceBase64 = input.metadata.sourceBase64;
  let sourceText = input.metadata.sourceText;

  try {
    await persistDirectUploadToStorage(input);

    if ((!sourceBase64 || input.metadata.sourceType === "text") && input.sourceRef?.storageKey) {
      const storedSource = await loadSourceFromStorage(input);

      if (storedSource) {
        if (input.metadata.sourceType === "text") {
          sourceText = storedSource.textContent ?? cleanSourceText(atob(storedSource.contentBase64));
        } else {
          sourceBase64 = storedSource.contentBase64;
        }
      }
    }

    if (!sourceBase64 && input.metadata.sourceUploadId) {
      const assembledUpload = await readCompletedChunkUploadBase64(
        input.metadata.sourceUploadId,
        input.metadata.userId ?? "mock-clerk-user-flashly",
      );
      sourceBase64 = assembledUpload.sourceBase64;

      if (isDevelopmentRuntime()) {
        console.info("[Flashly Extraction] using assembled chunk upload", {
          fileName: assembledUpload.fileName,
          fileSize: assembledUpload.fileSize,
          mimeType: assembledUpload.mimeType,
          sourceUploadId: input.metadata.sourceUploadId,
        });
      }
    }

    if (input.metadata.sourceType === "text") {
      if (input.metadata.ocrRequired) {
        throw new ExtractionServiceFailureError(
          "not-ready",
          "OCR is not supported for text uploads.",
          true,
        );
      }

      cleanedText = cleanSourceText(sourceText ?? "");
    } else if (input.metadata.sourceType === "pdf") {
      if (!sourceBase64) {
        throw new ExtractionServiceFailureError("validation-error", "PDF extraction requires sourceBase64 input.", false);
      }

      const pdfExtraction = await extractPdfText(sourceBase64);
      cleanedText = pdfExtraction.text;
      pageCount = pdfExtraction.pageCount;

      if (cleanedText.length < PDF_OCR_TEXT_THRESHOLD || input.forceOcr) {
        if (isDevelopmentRuntime()) {
          console.info("[PDF Extraction] OCR fallback selected", {
            fileName: input.metadata.fileName,
            ocrFallbackTriggered: true,
            pageCount,
            selectableTextLength: cleanedText.length,
            threshold: PDF_OCR_TEXT_THRESHOLD,
          });
        }

        ocrRequired = true;
        ocrStatus = "complete";
        cleanedText = await extractScannedPdfWithOcr({
          cleanSourceText,
          fileName: input.metadata.fileName,
          pageCount,
          sourceBase64,
        });
      }
    } else if (input.metadata.sourceType === "image") {
      ocrRequired = true;
      ocrStatus = "complete";
      cleanedText = await getOcrProviderText({
        ...input,
        metadata: {
          ...input.metadata,
          sourceBase64,
        },
      });
    } else {
      throw new ExtractionServiceFailureError(
        "not-ready",
        "External extraction currently supports text, markdown, PDF, JPG, and PNG uploads only.",
        true,
      );
    }

    if (cleanedText.length < MIN_SOURCE_TEXT_INPUT_LENGTH) {
      throw new ExtractionServiceFailureError(
        "not-ready",
        "External extraction requires enough readable study text to generate flashcards.",
        true,
      );
    }

    const material = createExternalMaterial(input, cleanedText, {
      ocrRequired,
      ocrStatus,
      pageCount,
    });

    return {
      material,
      extractionStage: material.extractionStage,
      extractionStatus: material.extractionStatus,
      extractedTextPreview: material.extractedTextPreview,
      pageCount: material.pageCount,
      textLength: material.textLength ?? cleanedText.length,
      ocrRequired: material.ocrRequired,
      ocrStatus: material.ocrStatus,
    };
  } finally {
    if (input.metadata.sourceUploadId) {
      await cleanupCompletedChunkUpload(input.metadata.sourceUploadId);
    }
  }
};

export const externalExtractionService: FlashlyExtractionService = {
  determineOcrRequirement: determineExternalOcrRequirement,
  extractTextPreview: createExtractionLifecycle,
  mode: "external",
  prepareExtractionJob: createExtractionLifecycle,
  validateReadiness: () => ({ ok: true }),
};
