import type { ApiErrorCode, ApiErrorDTO } from "@/api/contracts";

export const createApiError = (code: ApiErrorCode, message: string, retryable = false): ApiErrorDTO => ({
  code,
  message,
  retryable,
});

export const validationError = (message: string) => createApiError("validation-error", message);

export const unsupportedMediaError = (message: string) => createApiError("unsupported-media", message);

export const notReadyError = (message: string) => createApiError("not-ready", message, true);

export const notFoundError = (message: string) => createApiError("not-found", message);

export const conflictError = (message: string) => createApiError("conflict", message);

export const unauthorizedError = (message: string) => createApiError("unauthorized", message);

export const forbiddenError = (message: string) => createApiError("forbidden", message);

export const rateLimitedError = (message: string) => createApiError("rate-limited", message);
