import type { DeckDTO } from "@/api/contracts";
import type { FlashlyStorageMode } from "../config";

export type StorageReadinessResult =
  | {
      ok: true;
    }
  | {
      message: string;
      ok: false;
    };

export type PrepareStorageUploadInput = {
  extension: string;
  fileName: string;
  fileSize?: number;
  idempotencyKey: string;
  mimeType?: string;
  ocrRequired: boolean;
  sourceType: DeckDTO["sourceType"];
};

export type StorageSignedUploadUrl = {
  expiresAt: string;
  headers?: Record<string, string>;
  method: "PUT" | "POST";
  url: string;
};

export type StorageReadReference = {
  storageKey: string;
};

export type StoreStorageObjectInput = {
  contentBase64?: string;
  contentType?: string;
  fileName: string;
  metadata?: Record<string, string | undefined>;
  sizeBytes?: number;
  storageKey: string;
  textContent?: string;
};

export type StoredStorageObject = {
  contentType?: string;
  publicUrl?: string;
  sizeBytes?: number;
  storageKey: string;
};

export type StorageObjectMetadata = {
  contentLength?: number;
  contentType?: string;
  exists: boolean;
  storageKey: string;
};

export type ReadStorageObjectResult = {
  contentBase64: string;
  contentType?: string;
  sizeBytes: number;
  storageKey: string;
  textContent?: string;
};

export type PreparedStorageUpload = {
  downloadRef?: StorageReadReference;
  publicUrl?: string;
  storageKey: string;
  uploadUrl?: StorageSignedUploadUrl;
};

export type FlashlyStorageService = {
  createStorageKey: (input: PrepareStorageUploadInput) => string;
  mode: FlashlyStorageMode;
  prepareUpload: (input: PrepareStorageUploadInput) => PreparedStorageUpload;
  deleteObject?: (storageKey: string) => Promise<void>;
  headObject?: (storageKey: string) => Promise<StorageObjectMetadata>;
  readObject?: (storageKey: string) => Promise<ReadStorageObjectResult>;
  storeObject?: (input: StoreStorageObjectInput) => Promise<StoredStorageObject>;
  validateReadiness: () => StorageReadinessResult;
};

export class StorageServiceNotConfiguredError extends Error {
  constructor(operation: string) {
    super(
      `Storage operation "${operation}" is not configured. Set FLASHLY_STORAGE_MODE=local for temporary local uploads or configure cloud storage.`,
    );
    this.name = "StorageServiceNotConfiguredError";
  }
}

export const isStorageServiceNotConfiguredError = (
  error: unknown,
): error is StorageServiceNotConfiguredError => error instanceof StorageServiceNotConfiguredError;
