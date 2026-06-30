import type { StartGenerationJobRequest } from "@/api/contracts";
import { createApiError, notReadyError } from "@/api/server/apiErrors";
import { requireBackendAuth } from "@/api/server/auth";
import { FLASHLY_DATA_MODE } from "@/api/server/config";
import { checkGenerationEntitlement } from "@/api/server/entitlements";
import { generationService } from "@/api/server/generation";
import { databaseGenerationJobRepository } from "@/api/server/generationJobs/repository";
import { validateStartGenerationJobRequest } from "@/api/server/generationJobs/validation";
import { kickGenerationWorker } from "@/api/server/generationJobs/worker";
import { assertMaterialAccess } from "@/api/server/ownership";
import { jsonApiError, jsonRouteError, jsonSuccess, readJsonBody } from "@/api/server/responses";

export async function POST(request: Request) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  if (FLASHLY_DATA_MODE !== "database") {
    return jsonApiError(
      notReadyError("Persistent generation jobs require FLASHLY_DATA_MODE=database and a configured DATABASE_URL."),
    );
  }

  const body = await readJsonBody<StartGenerationJobRequest>(request);
  const validation = validateStartGenerationJobRequest(body);

  if (!validation.ok) {
    return jsonApiError(validation.error);
  }

  const readiness = generationService.validateReadiness();

  if (!readiness.ok) {
    return jsonApiError(notReadyError(readiness.message));
  }

  const access = await assertMaterialAccess(auth.context, validation.request.materialId ?? validation.request.sourceId ?? "");

  if (!access.ok) {
    return access.response;
  }

  const entitlement = await checkGenerationEntitlement({
    createsDeck: true,
    requestedCardCount: validation.request.requestedCardCount,
    userId: auth.context.userId,
  });

  if (!entitlement.ok) {
    return jsonApiError(entitlement.error);
  }

  try {
    const job = await databaseGenerationJobRepository.createGenerationJob(validation.request, auth.context);

    if (!job) {
      return jsonApiError(createApiError("not-found", "Material was not found."));
    }

    kickGenerationWorker();
    return jsonSuccess(job, { status: 202 });
  } catch (error) {
    return jsonRouteError(error);
  }
}

export async function GET(request: Request) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  if (FLASHLY_DATA_MODE !== "database") {
    return jsonSuccess({ jobs: [] });
  }

  try {
    const jobs = await databaseGenerationJobRepository.getActiveGenerationJobs(auth.context);

    return jsonSuccess({ jobs });
  } catch (error) {
    return jsonRouteError(error);
  }
}
