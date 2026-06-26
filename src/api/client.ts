import type { ApiErrorDTO } from "./contracts";
import { API_BASE_URL } from "./config";
import { getApiAuthToken } from "./authToken";

export type ApiAuthTokenProvider = () => Promise<string | null> | string | null;

export type ApiRequestOptions<TBody = unknown> = {
  authToken?: string;
  body?: TBody;
  debugLabel?: string;
  debugMeta?: Record<string, unknown>;
  getAuthToken?: ApiAuthTokenProvider;
  headers?: HeadersInit;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
};

export class FlashlyApiError extends Error {
  error: ApiErrorDTO;
  status: number;

  constructor(error: ApiErrorDTO, status: number) {
    super(error.message);
    this.name = "FlashlyApiError";
    this.error = error;
    this.status = status;
  }
}

const buildUrl = (path: string) => {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
};

const isErrorResponse = (value: unknown): value is { error: ApiErrorDTO } => {
  if (!value || typeof value !== "object" || !("error" in value)) {
    return false;
  }

  const error = (value as { error?: unknown }).error;

  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      "message" in error &&
      typeof (error as ApiErrorDTO).code === "string" &&
      typeof (error as ApiErrorDTO).message === "string",
  );
};

export const apiRequest = async <TResponse, TBody = unknown>(
  path: string,
  options: ApiRequestOptions<TBody> = {},
): Promise<TResponse> => {
  const startedAt = Date.now();
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const authToken = options.authToken ?? (await options.getAuthToken?.()) ?? (await getApiAuthToken());

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const response = await fetch(buildUrl(path), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const contentType = response.headers.get("Content-Type");
  const payload: unknown = contentType?.includes("application/json") ? await response.json() : null;

  if (options.debugLabel && typeof __DEV__ !== "undefined" && __DEV__) {
    const error = isErrorResponse(payload) ? payload.error : undefined;
    console.info(`[Flashly API] ${options.debugLabel}`, {
      durationMs: Date.now() - startedAt,
      errorCode: error?.code,
      errorMessage: error?.message,
      meta: options.debugMeta,
      status: response.status,
    });
  }

  if (!response.ok) {
    const error: ApiErrorDTO = isErrorResponse(payload)
      ? payload.error
      : {
          code:
            response.status === 401
              ? "unauthorized"
              : response.status === 403
                ? "forbidden"
                : response.status === 404
                  ? "not-found"
                  : response.status === 409
                    ? "conflict"
                    : response.status === 415
                      ? "unsupported-media"
                      : response.status === 425
                        ? "not-ready"
                        : response.status >= 500
                          ? "internal"
                          : "unknown",
          message: "Flashly API request failed.",
        };

    throw new FlashlyApiError(error, response.status);
  }

  return payload as TResponse;
};
