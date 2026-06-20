import type { ApiErrorCode, ApiErrorDTO } from "@/api/contracts";
import { createApiError } from "./apiErrors";
import { isExtractionServiceFailureError, isExtractionServiceNotConfiguredError } from "./extraction";
import { isGenerationServiceFailureError, isGenerationServiceNotConfiguredError } from "./generation";
import { isServerRepositoryNotConfiguredError } from "./repositoryErrors";
import { isStorageServiceNotConfiguredError } from "./storage";

const jsonHeaders = {
  "Content-Type": "application/json",
};

export const jsonSuccess = <TBody>(body: TBody, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: {
      ...jsonHeaders,
      ...init?.headers,
    },
  });

export const jsonError = (status: number, code: ApiErrorCode, message: string, retryable = false) => {
  const error: ApiErrorDTO = createApiError(code, message, retryable);

  return Response.json(
    { error },
    {
      status,
      headers: jsonHeaders,
    },
  );
};

const statusByErrorCode: Record<ApiErrorCode, number> = {
  "ai-provider-authentication": 500,
  "ai-provider-authorization": 500,
  "ai-provider-invalid-response": 502,
  "ai-provider-rate-limited": 503,
  "ai-provider-timeout": 504,
  "ai-provider-upstream": 502,
  conflict: 409,
  forbidden: 403,
  internal: 500,
  "not-found": 404,
  "not-ready": 425,
  "processing-failed": 500,
  "rate-limited": 429,
  unauthorized: 401,
  unknown: 500,
  "unsupported-media": 415,
  "validation-error": 400,
};

export const jsonApiError = (error: ApiErrorDTO, status = statusByErrorCode[error.code]) =>
  Response.json(
    { error },
    {
      status,
      headers: jsonHeaders,
    },
  );

export const jsonRouteError = (error: unknown) => {
  if (isServerRepositoryNotConfiguredError(error)) {
    return jsonError(500, "internal", error.message);
  }

  if (isStorageServiceNotConfiguredError(error)) {
    return jsonError(500, "internal", error.message);
  }

  if (isExtractionServiceNotConfiguredError(error)) {
    return jsonError(500, "internal", error.message);
  }

  if (isExtractionServiceFailureError(error)) {
    return jsonError(statusByErrorCode[error.code], error.code, error.message, error.retryable);
  }

  if (isGenerationServiceNotConfiguredError(error)) {
    return jsonError(500, "internal", error.message);
  }

  if (isGenerationServiceFailureError(error)) {
    return jsonError(error.status ?? statusByErrorCode[error.code], error.code, error.message, error.retryable);
  }

  return jsonError(500, "internal", "An unexpected server error occurred.");
};

export const methodNotAllowed = (allowedMethods: string[]) =>
  jsonError(405, "validation-error", `Unsupported method. Use ${allowedMethods.join(", ")}.`);

export const readJsonBody = async <TBody>(request: Request): Promise<TBody | null> => {
  try {
    return (await request.json()) as TBody;
  } catch {
    return null;
  }
};
