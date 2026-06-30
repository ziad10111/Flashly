import { apiRequest } from "@/api/client";
import type {
  CancelGenerationJobResponse,
  GetGenerationJobResponse,
  GetGenerationJobsResponse,
  RetryGenerationJobResponse,
  StartGenerationJobRequest,
  StartGenerationJobResponse,
} from "@/api/contracts";

export const startGenerationJob = async (
  request: StartGenerationJobRequest,
): Promise<StartGenerationJobResponse> =>
  apiRequest<StartGenerationJobResponse, StartGenerationJobRequest>("/api/generation-jobs", {
    body: request,
    debugLabel: "startGenerationJob",
    debugMeta: {
      batchSize: request.batchSize,
      generationMode: request.generationMode,
      materialId: request.materialId ?? request.sourceId,
      requestedCardCount: request.requestedCardCount,
    },
    method: "POST",
  });

export const getGenerationJob = async (jobId: string): Promise<GetGenerationJobResponse> =>
  apiRequest<GetGenerationJobResponse>(`/api/generation-jobs/${encodeURIComponent(jobId)}`, {
    debugLabel: "getGenerationJob",
    debugMeta: { jobId },
  });

export const getActiveGenerationJobs = async (): Promise<GetGenerationJobsResponse> =>
  apiRequest<GetGenerationJobsResponse>("/api/generation-jobs", {
    debugLabel: "getActiveGenerationJobs",
  });

export const retryGenerationJob = async (jobId: string): Promise<RetryGenerationJobResponse> =>
  apiRequest<RetryGenerationJobResponse>(`/api/generation-jobs/${encodeURIComponent(jobId)}/retry`, {
    debugLabel: "retryGenerationJob",
    debugMeta: { jobId },
    method: "POST",
  });

export const cancelGenerationJob = async (jobId: string): Promise<CancelGenerationJobResponse> =>
  apiRequest<CancelGenerationJobResponse>(`/api/generation-jobs/${encodeURIComponent(jobId)}/cancel`, {
    debugLabel: "cancelGenerationJob",
    debugMeta: { jobId },
    method: "POST",
  });
