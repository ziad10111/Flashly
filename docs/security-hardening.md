# Flashly Security Hardening

Flashly now has a centralized security layer for the standalone backend server. It is designed to improve production safety without changing the local Expo development flow.

## Protections Added

- request ids on every standalone backend response
- structured safe error responses
- production-safe generic 500 messages
- server-side error logs with request ids
- CORS origin allowlist support
- separate in-memory rate-limit buckets
- request body size enforcement
- JSON content-type enforcement for API POST routes
- strict upload MIME and extension allowlist
- filename sanitization for upload metadata and chunk sessions
- chunk upload total-size and assembled-size validation
- security smoke checks for blocked uploads and oversized chunk starts

## Environment Variables

```bash
FLASHLY_ALLOWED_ORIGINS=https://your-app.example,https://your-admin.example
FLASHLY_RATE_LIMIT_WINDOW_MS=60000
FLASHLY_RATE_LIMIT_MAX=120
FLASHLY_AUTH_RATE_LIMIT_MAX=30
FLASHLY_UPLOAD_RATE_LIMIT_MAX=30
FLASHLY_GENERATION_RATE_LIMIT_MAX=20
FLASHLY_SERVER_MAX_BODY_BYTES=83886080
```

`FLASHLY_ALLOWED_ORIGINS` replaces the older single-origin behavior for production. If it is empty in development, the server allows the incoming origin. In production, configure it explicitly for browser/web clients. Native mobile requests usually do not send a browser `Origin` header.

## Rate Limit Defaults

Default window:

```text
60 seconds
```

Default limits per client key:

- general API: 120 requests/window
- auth-sensitive billing/subscription routes: 30 requests/window
- upload routes: 30 requests/window
- generation routes: 20 requests/window

The client key is based on forwarded IP headers when available, with a fallback for local development. For multi-instance production deployments, replace the in-memory store with Redis or the hosting provider's edge rate limiter.

## Upload Restrictions

Allowed extensions:

```text
pdf, png, jpg, jpeg, txt, md
```

Allowed MIME types:

```text
application/pdf
image/png
image/jpeg
text/plain
text/markdown
text/x-markdown
```

Blocked by default:

- executables
- archives
- unknown binary files
- presentation files
- broad `image/*` or `text/*` MIME claims that are not in the allowlist

Direct uploads and chunk upload starts both require the filename extension and MIME type to be allowed. Chunk uploads also validate each chunk size, total chunk count, final assembled size, and upload id shape.

## Error Handling

Production responses do not include stack traces. Each standalone backend response includes:

```text
X-Request-Id
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

Use the request id to correlate client-visible errors with backend logs.

## Ownership Verification

In database mode, `src/api/server/ownership.ts` verifies resource ownership directly against PostgreSQL before protected route handlers read or mutate user-owned resources.

Helpers include:

- `assertUploadOwner`
- `assertMaterialOwner`
- `assertDeckOwner`
- `assertFlashcardOwner`
- `assertReviewSessionOwner`
- `assertDeckFlashcardsAccess`

Protected route families reviewed:

- decks
- materials extraction and generation
- uploads and upload status
- review sessions
- assistant conversations
- subscription status and RevenueCat webhooks

Mock mode remains permissive for local development. Database mode only returns success when the resource row belongs to the authenticated Clerk user. Failed checks return a generic forbidden response so another user's resource existence is not revealed.

Review session creation verifies both the deck owner and every reviewed card id before writing review answers. Chunk upload sessions are bound to the authenticated user id at start, part, complete, and extraction read time.

## Smoke Test

Start the backend, then run:

```bash
npm run smoke:security
npm run smoke:ownership
```

The security smoke test checks:

- executable upload metadata is blocked
- oversized chunk upload start is rejected
- rate-limit response shape when the server is started with a low `FLASHLY_RATE_LIMIT_MAX`

The ownership smoke test requires `DATABASE_URL` and checks:

- user A can access own upload, material, deck, flashcard, and review session rows
- user B cannot match user A resource rows
- deck-card ownership checks reject cross-user access

To test rate-limit shape:

```bash
FLASHLY_RATE_LIMIT_MAX=2 npm run start:server
npm run smoke:security
```

## Production Checklist

- Set `NODE_ENV=production`.
- Set `FLASHLY_ALLOWED_ORIGINS` for any browser clients.
- Run `npm run verify:production`.
- Run `npm run db:migrate`.
- Run `npm run smoke:database`.
- Run `npm run smoke:ownership`.
- Run `npm run smoke:storage`.
- Run `npm run smoke:security`.
- Confirm hosting proxy body size and timeout settings support large uploads.
- Confirm Clerk, RevenueCat, NVIDIA, OCR.space, PostgreSQL, and S3/R2 secrets are server-only.
- For horizontal scaling, move rate limits from memory to shared storage.
