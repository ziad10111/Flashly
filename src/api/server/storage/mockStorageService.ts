import type { FlashlyStorageService, PrepareStorageUploadInput } from "./types";

const hashString = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
};

const sanitizeKeyPart = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80);

export const createMockStorageKey = (input: PrepareStorageUploadInput) => {
  const safeKey = sanitizeKeyPart(input.idempotencyKey) || hashString(input.fileName);
  const fileHash = hashString(`${input.fileName}:${input.fileSize ?? 0}:${input.mimeType ?? ""}`);

  return `mock/uploads/${safeKey}/${fileHash}`;
};

export const mockStorageService: FlashlyStorageService = {
  createStorageKey: createMockStorageKey,
  mode: "local",
  prepareUpload: (input) => ({
    storageKey: createMockStorageKey(input),
  }),
  storeObject: async (input) => ({
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    storageKey: input.storageKey,
  }),
  validateReadiness: () => ({ ok: true }),
};
