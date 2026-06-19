import { requireBackendAuth } from "@/api/server/auth";
import { validationError } from "@/api/server/apiErrors";
import { assertUploadAccess } from "@/api/server/ownership";
import { uploadRepository } from "@/api/server/repositories";
import { jsonApiError, jsonRouteError, jsonSuccess } from "@/api/server/responses";

export async function GET(request: Request, { id }: { id: string }) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  if (!id) {
    return jsonApiError(validationError("upload job id is required."));
  }

  const access = await assertUploadAccess(auth.context, id);

  if (!access.ok) {
    return access.response;
  }

  try {
    return jsonSuccess(await uploadRepository.getUploadStatus(id, { userId: auth.context.userId }));
  } catch (error) {
    return jsonRouteError(error);
  }
}
