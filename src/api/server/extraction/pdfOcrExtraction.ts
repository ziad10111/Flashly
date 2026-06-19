import {
  FLASHLY_OCR_API_KEY,
  FLASHLY_OCR_API_URL,
  FLASHLY_OCR_PROVIDER,
  FLASHLY_OCR_TIMEOUT_MS,
} from "../config";
import { MIN_SOURCE_TEXT_INPUT_LENGTH } from "../extractionLimits";
import { ExtractionServiceFailureError } from "./types";

type OcrSpaceParsedResult = {
  ParsedText?: unknown;
};

type OcrSpaceResponse = {
  ErrorMessage?: unknown;
  IsErroredOnProcessing?: unknown;
  ParsedResults?: unknown;
};

type PdfOcrExtractionInput = {
  cleanSourceText: (sourceText: string) => string;
  fileName?: string;
  pageCount: number;
  sourceBase64: string;
};

const PDF_OCR_PAGE_BATCH_SIZE = 5;
const MIN_OCR_PDF_TEXT_LENGTH = 300;
const OCR_DIRECT_PDF_MAX_BYTES = 4 * 1024 * 1024;
const OCR_PAGE_IMAGE_MAX_BYTES = 1.5 * 1024 * 1024;
const OCR_MAX_PAGES_PER_PDF = 60;
const OCR_PAGE_IMAGE_TARGET_WIDTH = 1100;

type NodeZlibModule = {
  deflateSync: (bytes: Uint8Array) => Uint8Array;
  inflateRawSync: (bytes: Uint8Array) => Uint8Array;
  inflateSync: (bytes: Uint8Array) => Uint8Array;
};

type ExtractedPdfImage = {
  bitsPerComponent: number;
  colorSpace: "DeviceGray" | "DeviceRGB";
  height: number;
  pageNumber: number;
  pngBase64: string;
  pngByteLength: number;
  sourceByteLength: number;
  width: number;
};

const isDevelopmentRuntime = () => typeof __DEV__ !== "undefined" && __DEV__;

const getSafeOcrProviderName = () => FLASHLY_OCR_PROVIDER?.toLowerCase();

const getOcrErrorMessage = () =>
  "This scanned PDF needs OCR, but OCR processing failed. Please try again or upload clearer page images.";

const getOcrErrorDetails = (result: OcrSpaceResponse) => {
  if (typeof result.ErrorMessage === "string") {
    return result.ErrorMessage;
  }

  if (Array.isArray(result.ErrorMessage)) {
    return result.ErrorMessage.filter((item): item is string => typeof item === "string").join(" ");
  }

  return undefined;
};

const stripBase64DataUrlPrefix = (sourceBase64: string) => {
  const trimmed = sourceBase64.trim();
  const commaIndex = trimmed.indexOf(",");

  if (/^data:[^,]*;base64,/i.test(trimmed) && commaIndex !== -1) {
    return trimmed.slice(commaIndex + 1);
  }

  return trimmed;
};

