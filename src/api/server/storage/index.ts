import { FLASHLY_STORAGE_MODE } from "../config";
import { mockStorageService } from "./mockStorageService";
import { s3StorageService } from "./s3StorageService";

export type {
  FlashlyStorageService,
  PreparedStorageUpload,
  PrepareStorageUploadInput,
  ReadStorageObjectResult,
  StorageObjectMetadata,
  StorageReadinessResult,
  StorageReadReference,
  StorageSignedUploadUrl,
  StoredStorageObject,
  StoreStorageObjectInput,
} from "./types";
export { isStorageServiceNotConfiguredError, StorageServiceNotConfiguredError } from "./types";
export { externalStorageService } from "./externalStorageService";
export { mockStorageService } from "./mockStorageService";
export { s3StorageService } from "./s3StorageService";

export const storageService =
  FLASHLY_STORAGE_MODE === "cloud" ? s3StorageService : mockStorageService;
