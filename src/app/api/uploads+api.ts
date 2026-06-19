import type { CreateUploadRequest } from "@/api/contracts";
import { validationError } from "@/api/server/apiErrors";
import { requireBackendAuth } from "@/api/server/auth";
import { checkUploadEntitlement } from "@/api/server/entitlements";
import { uploadRepository } from "@/api/server/repositories";
import { jsonApiError, jsonRouteError, jsonSuccess, readJsonBody } from "@/api/server/responses";
import { storageService } from "@/api/server/storage";
import { validateCreateUploadRequest } from "@/api/server/uploadValidation";

export async function POST(request: Request) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  const body = await readJsonBody<CreateUploadRequest>(request);

  if (!body) {
    return jsonApiError(validationError("Upload metadata is required."));
  }

  const validation = validateCreateUploadRequest(body);

  if (!validation.ok) {
    return jsonApiError(validation.error);
  }

  try {
    const entitlement = await checkUploadEntitlement({
      fileSize: validation.metadata.fileSize,
      userId: auth.context.userId,
    });

    if (!entitlement.ok) {
      return jsonApiError(entitlement.error);
    }

    const preparedStorage = storageService.prepareUpload({
      ...validation.metadata,
      idempotencyKey: body.idempotencyKey,
    });

    return jsonSuccess(
      await uploadRepository.createUploadJob(
        body,
        {
          ...validation.metadata,
          storageKey: preparedStorage.storageKey,
        },
        { userId: auth.context.userId },
      ),
      { status: 201 },
    );
  } catch (error) {
    return jsonRouteError(error);
  }
}
