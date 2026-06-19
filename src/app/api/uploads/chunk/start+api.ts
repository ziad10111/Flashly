import type { StartChunkedUploadRequest } from "@/api/contracts";
import { validationError } from "@/api/server/apiErrors";
import { requireBackendAuth } from "@/api/server/auth";
import { checkUploadEntitlement } from "@/api/server/entitlements";
import { jsonApiError, jsonRouteError, jsonSuccess, readJsonBody } from "@/api/server/responses";
import {
  ChunkUploadNotFoundError,
  ChunkUploadUnsupportedMediaError,
  ChunkUploadValidationError,
  startChunkedUpload,
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

  const body = await readJsonBody<StartChunkedUploadRequest>(request);

  if (!body) {
    return jsonApiError(validationError("Chunk upload metadata is required."));
  }

  try {
    const entitlement = await checkUploadEntitlement({
      fileSize: body.fileSize,
      userId: auth.context.userId,
    });

    if (!entitlement.ok) {
      return jsonApiError(entitlement.error);
    }
  } catch (error) {
    return jsonRouteError(error);
  }

  try {
    return jsonSuccess(await startChunkedUpload(body, auth.context.userId), { status: 201 });
  } catch (error) {
    return jsonChunkError(error);
  }
}
