import {
  FLASHLY_AI_API_KEY,
  FLASHLY_AI_BASE_URL,
  FLASHLY_AI_MODEL,
  FLASHLY_AI_REQUEST_TIMEOUT_MS,
} from "../../config";
import { getCurrentRequestId } from "../../requestContext";
import { GenerationServiceFailureError, GenerationServiceNotConfiguredError } from "../types";

type NvidiaChatCompletionChoice = {
  message?: {
    content?: unknown;
  };
};

type NvidiaChatCompletionResponse = {
  choices?: unknown;
};

type NvidiaProviderCategory =
  | "authentication"
  | "authorization"
  | "configuration"
  | "invalid-upstream-response"
  | "network-failure"
  | "rate-limit"
  | "request-timeout"
  | "schema-validation"
  | "upstream-5xx"
  | "upstream-http";

type NvidiaProviderDiagnostics = {
  attempt: number;
  elapsedMs: number;
  errorCode?: string;
  errorName?: string;
  flashlyRequestId?: string;
  model: string;
  provider: "nvidia";
  retryable: boolean;
  retryDelayMs?: number;
  sanitizedMessage?: string;
  timeoutMs: number;
  upstreamRequestId?: string;
  upstreamStatus?: number;
};

type NvidiaProviderCallOptions = {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

type NvidiaAttemptFailure = {
  category: NvidiaProviderCategory;
  code?: string;
  errorName?: string;
  message: string;
  retryable: boolean;
  status?: number;
  upstreamRequestId?: string;
};

export const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const NVIDIA_DEFAULT_MAX_RETRIES = 1;

const transientStatuses = new Set([408, 429, 500, 502, 503, 504]);

export type NvidiaGenerationConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

export const getNvidiaGenerationConfig = (): NvidiaGenerationConfig => {
  if (!FLASHLY_AI_API_KEY || !FLASHLY_AI_MODEL) {
    throw new GenerationServiceNotConfiguredError(
      "generation.provider.nvidia",
      "NVIDIA generation requires FLASHLY_AI_API_KEY and FLASHLY_AI_MODEL as server-only environment variables.",
    );
  }

  return {
    apiKey: FLASHLY_AI_API_KEY,
    baseUrl: (FLASHLY_AI_BASE_URL || NVIDIA_DEFAULT_BASE_URL).replace(/\/+$/, ""),
    model: FLASHLY_AI_MODEL,
    timeoutMs: FLASHLY_AI_REQUEST_TIMEOUT_MS,
  };
};

const sanitizeProviderMessage = (message: string | undefined) => {
  if (!message) {
    return undefined;
  }

  return message
    .replace(/Authorization:\s*[^\n\r]+/gi, "Authorization: [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [redacted]")
    .replace(/nvapi-[A-Za-z0-9_-]+/gi, "nvapi-[redacted]")
    .replace(/api[_-]?key\s*[:=]\s*["']?[^"',\s]+/gi, "api_key=[redacted]")
    .slice(0, 220);
};

const getHeader = (headers: Headers, names: string[]) => {
  for (const name of names) {
    const value = headers.get(name);

    if (value) {
      return value;
    }
  }

  return undefined;
};

const getRetryAfterMs = (headers: Headers) => {
  const retryAfter = headers.get("retry-after");

  if (!retryAfter) {
    return undefined;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 10_000);
  }

  const dateMs = Date.parse(retryAfter);

  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(dateMs - Date.now(), 0), 10_000);
  }

  return undefined;
};

const createDelayMs = (
  attempt: number,
  headers: Headers | undefined,
  random: () => number,
) => {
  const retryAfterMs = headers ? getRetryAfterMs(headers) : undefined;

  if (retryAfterMs !== undefined) {
    return retryAfterMs;
  }

  const base = Math.min(500 * 2 ** (attempt - 1), 2_000);
  const jitter = Math.floor(random() * 250);

  return base + jitter;
};

const mapHttpFailure = (status: number): Pick<NvidiaAttemptFailure, "category" | "message" | "retryable"> => {
  if (status === 401) {
    return {
      category: "authentication",
      message: "NVIDIA provider authentication failed.",
      retryable: false,
    };
  }

  if (status === 403) {
    return {
      category: "authorization",
      message: "NVIDIA provider authorization failed.",
      retryable: false,
    };
  }

  if (status === 429) {
    return {
      category: "rate-limit",
      message: "NVIDIA provider rate limit was reached.",
      retryable: true,
    };
  }

  if (status >= 500 || status === 408) {
    return {
      category: status === 408 ? "request-timeout" : "upstream-5xx",
      message: "NVIDIA provider returned a temporary upstream failure.",
      retryable: true,
    };
  }

  return {
    category: "upstream-http",
    message: `NVIDIA provider request failed with HTTP ${status}.`,
    retryable: false,
  };
};

const mapGenerationErrorCode = (category: NvidiaProviderCategory) => {
  switch (category) {
    case "authentication":
      return "ai-provider-authentication" as const;
    case "authorization":
      return "ai-provider-authorization" as const;
    case "rate-limit":
      return "ai-provider-rate-limited" as const;
    case "request-timeout":
      return "ai-provider-timeout" as const;
    case "invalid-upstream-response":
    case "schema-validation":
      return "ai-provider-invalid-response" as const;
    default:
      return "ai-provider-upstream" as const;
  }
};

const mapGenerationStatus = (failure: NvidiaAttemptFailure) => {
  if (failure.category === "request-timeout") {
    return 504;
  }

  if (failure.category === "rate-limit") {
    return 503;
  }

  if (failure.category === "authentication" || failure.category === "authorization") {
    return 500;
  }

  return 502;
};

