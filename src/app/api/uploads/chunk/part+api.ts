import type { UploadChunkPartRequest } from "@/api/contracts";
import { validationError } from "@/api/server/apiErrors";
import { requireBackendAuth } from "@/api/server/auth";
import { jsonApiError, jsonRouteError, jsonSuccess, readJsonBody } from "@/api/server/responses";
import {
  ChunkUploadNotFoundError,
  ChunkUploadUnsupportedMediaError,
  ChunkUploadValidationError,
  receiveChunkPart,
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

  const body = await readJsonBody<UploadChunkPartRequest>(request);

  if (!body) {
    return jsonApiError(validationError("Upload chunk is required."));
  }

  try {
    return jsonSuccess(await receiveChunkPart(body, auth.context.userId));
  } catch (error) {
    return jsonChunkError(error);
  }
}
