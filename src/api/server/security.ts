import { createApiError } from "./apiErrors";

export type RateLimitBucket = "auth" | "generation" | "general" | "upload";

export type SecurityContext = {
  clientKey: string;
  requestId: string;
  routeBucket: RateLimitBucket;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

export const securityConfig = {
  allowedOrigins: (process.env.FLASHLY_ALLOWED_ORIGINS || process.env.FLASHLY_CORS_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  authRateLimitMax: Number(process.env.FLASHLY_AUTH_RATE_LIMIT_MAX || 30),
  generationRateLimitMax: Number(process.env.FLASHLY_GENERATION_RATE_LIMIT_MAX || 20),
  generalRateLimitMax: Number(process.env.FLASHLY_RATE_LIMIT_MAX || 120),
  rateLimitWindowMs: Number(process.env.FLASHLY_RATE_LIMIT_WINDOW_MS || 60_000),
  uploadRateLimitMax: Number(process.env.FLASHLY_UPLOAD_RATE_LIMIT_MAX || 30),
};

const isProduction = process.env.NODE_ENV === "production";

const getHeader = (headers: Headers, key: string) => headers.get(key)?.trim() || null;

export const createRequestId = () =>
  globalThis.crypto?.randomUUID?.() ?? `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const getClientKey = (headers: Headers) => {
  const forwardedFor = getHeader(headers, "x-forwarded-for");
  const realIp = getHeader(headers, "x-real-ip");
  const auth = getHeader(headers, "authorization");

  return forwardedFor?.split(",")[0]?.trim() || realIp || auth?.slice(0, 32) || "anonymous";
};

export const getRateLimitBucket = (pathname: string): RateLimitBucket => {
  if (pathname.includes("/generate-flashcards")) {
    return "generation";
  }

  if (pathname.startsWith("/api/uploads")) {
    return "upload";
  }

  if (pathname.includes("/subscription") || pathname.includes("/billing")) {
    return "auth";
  }

  return "general";
};

const maxForBucket = (bucket: RateLimitBucket) => {
  switch (bucket) {
    case "auth":
      return securityConfig.authRateLimitMax;
    case "generation":
      return securityConfig.generationRateLimitMax;
    case "upload":
      return securityConfig.uploadRateLimitMax;
    case "general":
    default:
      return securityConfig.generalRateLimitMax;
  }
};

export const checkRateLimit = (context: SecurityContext) => {
  const now = Date.now();
  const windowMs = Math.max(securityConfig.rateLimitWindowMs, 1_000);
  const key = `${context.routeBucket}:${context.clientKey}`;
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      limit: maxForBucket(context.routeBucket),
      ok: true,
      remaining: Math.max(maxForBucket(context.routeBucket) - 1, 0),
      resetAt: now + windowMs,
    };
  }

  current.count += 1;
  rateLimitStore.set(key, current);

  const limit = maxForBucket(context.routeBucket);

  return {
    limit,
    ok: current.count <= limit,
    remaining: Math.max(limit - current.count, 0),
    resetAt: current.resetAt,
  };
};

export const getAllowedCorsOrigin = (origin: string | undefined) => {
  if (!origin) {
    return "*";
  }

  if (securityConfig.allowedOrigins.length === 0) {
    return isProduction ? null : origin;
  }

  return securityConfig.allowedOrigins.includes(origin) ? origin : null;
};

export const isJsonContentTypeRequired = (method: string, pathname: string) =>
  !["GET", "HEAD", "OPTIONS"].includes(method) && pathname.startsWith("/api/");

export const isSupportedContentType = (contentType: string | null) => {
  if (!contentType) {
    return false;
  }

  const normalized = contentType.toLowerCase();

  return normalized.includes("application/json") || normalized.includes("text/plain");
};

export const createSecurityErrorBody = (code: "rate-limited" | "unsupported-media" | "validation-error", message: string, requestId: string) => ({
  error: {
    ...createApiError(code, message, code === "rate-limited"),
    requestId,
  },
});

export const logSecurityEvent = (
  level: "error" | "warn",
  message: string,
  context: Pick<SecurityContext, "requestId" | "routeBucket"> & { pathname?: string },
) => {
  const payload = {
    message,
    pathname: context.pathname,
    requestId: context.requestId,
    routeBucket: context.routeBucket,
  };

  if (level === "error") {
    console.error("[Flashly Security]", payload);
  } else {
    console.warn("[Flashly Security]", payload);
  }
};