const getBase64ByteLength = (sourceBase64: string) => {
  const normalized = stripBase64DataUrlPrefix(sourceBase64).replace(/\s/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;

  return Math.floor((normalized.length * 3) / 4) - padding;
};

const decodeBase64ToBytes = (sourceBase64: string) => {
  const binary = atob(stripBase64DataUrlPrefix(sourceBase64).replace(/\s/g, ""));
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

const inflatePdfStream = async (bytes: Uint8Array) => {
  const zlib = await getNodeZlib();

  if (!zlib) {
    throw new ExtractionServiceFailureError(
      "processing-failed",
      "PDF OCR could not access backend deflate support for scanned page images.",
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

const readPdfDictionaryNumber = (dictionary: string, key: string) => {
  const match = dictionary.match(new RegExp(`/${key}\\s+(\\d+)`));

  return match ? Number.parseInt(match[1], 10) : null;
};

const readPdfDictionaryName = (dictionary: string, key: string) => {
  const match = dictionary.match(new RegExp(`/${key}\\s+/([A-Za-z0-9]+)`));

  return match?.[1] ?? null;
};

const isSupportedImageDictionary = (dictionary: string) => {
  const subtype = readPdfDictionaryName(dictionary, "Subtype");
  const filter = readPdfDictionaryName(dictionary, "Filter");
  const colorSpace = readPdfDictionaryName(dictionary, "ColorSpace");
  const bitsPerComponent = readPdfDictionaryNumber(dictionary, "BitsPerComponent");
  const width = readPdfDictionaryNumber(dictionary, "Width");
  const height = readPdfDictionaryNumber(dictionary, "Height");

  return (
    subtype === "Image" &&
    filter === "FlateDecode" &&
    (colorSpace === "DeviceRGB" || colorSpace === "DeviceGray") &&
    bitsPerComponent === 8 &&
    Boolean(width && height)
  );
};

const makeCrcTable = () => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
};

const crcTable = makeCrcTable();

const crc32 = (bytes: Uint8Array) => {
  let value = 0xffffffff;

  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }

  return (value ^ 0xffffffff) >>> 0;
};

const writeUint32 = (value: number) => {
  const bytes = new Uint8Array(4);
  bytes[0] = (value >>> 24) & 0xff;
  bytes[1] = (value >>> 16) & 0xff;
  bytes[2] = (value >>> 8) & 0xff;
  bytes[3] = value & 0xff;
  return bytes;
};

const asciiBytes = (value: string) => new Uint8Array([...value].map((char) => char.charCodeAt(0)));

const concatBytes = (parts: Uint8Array[]) => {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
};

const createPngChunk = (type: string, data: Uint8Array) => {
  const typeBytes = asciiBytes(type);
  const crcInput = concatBytes([typeBytes, data]);

  return concatBytes([writeUint32(data.byteLength), typeBytes, data, writeUint32(crc32(crcInput))]);
};

const rgbToGrayscale = ({
  colorSpace,
  data,
  height,
  targetHeight,
  targetWidth,
  width,
}: {
  colorSpace: ExtractedPdfImage["colorSpace"];
  data: Uint8Array;
  height: number;
  targetHeight: number;
  targetWidth: number;
  width: number;
}) => {
  const bytesPerPixel = colorSpace === "DeviceRGB" ? 3 : 1;
  const output = new Uint8Array(targetWidth * targetHeight);

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor((y * height) / targetHeight));

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor((x * width) / targetWidth));
      const sourceIndex = (sourceY * width + sourceX) * bytesPerPixel;

      if (colorSpace === "DeviceGray") {
        output[y * targetWidth + x] = data[sourceIndex];
      } else {
        const red = data[sourceIndex];
        const green = data[sourceIndex + 1];
        const blue = data[sourceIndex + 2];
        output[y * targetWidth + x] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
      }
    }
  }

  return output;
};

const encodeGrayscalePng = async ({
  colorSpace,
  data,
  height,
  width,
}: {
  colorSpace: ExtractedPdfImage["colorSpace"];
  data: Uint8Array;
  height: number;
  width: number;
}) => {
  const zlib = await getNodeZlib();

  if (!zlib) {
    throw new ExtractionServiceFailureError(
      "processing-failed",
      "PDF OCR could not access backend compression support for page images.",
      true,
    );
  }

  const scale = width > OCR_PAGE_IMAGE_TARGET_WIDTH ? OCR_PAGE_IMAGE_TARGET_WIDTH / width : 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const grayscale = rgbToGrayscale({ colorSpace, data, height, targetHeight, targetWidth, width });
  const scanlines = new Uint8Array((targetWidth + 1) * targetHeight);

  for (let row = 0; row < targetHeight; row += 1) {
    const scanlineOffset = row * (targetWidth + 1);
    scanlines[scanlineOffset] = 0;
    scanlines.set(grayscale.slice(row * targetWidth, (row + 1) * targetWidth), scanlineOffset + 1);
  }

  const ihdr = new Uint8Array(13);
  ihdr.set(writeUint32(targetWidth), 0);
  ihdr.set(writeUint32(targetHeight), 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = new Uint8Array(zlib.deflateSync(scanlines));

  return concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    createPngChunk("IHDR", ihdr),
    createPngChunk("IDAT", compressed),
    createPngChunk("IEND", new Uint8Array()),
  ]);
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 8192;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  return btoa(binary);
};

