import * as FileSystem from "expo-file-system/legacy";

import { apiRequest } from "@/api/client";
import type {
  CompleteChunkedUploadRequest,
  CompleteChunkedUploadResponse,
  StartChunkedUploadRequest,
  StartChunkedUploadResponse,
  UploadChunkPartRequest,
  UploadChunkPartResponse,
} from "@/api/contracts";
import { MAX_CHUNKED_UPLOAD_BYTES, SAFE_BASE64_CHUNK_BYTES } from "@/api/contracts";

export type ChunkedUploadProgress = {
  uploadedChunks: number;
  totalChunks: number;
  percent: number;
};

export class ChunkedUploadError extends Error {
  chunkIndex?: number;
  totalChunks?: number;

  constructor(message: string, metadata?: { chunkIndex?: number; totalChunks?: number }) {
    super(message);
    this.name = "ChunkedUploadError";
    this.chunkIndex = metadata?.chunkIndex;
    this.totalChunks = metadata?.totalChunks;
  }
}

const BASE64_CHARS_PER_CHUNK = (SAFE_BASE64_CHUNK_BYTES / 3) * 4;

const stripBase64DataUrlPrefix = (sourceBase64: string) => {
  const trimmed = sourceBase64.trim();
  const commaIndex = trimmed.indexOf(",");

  if (/^data:[^,]*;base64,/i.test(trimmed) && commaIndex !== -1) {
    return trimmed.slice(commaIndex + 1);
  }

  return trimmed;
};

export const uploadLargeFileInChunks = async ({
  fileName,
  fileSize,
  fileUri,
  mimeType,
  onAssembling,
  onProgress,
  storageKey,
}: {
  fileName: string;
  fileSize: number;
  fileUri: string;
  mimeType: string;
  onAssembling?: () => void;
  onProgress?: (progress: ChunkedUploadProgress) => void;
  storageKey?: string;
}): Promise<CompleteChunkedUploadResponse> => {
  if (fileSize <= 0 || fileSize > MAX_CHUNKED_UPLOAD_BYTES) {
    throw new ChunkedUploadError(`Chunked uploads support files up to ${MAX_CHUNKED_UPLOAD_BYTES} bytes.`);
  }

  let fileBase64: string;

  try {
    fileBase64 = stripBase64DataUrlPrefix(
      await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      }),
    ).replace(/\s/g, "");
  } catch {
    throw new ChunkedUploadError("Flashly could not read this large file from the device. Please choose it again and try once more.");
  }

  const totalChunks = Math.ceil(fileBase64.length / BASE64_CHARS_PER_CHUNK);

  const start = await apiRequest<StartChunkedUploadResponse, StartChunkedUploadRequest>("/api/uploads/chunk/start", {
    method: "POST",
    body: {
      fileName,
      fileSize,
      mimeType,
      storageKey,
      totalChunks,
    },
    debugLabel: "startChunkedUpload",
    debugMeta: {
      fileName,
      fileSize,
      mimeType,
      totalChunks,
    },
  });

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const chunkBase64 = fileBase64.slice(
      chunkIndex * BASE64_CHARS_PER_CHUNK,
      (chunkIndex + 1) * BASE64_CHARS_PER_CHUNK,
    );

    try {
      await apiRequest<UploadChunkPartResponse, UploadChunkPartRequest>("/api/uploads/chunk/part", {
        method: "POST",
        body: {
          uploadId: start.uploadId,
          chunkIndex,
          totalChunks,
          chunkBase64,
        },
        debugLabel: "uploadChunkPart",
        debugMeta: {
          chunkIndex,
          totalChunks,
          uploadId: start.uploadId,
        },
      });
    } catch {
      throw new ChunkedUploadError(`Upload failed while sending part ${chunkIndex + 1} of ${totalChunks}. Please try again.`, {
        chunkIndex,
        totalChunks,
      });
    }

    onProgress?.({
      uploadedChunks: chunkIndex + 1,
      totalChunks,
      percent: Math.round(((chunkIndex + 1) / totalChunks) * 100),
    });
  }

  onAssembling?.();

  try {
    return await apiRequest<CompleteChunkedUploadResponse, CompleteChunkedUploadRequest>("/api/uploads/chunk/complete", {
      method: "POST",
      body: {
        uploadId: start.uploadId,
      },
      debugLabel: "completeChunkedUpload",
      debugMeta: {
        totalChunks,
        uploadId: start.uploadId,
      },
    });
  } catch {
    throw new ChunkedUploadError("We couldn't assemble this file. Please try again.");
  }
};
