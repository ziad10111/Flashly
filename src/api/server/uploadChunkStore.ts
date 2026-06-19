import type {
  CompleteChunkedUploadResponse,
  StartChunkedUploadRequest,
  StartChunkedUploadResponse,
  UploadChunkPartRequest,
  UploadChunkPartResponse,
} from "@/api/contracts";
import { MAX_CHUNKED_UPLOAD_BYTES, MAX_DIRECT_UPLOAD_BYTES, UPLOAD_CHUNK_SIZE_BYTES } from "@/api/contracts";
import { storageService } from "@/api/server/storage";
import type { StoredStorageObject } from "@/api/server/storage";
import { ALLOWED_UPLOAD_EXTENSIONS, ALLOWED_UPLOAD_MIME_TYPES } from "./uploadLimits";
import { validationError, unsupportedMediaError, notFoundError } from "./apiErrors";
import { FLASHLY_DATA_MODE } from "./config";
import { queryPostgres } from "./database";
import { ensureDatabaseUser } from "./repositories/database/utils";

type NodeFsPromisesModule = {
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  readFile: (path: string, encoding: "utf8") => Promise<string>;
  readdir: (path: string) => Promise<string[]>;
  rm: (path: string, options?: { force?: boolean; recursive?: boolean }) => Promise<void>;
  stat: (path: string) => Promise<{ mtimeMs: number }>;
  writeFile: (path: string, data: string, encoding: "utf8") => Promise<void>;
};

type UploadChunkMetadata = {
  createdAt: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: "uploading" | "complete";
  storageKey?: string;
  totalChunks: number;
  userId: string;
};

export class ChunkUploadValidationError extends Error {
  error = validationError(this.message);
}

export class ChunkUploadUnsupportedMediaError extends Error {
  error = unsupportedMediaError(this.message);
}

export class ChunkUploadNotFoundError extends Error {
  error = notFoundError(this.message);
}

const TEMP_UPLOAD_ROOT = ".tmp/flashly-uploads";
const STALE_UPLOAD_AGE_MS = 24 * 60 * 60 * 1000;
const allowedExtensions = new Set<string>(ALLOWED_UPLOAD_EXTENSIONS);
const allowedMimeTypes = new Set<string>(ALLOWED_UPLOAD_MIME_TYPES);

const isDevelopmentRuntime = () => typeof __DEV__ !== "undefined" && __DEV__;

const getFs = async () => {
  const importFs = Function("return import('node:fs/promises')") as () => Promise<NodeFsPromisesModule>;
  return importFs();
};

const normalizeFileName = (fileName: string) =>
  fileName
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160) || "upload";

const getExtension = (fileName: string) => fileName.split(".").pop()?.toLowerCase() ?? "";

