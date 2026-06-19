export type FlashlyDataMode = "mock" | "database";
export type FlashlyExtractionMode = "mock" | "external";
export type FlashlyAiProvider = "gemini" | "nvidia" | "openai";
export type FlashlyGenerationMode = "mock" | "external";
export type FlashlyOcrProvider = "ocrspace";
export type FlashlyPdfExtractionProvider = "local";
export type FlashlyStorageMode = "local" | "cloud";
export type FlashlyStorageProvider = "s3";
export type FlashlyBillingMode = "mock" | "revenuecat";
export type FlashlyAuthMode = "mock" | "clerk";

export const FLASHLY_DATA_MODE: FlashlyDataMode =
  process.env.FLASHLY_DATA_MODE === "database" ? "database" : "mock";

export const FLASHLY_AUTH_MODE: FlashlyAuthMode =
  process.env.EXPO_PUBLIC_FLASHLY_AUTH_MODE === "clerk" ? "clerk" : "mock";

export const FLASHLY_EXTRACTION_MODE: FlashlyExtractionMode =
  process.env.FLASHLY_EXTRACTION_MODE === "external" ? "external" : "mock";

export const FLASHLY_GENERATION_MODE: FlashlyGenerationMode =
  process.env.FLASHLY_GENERATION_MODE === "external" ? "external" : "mock";

const rawStorageMode = process.env.FLASHLY_STORAGE_MODE?.trim().toLowerCase();

export const FLASHLY_STORAGE_MODE: FlashlyStorageMode =
  rawStorageMode === "cloud" || rawStorageMode === "external" ? "cloud" : "local";

export const FLASHLY_STORAGE_PROVIDER: FlashlyStorageProvider | undefined =
  process.env.FLASHLY_STORAGE_PROVIDER?.trim().toLowerCase() === "s3" ? "s3" : undefined;

export const FLASHLY_S3_ENDPOINT = process.env.FLASHLY_S3_ENDPOINT?.trim();

export const FLASHLY_S3_REGION = process.env.FLASHLY_S3_REGION?.trim();

export const FLASHLY_S3_BUCKET = process.env.FLASHLY_S3_BUCKET?.trim();

export const FLASHLY_S3_ACCESS_KEY_ID = process.env.FLASHLY_S3_ACCESS_KEY_ID?.trim();

export const FLASHLY_S3_SECRET_ACCESS_KEY = process.env.FLASHLY_S3_SECRET_ACCESS_KEY?.trim();

export const FLASHLY_S3_PUBLIC_BASE_URL = process.env.FLASHLY_S3_PUBLIC_BASE_URL?.trim();

export const FLASHLY_AI_PROVIDER = process.env.FLASHLY_AI_PROVIDER?.trim();

export const FLASHLY_AI_API_KEY = process.env.FLASHLY_AI_API_KEY?.trim();

export const FLASHLY_AI_MODEL = process.env.FLASHLY_AI_MODEL?.trim();

export const FLASHLY_AI_BASE_URL = process.env.FLASHLY_AI_BASE_URL?.trim();

export const FLASHLY_OCR_PROVIDER = process.env.FLASHLY_OCR_PROVIDER?.trim();

export const FLASHLY_OCR_API_KEY = process.env.FLASHLY_OCR_API_KEY?.trim();

export const FLASHLY_OCR_API_URL =
  process.env.FLASHLY_OCR_API_URL?.trim() || "https://api.ocr.space/parse/image";

export const FLASHLY_OCR_TIMEOUT_MS = Number(process.env.FLASHLY_OCR_TIMEOUT_MS ?? 20_000);

export const FLASHLY_PDF_EXTRACTION_PROVIDER =
  process.env.FLASHLY_PDF_EXTRACTION_PROVIDER?.trim() || "local";

export const DATABASE_URL = process.env.DATABASE_URL?.trim();

export const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY?.trim();

export const FLASHLY_BILLING_MODE: FlashlyBillingMode =
  process.env.FLASHLY_BILLING_MODE?.trim().toLowerCase() === "revenuecat" ? "revenuecat" : "mock";

export const REVENUECAT_WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET?.trim();

export const REVENUECAT_PROJECT_ID = process.env.REVENUECAT_PROJECT_ID?.trim();

export const REVENUECAT_API_KEY = process.env.REVENUECAT_API_KEY?.trim();
