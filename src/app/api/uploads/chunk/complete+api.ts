import type { CompleteChunkedUploadRequest } from "@/api/contracts";
import { validationError } from "@/api/server/apiErrors";
import { requireBackendAuth } from "@/api/server/auth";
import { jsonApiError, jsonRouteError, jsonSuccess, readJsonBody } from "@/api/server/responses";
import {
  ChunkUploadNotFoundError,
  ChunkUploadUnsupportedMediaError,
  ChunkUploadValidationError,
  completeChunkedUpload,
} from "@/api/server/uploadChunkStore";

const jsonChunkError = (error: unknown) => {
  if (
    error instanceof ChunkUploadValidationError ||
    error instanceof ChunkUploadUnsupportedMediaError ||
    error instanceof ChunkUploadNotFoundError
  ) {
    return jsonApiError(error.error);
  }

  return jsonRouteError(error);
};

export async function POST(request: Request) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readJsonBody<CompleteChunkedUploadRequest>(request);

  if (!body) {
    return jsonApiError(validationError("uploadId is required."));
  }

  try {
    return jsonSuccess(await completeChunkedUpload(body.uploadId, auth.context.userId));
  } catch (error) {
    return jsonChunkError(error);
  }
}