const createUploadId = () => {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `chunk-${randomId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
};

const isSafeUploadId = (uploadId: string) => /^chunk-[a-zA-Z0-9_-]{12,96}$/.test(uploadId);

const uploadDir = (uploadId: string) => `${TEMP_UPLOAD_ROOT}/${uploadId}`;

const metadataPath = (uploadId: string) => `${uploadDir(uploadId)}/metadata.json`;

const chunkPath = (uploadId: string, chunkIndex: number) => `${uploadDir(uploadId)}/chunk-${chunkIndex}.base64`;

const assembledPath = (uploadId: string) => `${uploadDir(uploadId)}/assembled.base64`;

const isBase64Like = (value: string) => /^[A-Za-z0-9+/]+={0,2}$/.test(value);

const isSafeStorageKey = (storageKey: string) =>
  /^(mock\/uploads|uploads)\/[a-zA-Z0-9._/-]{6,240}$/.test(storageKey) && !storageKey.includes("..");

const getBase64ByteLength = (sourceBase64: string) => {
  const normalized = sourceBase64.replace(/\s/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;

  return Math.floor((normalized.length * 3) / 4) - padding;
};

const logChunkEvent = (event: string, metadata: Record<string, unknown>) => {
  if (!isDevelopmentRuntime()) {
    return;
  }

  console.info(`[Flashly Chunk Upload] ${event}`, metadata);
};

const cleanupStaleUploads = async () => {
  const fs = await getFs();

  try {
    await fs.mkdir(TEMP_UPLOAD_ROOT, { recursive: true });
    const entries = await fs.readdir(TEMP_UPLOAD_ROOT);
    const now = Date.now();

    await Promise.all(
      entries.map(async (entry) => {
        if (!isSafeUploadId(entry)) {
          return;
        }

        const directory = uploadDir(entry);

        try {
          const stats = await fs.stat(directory);

          if (now - stats.mtimeMs > STALE_UPLOAD_AGE_MS) {
            await fs.rm(directory, { force: true, recursive: true });
          }
        } catch {
          // Best-effort cleanup only.
        }
      }),
    );
  } catch {
    // Temp cleanup should never block a valid upload.
  }
};

const readMetadata = async (uploadId: string): Promise<UploadChunkMetadata> => {
  if (!isSafeUploadId(uploadId)) {
    throw new ChunkUploadValidationError("Invalid upload id.");
  }

  try {
    const fs = await getFs();
    return JSON.parse(await fs.readFile(metadataPath(uploadId), "utf8")) as UploadChunkMetadata;
  } catch {
    throw new ChunkUploadNotFoundError("Chunked upload was not found. Please start the upload again.");
  }
};

const assertChunkOwner = (metadata: UploadChunkMetadata, userId: string) => {
  if (metadata.userId !== userId) {
    throw new ChunkUploadNotFoundError("Chunked upload was not found. Please start the upload again.");
  }
};

const writeMetadata = async (uploadId: string, metadata: UploadChunkMetadata) => {
  const fs = await getFs();
  await fs.writeFile(metadataPath(uploadId), JSON.stringify(metadata), "utf8");
};

const markCloudChunkUploadDurable = async (
  metadata: UploadChunkMetadata,
  storedObject: StoredStorageObject | undefined,
  userId: string,
) => {
  if (FLASHLY_DATA_MODE !== "database" || !storedObject?.storageKey) {
    return;
  }

  const user = await ensureDatabaseUser(userId);
  const storageMetadata = {
    cloudUploadCompletedAt: new Date().toISOString(),
    contentType: storedObject.contentType ?? metadata.mimeType,
    originalName: metadata.fileName,
    sizeBytes: storedObject.sizeBytes ?? metadata.fileSize,
    storageMode: storageService.mode,
    storageProvider: "s3",
  };

  await queryPostgres(
    `
      UPDATE uploads
      SET storage_key = $3,
          status = 'processing',
          stage = 'assembling',
          progress_percentage = GREATEST(progress_percentage, 30),
          metadata = metadata || $4::jsonb,
          updated_at = now()
      WHERE user_id = $1 AND storage_key = $2
    `,
    [user.id, metadata.storageKey, storedObject.storageKey, JSON.stringify(storageMetadata)],
  );

  await queryPostgres(
    `
      UPDATE materials
      SET storage_key = $3,
          metadata = metadata || $4::jsonb,
          updated_at = now()
      WHERE user_id = $1 AND storage_key = $2
    `,
    [user.id, metadata.storageKey, storedObject.storageKey, JSON.stringify(storageMetadata)],
  );
};

export const readCompletedChunkUploadBase64 = async (uploadId: string, userId: string) => {
  const metadata = await readMetadata(uploadId);
  assertChunkOwner(metadata, userId);

  if (metadata.status !== "complete") {
    throw new ChunkUploadValidationError("Chunked upload is not assembled yet.");
  }

  const fs = await getFs();
  const sourceBase64 = (await fs.readFile(assembledPath(uploadId), "utf8")).trim().replace(/\s/g, "");

  if (getBase64ByteLength(sourceBase64) !== metadata.fileSize) {
    throw new ChunkUploadValidationError("Assembled upload size no longer matches the original file.");
  }

  return {
    fileName: metadata.fileName,
    fileSize: metadata.fileSize,
    mimeType: metadata.mimeType,
    sourceBase64,
  };
};

export const cleanupCompletedChunkUpload = async (uploadId: string) => {
  if (!isSafeUploadId(uploadId)) {
    return;
  }

  const fs = await getFs();
  await fs.rm(uploadDir(uploadId), { force: true, recursive: true });
};

export const startChunkedUpload = async (
  request: StartChunkedUploadRequest,
  userId: string,
): Promise<StartChunkedUploadResponse> => {
  const fileName = normalizeFileName(request.fileName);
  const mimeType = request.mimeType.toLowerCase();
  const extension = getExtension(fileName);

  if (!fileName) {
    throw new ChunkUploadValidationError("fileName is required.");
  }

  if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(mimeType)) {
    throw new ChunkUploadUnsupportedMediaError("Chunked upload supports PDF, TXT, MD, JPG, and PNG files.");
  }

  if (!Number.isSafeInteger(request.fileSize) || request.fileSize <= 0 || request.fileSize > MAX_CHUNKED_UPLOAD_BYTES) {
    throw new ChunkUploadValidationError(`fileSize must be between 1 byte and ${MAX_CHUNKED_UPLOAD_BYTES} bytes.`);
  }

  if (!Number.isSafeInteger(request.totalChunks) || request.totalChunks <= 0 || request.totalChunks > 100) {
    throw new ChunkUploadValidationError("totalChunks must be between 1 and 100.");
  }

  if (request.storageKey !== undefined && !isSafeStorageKey(request.storageKey)) {
    throw new ChunkUploadValidationError("storageKey is invalid.");
  }

  await cleanupStaleUploads();

  const fs = await getFs();
  const uploadId = createUploadId();
  const metadata: UploadChunkMetadata = {
    createdAt: new Date().toISOString(),
    fileName,
    fileSize: request.fileSize,
    mimeType,
    status: "uploading",
    storageKey: request.storageKey,
    totalChunks: request.totalChunks,
    userId,
  };

  await fs.mkdir(uploadDir(uploadId), { recursive: true });
  await fs.writeFile(metadataPath(uploadId), JSON.stringify(metadata), "utf8");

  logChunkEvent("start", {
    fileName,
    fileSize: request.fileSize,
    mimeType,
    totalChunks: request.totalChunks,
    uploadId,
  });

  return { uploadId };
};

export const receiveChunkPart = async (
  request: UploadChunkPartRequest,
  userId: string,
): Promise<UploadChunkPartResponse> => {
  const metadata = await readMetadata(request.uploadId);
  assertChunkOwner(metadata, userId);

  if (request.totalChunks !== metadata.totalChunks) {
    throw new ChunkUploadValidationError("totalChunks does not match this upload.");
  }

  if (!Number.isSafeInteger(request.chunkIndex) || request.chunkIndex < 0 || request.chunkIndex >= metadata.totalChunks) {
    throw new ChunkUploadValidationError("chunkIndex is outside the expected range.");
  }

  const chunkBase64 = request.chunkBase64.trim().replace(/\s/g, "");

  if (!chunkBase64 || !isBase64Like(chunkBase64)) {
    throw new ChunkUploadValidationError("chunkBase64 must be valid base64 content.");
  }

  const decodedSize = getBase64ByteLength(chunkBase64);

  if (decodedSize <= 0 || decodedSize > UPLOAD_CHUNK_SIZE_BYTES) {
    throw new ChunkUploadValidationError(`Each upload chunk must decode to between 1 byte and ${UPLOAD_CHUNK_SIZE_BYTES} bytes.`);
  }

  const fs = await getFs();
  await fs.writeFile(chunkPath(request.uploadId, request.chunkIndex), chunkBase64, "utf8");

  logChunkEvent("part", {
    chunkIndex: request.chunkIndex,
    decodedSize,
    totalChunks: metadata.totalChunks,
    uploadId: request.uploadId,
  });

  return {
    received: true,
    chunkIndex: request.chunkIndex,
  };
};

export const completeChunkedUpload = async (
  uploadId: string,
  userId: string,
): Promise<CompleteChunkedUploadResponse> => {
  const metadata = await readMetadata(uploadId);
  assertChunkOwner(metadata, userId);
  const fs = await getFs();
  const chunks: string[] = [];
  let assembledSize = 0;

  for (let chunkIndex = 0; chunkIndex < metadata.totalChunks; chunkIndex += 1) {
    let chunkBase64: string;

    try {
      chunkBase64 = (await fs.readFile(chunkPath(uploadId, chunkIndex), "utf8")).trim().replace(/\s/g, "");
    } catch {
      throw new ChunkUploadValidationError(`Missing upload chunk ${chunkIndex + 1} of ${metadata.totalChunks}.`);
    }

    assembledSize += getBase64ByteLength(chunkBase64);
    chunks.push(chunkBase64);
  }

  if (assembledSize !== metadata.fileSize) {
    throw new ChunkUploadValidationError("Assembled file size did not match the original upload.");
  }

  const sourceBase64 = chunks.join("");
  const completedMetadata: UploadChunkMetadata = {
    ...metadata,
    status: "complete",
  };

  await fs.writeFile(assembledPath(uploadId), sourceBase64, "utf8");
  await writeMetadata(uploadId, completedMetadata);

  const storedObject =
    storageService.mode === "cloud" && storageService.storeObject && metadata.storageKey
      ? await storageService.storeObject({
          contentBase64: sourceBase64,
          contentType: metadata.mimeType,
          fileName: metadata.fileName,
          metadata: {
            "flashly-source": "chunk-upload",
            "flashly-upload-id": uploadId,
          },
          sizeBytes: metadata.fileSize,
          storageKey: metadata.storageKey,
        })
      : undefined;

  await markCloudChunkUploadDurable(metadata, storedObject, userId);

  await Promise.all(
    Array.from({ length: metadata.totalChunks }, async (_item, chunkIndex) => {
      await fs.rm(chunkPath(uploadId, chunkIndex), { force: true });
    }),
  );

  logChunkEvent("complete", {
    assembledSize,
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    totalChunks: metadata.totalChunks,
    uploadId,
  });

  return {
    contentType: metadata.mimeType,
    fileName: metadata.fileName,
    fileSize: metadata.fileSize,
    mimeType: metadata.mimeType,
    originalName: metadata.fileName,
    sizeBytes: storedObject?.sizeBytes ?? metadata.fileSize,
    sourceBase64: metadata.fileSize <= MAX_DIRECT_UPLOAD_BYTES ? sourceBase64 : undefined,
    sourceUploadId: uploadId,
    storageKey: storedObject?.storageKey ?? metadata.storageKey,
    storageProvider: storedObject ? "s3" : "local",
    storageUrl: storedObject?.publicUrl,
  };
};
