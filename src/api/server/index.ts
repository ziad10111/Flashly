import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import * as assistantChatRoute from "@/app/api/assistant/chat+api";
import * as assistantConversationsByDeckRoute from "@/app/api/assistant/conversations/by-deck/[deckId]+api";
import * as revenueCatWebhookRoute from "@/app/api/billing/revenuecat/webhook+api";
import * as deckByIdRoute from "@/app/api/decks/[id]+api";
import * as decksRoute from "@/app/api/decks+api";
import * as materialExtractRoute from "@/app/api/materials/[id]/extract+api";
import * as materialGenerateRoute from "@/app/api/materials/[id]/generate-flashcards+api";
import * as subscriptionRoute from "@/app/api/me/subscription+api";
import * as progressRoute from "@/app/api/progress+api";
import * as reviewSessionsRoute from "@/app/api/review-sessions+api";
import * as uploadStatusRoute from "@/app/api/uploads/[id]/status+api";
import * as uploadChunkCompleteRoute from "@/app/api/uploads/chunk/complete+api";
import * as uploadChunkPartRoute from "@/app/api/uploads/chunk/part+api";
import * as uploadChunkStartRoute from "@/app/api/uploads/chunk/start+api";
import * as uploadsRoute from "@/app/api/uploads+api";
import { FLASHLY_DATA_MODE } from "@/api/server/config";
import { queryPostgres } from "@/api/server/database/client";
import {
  captureBackendException,
  captureBackendMessage,
  initializeServerSentry,
} from "@/api/server/monitoring/sentryServer";
import {
  checkRateLimit,
  createRequestId,
  createSecurityErrorBody,
  getAllowedCorsOrigin,
  getClientKey,
  getRateLimitBucket,
  isJsonContentTypeRequired,
  isSupportedContentType,
  logSecurityEvent,
  type SecurityContext,
} from "@/api/server/security";
import {
  assertRuntimeEnvironmentReady,
  validateRuntimeEnvironment,
  type RuntimeValidationSection,
} from "@/api/server/runtimeValidation";
import { storageService } from "@/api/server/storage";

initializeServerSentry();

const startupValidation = assertRuntimeEnvironmentReady();

type RouteModule = {
  DELETE?: unknown;
  GET?: unknown;
  POST?: unknown;
  PUT?: unknown;
};

type RouteHandler = (request: Request, params: Record<string, string>) => Response | Promise<Response>;

type RouteMatch = {
  params: Record<string, string>;
  route: RouteModule;
};

const port = Number(process.env.PORT || 8081);
const host = process.env.HOST || "0.0.0.0";
const maxBodyBytes = Number(process.env.FLASHLY_SERVER_MAX_BODY_BYTES || 80 * 1024 * 1024);
const isProduction = process.env.NODE_ENV === "production";

const routes: {
  match: (pathname: string) => null | Record<string, string>;
  route: RouteModule;
}[] = [
  { match: exact("/api/assistant/chat"), route: assistantChatRoute },
  {
    match: pattern(/^\/api\/assistant\/conversations\/by-deck\/([^/]+)$/u, ["deckId"]),
    route: assistantConversationsByDeckRoute,
  },
  { match: exact("/api/billing/revenuecat/webhook"), route: revenueCatWebhookRoute },
  { match: exact("/api/decks"), route: decksRoute },
  { match: pattern(/^\/api\/decks\/([^/]+)$/u, ["id"]), route: deckByIdRoute },
  { match: pattern(/^\/api\/materials\/([^/]+)\/extract$/u, ["id"]), route: materialExtractRoute },
  { match: pattern(/^\/api\/materials\/([^/]+)\/generate-flashcards$/u, ["id"]), route: materialGenerateRoute },
  { match: exact("/api/me/subscription"), route: subscriptionRoute },
  { match: exact("/api/progress"), route: progressRoute },
  { match: exact("/api/review-sessions"), route: reviewSessionsRoute },
  { match: pattern(/^\/api\/uploads\/([^/]+)\/status$/u, ["id"]), route: uploadStatusRoute },
  { match: exact("/api/uploads/chunk/complete"), route: uploadChunkCompleteRoute },
  { match: exact("/api/uploads/chunk/part"), route: uploadChunkPartRoute },
  { match: exact("/api/uploads/chunk/start"), route: uploadChunkStartRoute },
  { match: exact("/api/uploads"), route: uploadsRoute },
];

function exact(expectedPathname: string) {
  return (pathname: string) => (pathname === expectedPathname ? {} : null);
}

function pattern(expression: RegExp, keys: string[]) {
  return (pathname: string) => {
    const match = expression.exec(pathname);

    if (!match) {
      return null;
    }

    return Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(match[index + 1] ?? "")]));
  };
}

function findRoute(pathname: string): RouteMatch | null {
  for (const item of routes) {
    const params = item.match(pathname);

    if (params) {
      return { params, route: item.route };
    }
  }

  return null;
}

