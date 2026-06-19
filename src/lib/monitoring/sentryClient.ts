import Constants from "expo-constants";
import * as Sentry from "@sentry/react-native";
import type { ComponentType } from "react";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const environment = process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development";
const release =
  process.env.SENTRY_RELEASE?.trim() ||
  `${Constants.expoConfig?.slug ?? "flashly"}@${Constants.expoConfig?.version ?? "dev"}`;

const scrubEvent = (event: Parameters<NonNullable<Parameters<typeof Sentry.init>[0]["beforeSend"]>>[0]) => {
  delete event.request?.cookies;
  delete event.request?.data;

  if (event.request?.headers) {
    delete event.request.headers.Authorization;
    delete event.request.headers.authorization;
    delete event.request.headers.Cookie;
    delete event.request.headers.cookie;
  }

  return event;
};

export const initializeClientSentry = () => {
  if (!dsn) {
    return false;
  }

  Sentry.init({
    beforeSend: scrubEvent,
    dsn,
    enableNative: true,
    environment,
    release,
    tracesSampleRate: 0.05,
  });

  return true;
};

export const captureClientException = (error: unknown, context?: Record<string, unknown>) => {
  if (!dsn) {
    return;
  }

  Sentry.captureException(error, {
    contexts: context ? { flashly: context } : undefined,
  });
};

export const withSentryRoot = <TProps extends Record<string, unknown>>(
  component: ComponentType<TProps>,
) => (dsn ? Sentry.wrap(component) : component);

export const triggerClientSentryTestError = () => {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  captureClientException(new Error("Flashly client Sentry test error"), {
    source: "manual-test",
  });
};
