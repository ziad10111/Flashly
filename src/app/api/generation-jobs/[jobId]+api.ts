import { notFoundError } from "@/api/server/apiErrors";
import { requireBackendAuth } from "@/api/server/auth";
import { FLASHLY_DATA_MODE } from "@/api/server/config";
import { databaseGenerationJobRepository } from "@/api/server/generationJobs/repository";
import { kickGenerationWorker } from "@/api/server/generationJobs/worker";
import { jsonApiError, jsonRouteError, jsonSuccess } from "@/api/server/responses";

export async function GET(request: Request, { jobId }: { jobId: string }) {
  const auth = await requireBackendAuth(request);

  if (!auth.ok) {
    return auth.response;
  }

  if (FLASHLY_DATA_MODE !== "database") {
    return jsonApiError(notFoundError("Generation job was not found."));
  }

  try {
    kickGenerationWorker();
    const job = await databaseGenerationJobRepository.getGenerationJob(jobId, auth.context);

    if (!job) {
      return jsonApiError(notFoundError("Generation job was not found."));
    }

    return jsonSuccess(job);
  } catch (error) {
    return jsonRouteError(error);
  }
}
