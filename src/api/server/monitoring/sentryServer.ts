import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN?.trim();
const environment = process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development";
const release = process.env.SENTRY_RELEASE?.trim();

const secretKeyPatterns = [
  /authorization/i,
  /cookie/i,
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /sourceBase64/i,
  /sourceText/i,
  /extractedText/i,
  /prompt/i,
];

const scrubObject = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(scrubObject);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      secretKeyPatterns.some((pattern) => pattern.test(key)) ? "[Filtered]" : scrubObject(item),
    ]),
  );
};

export const initializeServerSentry = () => {
  if (!dsn) {
    return false;
  }

  Sentry.init({
    beforeSend: (event) => scrubObject(event) as typeof event,
    dsn,
    environment,
    release,
    tracesSampleRate: 0.05,
  });

  process.on("unhandledRejection", (reason) => {
    Sentry.captureException(reason);
  });

  process.on("uncaughtException", (error) => {
    Sentry.captureException(error);
  });

  return true;
};

export const captureBackendException = (
  error: unknown,
  context: {
    method?: string;
    pathname?: string;
    requestId?: string;
    routeBucket?: string;
    status?: number;
  },
) => {
  if (!dsn) {
    return;
  }

  Sentry.withScope((scope) => {
    if (context.requestId) {
      scope.setTag("request_id", context.requestId);
    }

    if (context.routeBucket) {
      scope.setTag("route_bucket", context.routeBucket);
    }

    if (context.method) {
      scope.setTag("http_method", context.method);
    }

    if (context.pathname) {
      scope.setContext("request", {
        method: context.method,
        path: context.pathname,
        status: context.status,
      });
    }

    Sentry.captureException(error);
  });
};

export const captureBackendMessage = (message: string, context: Record<string, string>) => {
  if (!dsn) {
    return;
  }

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      scope.setTag(key, value);
    }

    Sentry.captureMessage(message);
  });
};