const extractPdfPageImages = async (sourceBase64: string) => {
  const bytes = decodeBase64ToBytes(sourceBase64);
  const pdfText = decodeLatin1(bytes);
  const images: ExtractedPdfImage[] = [];
  let searchIndex = 0;

  while (searchIndex < pdfText.length && images.length < OCR_MAX_PAGES_PER_PDF) {
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

    if (!isSupportedImageDictionary(dictionary)) {
      searchIndex = endStreamIndex + "endstream".length;
      continue;
    }

    let streamStart = streamKeywordIndex + "stream".length;

    if (pdfText[streamStart] === "\r" && pdfText[streamStart + 1] === "\n") {
      streamStart += 2;
    } else if (pdfText[streamStart] === "\n" || pdfText[streamStart] === "\r") {
      streamStart += 1;
    }

    const width = readPdfDictionaryNumber(dictionary, "Width");
    const height = readPdfDictionaryNumber(dictionary, "Height");
    const bitsPerComponent = readPdfDictionaryNumber(dictionary, "BitsPerComponent");
    const colorSpace = readPdfDictionaryName(dictionary, "ColorSpace");
    const streamBytes = trimPdfStreamBoundaries(bytes.slice(streamStart, endStreamIndex));

    try {
      const decodedImage = await inflatePdfStream(streamBytes);
      const pngBytes = await encodeGrayscalePng({
        colorSpace: colorSpace === "DeviceGray" ? "DeviceGray" : "DeviceRGB",
        data: decodedImage,
        height: height ?? 1,
        width: width ?? 1,
      });

      images.push({
        bitsPerComponent: bitsPerComponent ?? 8,
        colorSpace: colorSpace === "DeviceGray" ? "DeviceGray" : "DeviceRGB",
        height: height ?? 1,
        pageNumber: images.length + 1,
        pngBase64: bytesToBase64(pngBytes),
        pngByteLength: pngBytes.byteLength,
        sourceByteLength: streamBytes.byteLength,
        width: width ?? 1,
      });
    } catch (error) {
      if (isDevelopmentRuntime()) {
        console.warn("[PDF OCR] page image extraction failed", {
          pageNumber: images.length + 1,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    searchIndex = endStreamIndex + "endstream".length;
  }

  return images;
};

const getParsedResultText = (result: OcrSpaceResponse, cleanSourceText: (sourceText: string) => string) => {
  const parsedResults = Array.isArray(result.ParsedResults) ? result.ParsedResults : [];
  const pageTexts = parsedResults
    .map((item, index) => {
      const parsedText = (item as OcrSpaceParsedResult).ParsedText;

      if (typeof parsedText !== "string") {
        return null;
      }

      const text = cleanSourceText(parsedText);

      if (!text) {
        return null;
      }

      return {
        pageNumber: index + 1,
        text,
      };
    })
    .filter((item): item is { pageNumber: number; text: string } => item !== null);

  const mergedText = cleanSourceText(
    pageTexts
      .map((page) => `--- Page ${page.pageNumber} ---\n${page.text}`)
      .join("\n\n"),
  );

  return {
    mergedText,
    pageTexts,
    parsedResultCount: parsedResults.length,
  };
};

const callOcrSpace = async ({
  body,
  fileName,
  pageCount,
  pageNumber,
  strategy,
}: {
  body: FormData;
  fileName?: string;
  pageCount: number;
  pageNumber?: number;
  strategy: "direct-pdf" | "page-images";
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FLASHLY_OCR_TIMEOUT_MS);

  try {
    const response = await fetch(FLASHLY_OCR_API_URL, {
      body,
      method: "POST",
      signal: controller.signal,
    });

    const result = response.ok ? ((await response.json()) as OcrSpaceResponse) : null;

    return {
      result,
      status: response.status,
    };
  } catch (error) {
    if (isDevelopmentRuntime()) {
      console.warn("[PDF OCR] provider request failed", {
        fileName,
        pageCount,
        pageNumber,
        provider: "ocrspace",
        reason: error instanceof Error ? error.message : String(error),
        strategy,
      });
    }

    return {
      result: null,
      status: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const createOcrSpaceBaseBody = () => {
  const body = new FormData();
  body.append("apikey", FLASHLY_OCR_API_KEY ?? "");
  body.append("language", "eng");
  body.append("scale", "true");
  body.append("isOverlayRequired", "false");
  body.append("OCREngine", "2");

  return body;
};

const ocrDirectPdf = async ({
  cleanSourceText,
  fileName,
  pageCount,
  sourceBase64,
}: PdfOcrExtractionInput) => {
  const body = createOcrSpaceBaseBody();
  body.append("base64Image", `data:application/pdf;base64,${sourceBase64}`);
  body.append("filetype", "PDF");

  const { result, status } = await callOcrSpace({
    body,
    fileName,
    pageCount,
    strategy: "direct-pdf",
  });

  if (status === 413) {
    if (isDevelopmentRuntime()) {
      console.warn("[PDF OCR] Direct PDF OCR rejected with 413; falling back to page OCR", {
        fileName,
        pageCount,
      });
    }

    return {
      failureStatus: status,
      strategyFailure: true,
      text: "",
    };
  }

  if (!result) {
    if (isDevelopmentRuntime()) {
      console.warn("[PDF OCR] direct PDF provider http failure", {
        fileName,
        pageCount,
        status,
      });
    }

    return {
      failureStatus: status,
      strategyFailure: true,
      text: "",
    };
  }

  const providerError = getOcrErrorDetails(result);
  const { mergedText, pageTexts, parsedResultCount } = getParsedResultText(result, cleanSourceText);
  const hasUsableText = mergedText.length >= MIN_OCR_PDF_TEXT_LENGTH;

  if (result.IsErroredOnProcessing === true && !hasUsableText) {
    if (isDevelopmentRuntime()) {
      console.warn("[PDF OCR] direct PDF provider failed", {
        errorMessage: providerError,
        fileName,
        pageCount,
        pagesAttempted: pageCount,
        pagesSucceeded: pageTexts.length,
        parsedResultCount,
        textLength: mergedText.length,
      });
    }

    return {
      failureStatus: status,
      strategyFailure: true,
      text: "",
    };
  }

  return {
    failureStatus: null,
    providerWarning: providerError,
    strategyFailure: false,
    text: mergedText,
    pagesSucceeded: pageTexts.length,
    parsedResultCount,
  };
};

const ocrPageImage = async ({
  cleanSourceText,
  fileName,
  image,
  pageCount,
}: {
  cleanSourceText: (sourceText: string) => string;
  fileName?: string;
  image: ExtractedPdfImage;
  pageCount: number;
}) => {
  const body = createOcrSpaceBaseBody();
  body.append("base64Image", `data:image/png;base64,${image.pngBase64}`);
  body.append("filetype", "PNG");

  const { result, status } = await callOcrSpace({
    body,
    fileName,
    pageCount,
    pageNumber: image.pageNumber,
    strategy: "page-images",
  });

  if (!result) {
    return {
      status,
      text: "",
    };
  }

  const { mergedText } = getParsedResultText(result, cleanSourceText);
  const providerError = getOcrErrorDetails(result);

  if (isDevelopmentRuntime() && result.IsErroredOnProcessing === true && mergedText.length < MIN_SOURCE_TEXT_INPUT_LENGTH) {
    console.warn("[PDF OCR] page image provider warning", {
      errorMessage: providerError,
      pageNumber: image.pageNumber,
      status,
    });
  }

  return {
    status,
    text: mergedText.replace(/^--- Page \d+ ---\n/, ""),
  };
};

const ocrPdfByPageImages = async ({
  cleanSourceText,
  fileName,
  pageCount,
  sourceBase64,
}: PdfOcrExtractionInput) => {
  const images = await extractPdfPageImages(sourceBase64);
  const pageTexts: { pageNumber: number; text: string }[] = [];
  const failedPages: number[] = [];

  if (isDevelopmentRuntime()) {
    console.info("[PDF OCR] page image strategy started", {
      extractedImageCount: images.length,
      fileName,
      pageCount,
      pagesAttempted: images.length,
      strategy: "page-images",
    });
  }

  for (const image of images) {
    if (image.pngByteLength > OCR_PAGE_IMAGE_MAX_BYTES && isDevelopmentRuntime()) {
      console.warn("[PDF OCR] page image exceeds soft target", {
        pageNumber: image.pageNumber,
        pngByteLength: image.pngByteLength,
        targetBytes: OCR_PAGE_IMAGE_MAX_BYTES,
      });
    }

    let result = await ocrPageImage({ cleanSourceText, fileName, image, pageCount });

    if (!result.text && (result.status === 0 || result.status === 429 || result.status >= 500)) {
      result = await ocrPageImage({ cleanSourceText, fileName, image, pageCount });
    }

    if (result.text.length >= MIN_SOURCE_TEXT_INPUT_LENGTH) {
      pageTexts.push({
        pageNumber: image.pageNumber,
        text: result.text,
      });
    } else {
      failedPages.push(image.pageNumber);
    }
  }

  const mergedText = cleanSourceText(
    pageTexts
      .map((page) => `--- Page ${page.pageNumber} ---\n${page.text}`)
      .join("\n\n"),
  );

  if (isDevelopmentRuntime()) {
    console.info("[PDF OCR] page image strategy completed", {
      containsExpectedMcqLikeContent: /(multiple choice|maintenance and reliability|reliability centered maintenance|overall equipment effectiveness|A\.|B\.|C\.|D\.)/i.test(mergedText),
      failedPages,
      mergedTextLength: mergedText.length,
      pagesAttempted: images.length,
      pagesFailed: failedPages.length,
      pagesSucceeded: pageTexts.length,
      strategy: "page-images",
    });
  }

  return mergedText;
};

export const extractScannedPdfWithOcr = async ({
  cleanSourceText,
  fileName,
  pageCount,
  sourceBase64,
}: PdfOcrExtractionInput) => {
  if (getSafeOcrProviderName() !== "ocrspace") {
    if (isDevelopmentRuntime()) {
      console.warn("[Flashly PDF OCR] provider not configured", {
        provider: FLASHLY_OCR_PROVIDER ?? null,
      });
    }

    throw new ExtractionServiceFailureError(
      "not-ready",
      getOcrErrorMessage(),
      true,
    );
  }

  if (!FLASHLY_OCR_API_KEY) {
    if (isDevelopmentRuntime()) {
      console.warn("[Flashly PDF OCR] API key missing");
    }

    throw new ExtractionServiceFailureError(
      "not-ready",
      getOcrErrorMessage(),
      true,
    );
  }

  const startedAt = Date.now();
  const batchCount = Math.max(1, Math.ceil(pageCount / PDF_OCR_PAGE_BATCH_SIZE));
  const pdfByteLength = getBase64ByteLength(sourceBase64);
  const shouldTryDirectPdf = pdfByteLength <= OCR_DIRECT_PDF_MAX_BYTES;

  if (isDevelopmentRuntime()) {
    console.info("[PDF OCR] triggered", {
      batchCount,
      directPdfAttempted: shouldTryDirectPdf,
      fileName,
      fileSize: pdfByteLength,
      pageBatchSize: PDF_OCR_PAGE_BATCH_SIZE,
      pageCount,
      pagesAttempted: pageCount,
      provider: "ocrspace",
      strategy: shouldTryDirectPdf ? "direct-pdf" : "page-images",
    });
  }

  try {
    const directResult = shouldTryDirectPdf
      ? await ocrDirectPdf({ cleanSourceText, fileName, pageCount, sourceBase64 })
      : null;
    let text = directResult?.text ?? "";

    if (isDevelopmentRuntime()) {
      console.info("[PDF OCR] direct PDF result", {
        directPdfAttempted: shouldTryDirectPdf,
        directPdfFailureStatus: directResult?.failureStatus ?? null,
        fallback413Triggered: directResult?.failureStatus === 413,
        finalTextLength: text.length,
        providerWarning: directResult?.providerWarning ?? null,
      });
    }

    if (text.length < MIN_OCR_PDF_TEXT_LENGTH) {
      text = await ocrPdfByPageImages({
        cleanSourceText,
        fileName,
        pageCount,
        sourceBase64,
      });
    }

    if (isDevelopmentRuntime()) {
      console.info("[PDF OCR] completed", {
        batchCount,
        containsExpectedMcqLikeContent: /(multiple choice|maintenance and reliability|reliability centered maintenance|overall equipment effectiveness|A\.|B\.|C\.|D\.)/i.test(text),
        directPdfAttempted: shouldTryDirectPdf,
        durationMs: Date.now() - startedAt,
        finalTextLength: text.length,
        pageCount,
        strategy: directResult?.text && directResult.text.length >= MIN_OCR_PDF_TEXT_LENGTH ? "direct-pdf" : "page-images",
      });
    }

    if (text.length < MIN_SOURCE_TEXT_INPUT_LENGTH) {
      throw new ExtractionServiceFailureError("not-ready", getOcrErrorMessage(), true);
    }

    return text;
  } catch (error) {
    if (error instanceof ExtractionServiceFailureError) {
      throw error;
    }

    if (isDevelopmentRuntime()) {
      console.warn("[PDF OCR] provider request failed", {
        fileName,
        pageCount,
        provider: "ocrspace",
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    throw new ExtractionServiceFailureError("not-ready", getOcrErrorMessage(), true);
  }
};

export const PDF_OCR_TEXT_THRESHOLD = 100;