function corsHeaders(origin: string | undefined) {
  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-RevenueCat-Signature",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": getAllowedCorsOrigin(origin) ?? "null",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function readBody(request: IncomingMessage, requestId: string) {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;

    if (totalBytes > maxBodyBytes) {
      const error = new Error("Request body is too large.");
      error.name = "PayloadTooLargeError";
      logSecurityEvent("warn", `Request body exceeded ${maxBodyBytes} bytes.`, {
        requestId,
        routeBucket: "general",
      });
      throw error;
    }

    chunks.push(buffer);
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function toFetchRequest(request: IncomingMessage, url: URL, requestId: string) {
  const method = request.method || "GET";
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(request, requestId);

  return new Request(url, {
    body,
    headers,
    method,
  });
}

async function sendResponse(response: ServerResponse, fetchResponse: Response, origin: string | undefined, requestId: string) {
  const headers = new Headers(fetchResponse.headers);

  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    headers.set(key, value);
  }

  headers.set("X-Request-Id", requestId);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");

  response.statusCode = fetchResponse.status;

  headers.forEach((value, key) => {
    response.setHeader(key, value);
  });

  const body = await fetchResponse.arrayBuffer();
  response.end(Buffer.from(body));
}

type ReadinessCheck = {
  message?: string;
  status: "ok" | "configured" | "warning" | "failed";
};

const mapValidationSection = (section: RuntimeValidationSection): ReadinessCheck => {
  if (section.status === "error") {
    return {
      message: section.issues.map((issue) => issue.message).join("; "),
      status: "failed",
    };
  }

  if (section.status === "warning") {
    return {
      message: section.issues.map((issue) => issue.message).join("; "),
      status: "warning",
    };
  }

  return { status: "configured" };
};

async function checkDatabaseReadiness(): Promise<ReadinessCheck> {
  if (FLASHLY_DATA_MODE !== "database") {
    return {
      message: "Database mode is not enabled.",
      status: "configured",
    };
  }

  try {
    await queryPostgres("SELECT 1");

    return { status: "ok" };
  } catch {
    return {
      message: "PostgreSQL readiness check failed.",
      status: "failed",
    };
  }
}

async function checkMigrationReadiness(): Promise<ReadinessCheck> {
  if (FLASHLY_DATA_MODE !== "database") {
    return {
      message: "Database mode is not enabled.",
      status: "configured",
    };
  }

  try {
    const result = await queryPostgres<{ count: number | string; latest: string | null }>(
      `
        SELECT COUNT(*) AS count, MAX(id) AS latest
        FROM schema_migrations
      `,
    );
    const row = result.rows[0];
    const count = Number(row?.count ?? 0);

    if (count <= 0) {
      return {
        message: "No database migrations are recorded.",
        status: "failed",
      };
    }

    return {
      message: row.latest ? `Latest migration: ${row.latest}` : undefined,
      status: "ok",
    };
  } catch {
    return {
      message: "Database migration readiness check failed.",
      status: "failed",
    };
  }
}

async function checkStorageReadiness(): Promise<ReadinessCheck> {
  const readiness = storageService.validateReadiness();

  if (!readiness.ok) {
    return {
      message: readiness.message,
      status: "failed",
    };
  }

  if (storageService.mode !== "cloud") {
    return { status: "configured" };
  }

  if (!storageService.storeObject || !storageService.readObject || !storageService.deleteObject) {
    return {
      message: "Cloud storage must support write/read/delete readiness checks.",
      status: "failed",
    };
  }

  const storageKey = `readiness/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
  const textContent = `Flashly readiness ${new Date().toISOString()}`;

  try {
    await storageService.storeObject({
      contentType: "text/plain",
      fileName: "readiness.txt",
      metadata: {
        "flashly-readiness": "true",
      },
      sizeBytes: textContent.length,
      storageKey,
      textContent,
    });
    const stored = await storageService.readObject(storageKey);
    await storageService.deleteObject(storageKey);

    if (stored.textContent !== textContent) {
      return {
        message: "Cloud storage read-back content did not match write test.",
        status: "failed",
      };
    }

    return { status: "ok" };
  } catch {
    return {
      message: "Cloud storage write/read/delete readiness check failed.",
      status: "failed",
    };
  }
}

async function readinessResponse() {
  const validation = validateRuntimeEnvironment();
  const checks: Record<string, ReadinessCheck> = {
    server: { status: "ok" },
    environment: validation.ok ? { status: "configured" } : { message: "Runtime configuration is invalid.", status: "failed" },
    database: await checkDatabaseReadiness(),
    migrations: await checkMigrationReadiness(),
    storage: await checkStorageReadiness(),
    auth: mapValidationSection(validation.sections.auth),
    ocr: mapValidationSection(validation.sections.ocr),
    ai: mapValidationSection(validation.sections.ai),
    billing: mapValidationSection(validation.sections.billing),
    security: mapValidationSection(validation.sections.security),
  };

  const ready = Object.values(checks).every((check) => check.status !== "failed");

  return jsonResponse(
    {
      environment: validation.environment,
      checks,
      service: "flashly-backend",
      status: ready ? "ready" : "not-ready",
    },
    { status: ready ? 200 : 503 },
  );
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const requestId = createRequestId();
  const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;

  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const method = (request.method || "GET").toUpperCase();
    const allowedOrigin = getAllowedCorsOrigin(origin);
    const headers = new Headers();

    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        headers.set(key, value.join(", "));
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }

    const context: SecurityContext = {
      clientKey: getClientKey(headers),
      requestId,
      routeBucket: getRateLimitBucket(url.pathname),
    };

    if (origin && !allowedOrigin) {
      logSecurityEvent("warn", "Blocked request from disallowed CORS origin.", {
        pathname: url.pathname,
        requestId,
        routeBucket: context.routeBucket,
      });
      await sendResponse(
        response,
        jsonResponse(createSecurityErrorBody("validation-error", "This origin is not allowed.", requestId), { status: 403 }),
        origin,
        requestId,
      );
      return;
    }

    if (method === "OPTIONS") {
      await sendResponse(response, new Response(null, { status: 204 }), origin, requestId);
      return;
    }

    const rateLimit = checkRateLimit(context);

    if (!rateLimit.ok) {
      await sendResponse(
        response,
        jsonResponse(createSecurityErrorBody("rate-limited", "Too many requests. Please try again shortly.", requestId), {
          headers: {
            "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(rateLimit.limit),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
          status: 429,
        }),
        origin,
        requestId,
      );
      return;
    }

    if (isJsonContentTypeRequired(method, url.pathname) && !isSupportedContentType(headers.get("content-type"))) {
      await sendResponse(
        response,
        jsonResponse(createSecurityErrorBody("unsupported-media", "Use Content-Type: application/json.", requestId), { status: 415 }),
        origin,
        requestId,
      );
      return;
    }

    if (method === "GET" && url.pathname === "/health") {
      await sendResponse(response, jsonResponse({ ok: true, requestId, service: "flashly-backend" }), origin, requestId);
      return;
    }

    if (method === "GET" && url.pathname === "/ready") {
      await sendResponse(response, await readinessResponse(), origin, requestId);
      return;
    }

    if (process.env.NODE_ENV !== "production" && method === "GET" && url.pathname === "/__debug/sentry-error") {
      const error = new Error("Flashly backend Sentry test error");
      captureBackendException(error, {
        method,
        pathname: url.pathname,
        requestId,
        routeBucket: context.routeBucket,
        status: 500,
      });
      await sendResponse(
        response,
        jsonResponse({ ok: true, requestId, sent: true, service: "flashly-backend" }),
        origin,
        requestId,
      );
      return;
    }

    const match = findRoute(url.pathname);
    const handler = match?.route[method as keyof RouteModule] as RouteHandler | undefined;

    if (!match || !handler) {
      await sendResponse(
        response,
        jsonResponse(
          {
            error: {
              code: "not-found",
              message: "Route not found.",
            },
          },
          { status: 404 },
        ),
        origin,
        requestId,
      );
      return;
    }

    const fetchRequest = await toFetchRequest(request, url, requestId);
    const fetchResponse = await handler(fetchRequest, match.params);
    if (fetchResponse.status >= 500) {
      captureBackendMessage("Flashly route returned server error", {
        method,
        pathname: url.pathname,
        requestId,
        routeBucket: context.routeBucket,
        status: String(fetchResponse.status),
      });
    }
    await sendResponse(response, fetchResponse, origin, requestId);
  } catch (error) {
    logSecurityEvent("error", error instanceof Error ? error.message : "Unexpected server error.", {
      requestId,
      routeBucket: "general",
    });
    captureBackendException(error, {
      requestId,
      routeBucket: "general",
    });
    await sendResponse(
      response,
      jsonResponse(
        {
          error: {
            code: error instanceof Error && error.name === "PayloadTooLargeError" ? "validation-error" : "internal",
            message:
              error instanceof Error && error.name === "PayloadTooLargeError"
                ? "Request body is too large."
                : isProduction
                  ? "An unexpected server error occurred."
                  : error instanceof Error
                    ? error.message
                    : "Unexpected server error.",
            requestId,
          },
        },
        { status: error instanceof Error && error.name === "PayloadTooLargeError" ? 413 : 500 },
      ),
      origin,
      requestId,
    );
  }
}

createServer((request, response) => {
  void handleRequest(request, response);
}).listen(port, host, () => {
  console.info(`Flashly backend listening on ${host}:${port} (${startupValidation.environment})`);
});