const toGenerationFailureError = (failure: NvidiaAttemptFailure) =>
  new GenerationServiceFailureError(
    mapGenerationErrorCode(failure.category),
    failure.message,
    failure.retryable,
    {
      providerCategory: failure.category,
      status: mapGenerationStatus(failure),
    },
  );

const logDiagnostics = (diagnostics: NvidiaProviderDiagnostics) => {
  console.warn("[Flashly AI Provider]", diagnostics);
};

const getNetworkFailure = (error: unknown): NvidiaAttemptFailure => {
  const errorRecord = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const name = error instanceof Error ? error.name : typeof errorRecord.name === "string" ? errorRecord.name : undefined;
  const code = typeof errorRecord.code === "string" ? errorRecord.code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const isAbort = name === "AbortError";
  const isTimeout =
    isAbort ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_BODY_TIMEOUT" ||
    /timeout|aborted/i.test(message);

  return {
    category: isTimeout ? "request-timeout" : "network-failure",
    code,
    errorName: name,
    message: isTimeout
      ? "The AI provider did not respond in time."
      : "The AI provider request failed due to a temporary network error.",
    retryable: true,
  };
};

const extractNvidiaOutputText = (body: unknown) => {
  const choices =
    typeof body === "object" && body !== null && "choices" in body
      ? (body as NvidiaChatCompletionResponse).choices
      : undefined;

  if (!Array.isArray(choices)) {
    throw new GenerationServiceFailureError(
      "ai-provider-invalid-response",
      "NVIDIA provider response was missing generated choices.",
      false,
      {
        providerCategory: "invalid-upstream-response",
        status: 502,
      },
    );
  }

  const firstChoice = choices[0] as NvidiaChatCompletionChoice | undefined;
  const content = firstChoice?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new GenerationServiceFailureError(
      "ai-provider-invalid-response",
      "NVIDIA provider returned empty flashcard output.",
      false,
      {
        providerCategory: "invalid-upstream-response",
        status: 502,
      },
    );
  }

  return content.trim();
};

export const createNvidiaChatCompletionsCaller = (options: NvidiaProviderCallOptions = {}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRetries = options.maxRetries ?? NVIDIA_DEFAULT_MAX_RETRIES;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return async (prompt: string) => {
    const config = getNvidiaGenerationConfig();
    const timeoutMs = options.timeoutMs ?? config.timeoutMs;
    let lastFailure: NvidiaAttemptFailure | undefined;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
          body: JSON.stringify({
            model: config.model,
            messages: [
              {
                role: "system",
                content:
                  "You are Flashly's MCQ generator. Return strict JSON only. Do not include markdown, commentary, reasoning, or extra text. Generate high-quality MCQ study cards based only on the provided source material.",
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            max_tokens: 4096,
            temperature: 0.2,
            top_p: 0.9,
            stream: false,
          }),
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        });

        if (!response.ok) {
          const mapped = mapHttpFailure(response.status);
          const retryable = mapped.retryable && transientStatuses.has(response.status);
          const retryDelayMs =
            retryable && attempt <= maxRetries ? createDelayMs(attempt, response.headers, random) : undefined;
          const failure: NvidiaAttemptFailure = {
            ...mapped,
            code: getHeader(response.headers, ["x-nvidia-error-code", "x-error-code"]),
            retryable,
            status: response.status,
            upstreamRequestId: getHeader(response.headers, [
              "x-request-id",
              "x-nvidia-request-id",
              "x-correlation-id",
              "x-amzn-requestid",
            ]),
          };

          lastFailure = failure;
          logDiagnostics({
            attempt,
            elapsedMs: Date.now() - startedAt,
            errorCode: failure.code,
            flashlyRequestId: getCurrentRequestId(),
            model: config.model,
            provider: "nvidia",
            retryable,
            retryDelayMs,
            sanitizedMessage: sanitizeProviderMessage(failure.message),
            timeoutMs,
            upstreamRequestId: failure.upstreamRequestId,
            upstreamStatus: response.status,
          });

          if (retryDelayMs !== undefined) {
            await sleep(retryDelayMs);
            continue;
          }

          throw toGenerationFailureError(failure);
        }

        let body: unknown;
        try {
          body = await response.json();
        } catch {
          throw new GenerationServiceFailureError(
            "ai-provider-invalid-response",
            "NVIDIA provider returned invalid JSON.",
            false,
            {
              providerCategory: "invalid-upstream-response",
              status: 502,
            },
          );
        }

        return extractNvidiaOutputText(body);
      } catch (error) {
        if (error instanceof GenerationServiceFailureError || error instanceof GenerationServiceNotConfiguredError) {
          throw error;
        }

        const failure = getNetworkFailure(error);
        const retryDelayMs = failure.retryable && attempt <= maxRetries ? createDelayMs(attempt, undefined, random) : undefined;
        lastFailure = failure;
        logDiagnostics({
          attempt,
          elapsedMs: Date.now() - startedAt,
          errorCode: failure.code,
          errorName: failure.errorName,
          flashlyRequestId: getCurrentRequestId(),
          model: config.model,
          provider: "nvidia",
          retryable: failure.retryable,
          retryDelayMs,
          sanitizedMessage: sanitizeProviderMessage(failure.message),
          timeoutMs,
        });

        if (retryDelayMs !== undefined) {
          await sleep(retryDelayMs);
          continue;
        }

        throw toGenerationFailureError(failure);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw toGenerationFailureError(
      lastFailure ?? {
        category: "network-failure",
        message: "The AI provider request failed.",
        retryable: true,
      },
    );
  };
};

export const callNvidiaChatCompletionsApi = createNvidiaChatCompletionsCaller();
