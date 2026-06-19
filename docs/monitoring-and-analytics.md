# Flashly Monitoring and Analytics

Flashly uses PostHog for product analytics and Sentry for crash/error monitoring. Both integrations are optional in local development and activate only when their environment variables are configured.

## Sentry Environment Variables

Client:

```bash
EXPO_PUBLIC_SENTRY_DSN=https://public@sentry.example/project
```

Backend:

```bash
SENTRY_DSN=https://private@sentry.example/project
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=flashly@1.0.0
```

`EXPO_PUBLIC_SENTRY_DSN` is safe for the Expo client. Keep backend DSNs and any Sentry auth tokens server-side.

## Client Coverage

Client Sentry is initialized in:

```text
src/lib/monitoring/sentryClient.ts
src/app/_layout.tsx
```

It captures unhandled React Native JavaScript errors through `Sentry.wrap`. The client event scrubber removes request cookies, authorization headers, and request payload data before sending events.

If `EXPO_PUBLIC_SENTRY_DSN` is missing, Sentry is skipped and the app continues normally.

## Backend Coverage

Backend Sentry is initialized in:

```text
src/api/server/monitoring/sentryServer.ts
src/api/server/index.ts
```

It captures:

- uncaught exceptions
- unhandled promise rejections
- standalone backend request handler exceptions
- route responses that return HTTP 500 or higher

Backend events include safe context such as:

- request id
- route bucket
- method
- path
- response status

The backend scrubber filters keys that look like tokens, secrets, API keys, authorization headers, uploaded source text, base64 payloads, extracted OCR text, and AI prompts.

## PostHog Notes

PostHog is currently initialized in the Expo root layout:

```text
src/app/_layout.tsx
```

Configured with:

```bash
EXPO_PUBLIC_POSTHOG_KEY=...
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Use PostHog for product analytics, funnels, and engagement events. Use Sentry for crashes, exceptions, and backend operational errors.

## What Not To Log

Do not log or send to Sentry/PostHog:

- Clerk tokens
- API keys
- S3/R2 credentials
- RevenueCat webhook secrets
- uploaded file contents
- source base64
- OCR text
- extracted document text
- AI prompts or full AI outputs
- payment identifiers beyond non-sensitive provider/status fields

Prefer ids, counts, status codes, request ids, and route names.

## Manual Testing

Client:

1. Set `EXPO_PUBLIC_SENTRY_DSN`.
2. Run a native development build or production build.
3. Trigger a development-only test by calling `triggerClientSentryTestError()` from `src/lib/monitoring/sentryClient.ts` during local testing.
4. Confirm the event appears in Sentry.
5. Remove the manual trigger before shipping.

Backend:

1. Set `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, and `SENTRY_RELEASE`.
2. Start the standalone backend:

```bash
npm run start:server
```

3. In non-production only, call:

```text
GET /__debug/sentry-error
```

4. Confirm the event appears in Sentry with a request id.
5. Confirm `/__debug/sentry-error` is unavailable when `NODE_ENV=production`.

## Production Checklist

- Set `SENTRY_ENVIRONMENT=production`.
- Set `SENTRY_RELEASE` to the app/backend release being deployed.
- Configure separate client and backend Sentry projects or DSNs if desired.
- Verify Sentry events do not include uploaded content or secrets.
- Keep PostHog analytics events free of document text and tokens.
- Use request ids from API responses to correlate user reports with backend Sentry events.
