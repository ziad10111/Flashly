# Backend Mode Verification

Flashly is local/mock by default. The mock backend API routes exist so repository calls can be switched gradually without adding real AI, OCR, parsing, storage, databases, queues, secrets, or external services.

## Demo MVP Setup

For the final demo runbook, script, known limitations, and troubleshooting notes, see:

```text
docs/demo-mvp-runbook.md
docs/mvp-qa-checklist.md
```

Safe mock-only mode:

```env
EXPO_PUBLIC_USE_BACKEND=false
EXPO_PUBLIC_FLASHLY_AUTH_MODE=mock
FLASHLY_DATA_MODE=mock
FLASHLY_STORAGE_MODE=mock
FLASHLY_EXTRACTION_MODE=mock
FLASHLY_GENERATION_MODE=mock
```

Backend AI demo mode:

```env
EXPO_PUBLIC_USE_BACKEND=true
EXPO_PUBLIC_FLASHLY_AUTH_MODE=mock
FLASHLY_DATA_MODE=mock
FLASHLY_STORAGE_MODE=mock
FLASHLY_EXTRACTION_MODE=external
FLASHLY_GENERATION_MODE=external
# Use openai or gemini.
FLASHLY_AI_PROVIDER=openai
FLASHLY_AI_API_KEY=your_server_only_key_here
# For example: gpt-4.1-mini or gemini-2.5-flash.
FLASHLY_AI_MODEL=your_model_here
FLASHLY_PDF_EXTRACTION_PROVIDER=local
# Optional for JPG/PNG OCR:
FLASHLY_OCR_PROVIDER=ocrspace
FLASHLY_OCR_API_KEY=your_server_only_ocr_key_here
```

`FLASHLY_AI_API_KEY` and `FLASHLY_OCR_API_KEY` must never use the `EXPO_PUBLIC_` prefix. Public Expo variables can be exposed to frontend code, so AI keys, OCR keys, provider tokens, backend secrets, storage credentials, and database URLs must stay server-only.

The demo AI generation path supports `.txt`, `.md`, text-based PDF, JPG, and PNG files. JPG/PNG OCR requires server-only OCR provider configuration. Scanned PDF OCR, slide parsing, and guaranteed handwritten note processing are future work.

## Normal Local Mode

Use the app normally with no backend flag:

```bash
npm run start
```

`EXPO_PUBLIC_USE_BACKEND` defaults to `false`, so repositories read local mock data, Zustand stores, and AsyncStorage-backed progress.

## Backend Mode

Enable backend mode explicitly:

```bash
EXPO_PUBLIC_USE_BACKEND=true npm run start
```

On Windows PowerShell:

```powershell
$env:EXPO_PUBLIC_USE_BACKEND="true"; npm run start
```

`EXPO_PUBLIC_FLASHLY_API_BASE_URL` is optional. If omitted, `apiRequest()` uses relative Expo API routes such as `/api/decks`. Set it only when testing against a separate deployed API host.

Backend auth mode is also explicit:

```bash
EXPO_PUBLIC_FLASHLY_AUTH_MODE=mock
```

`mock` is the default. Normal app startup does not require Clerk backend secrets or server auth configuration.

`clerk` mode is reserved for future server-side Clerk verification:

```bash
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
```

When `clerk` mode is enabled today, API routes expect `Authorization: Bearer <token>` and return typed `unauthorized` responses because real server-side Clerk verification is not connected yet. This is intentional.

## Backend Data Mode

Server data mode is explicit and backend-only:

```bash
FLASHLY_DATA_MODE=mock
```

Supported values:

- `mock`
- `database`

`mock` is the default. With no data mode configured, API routes use the current mock server repositories and normal startup does not require a database.

`database` mode is reserved for future persistence:

```bash
FLASHLY_DATA_MODE=database
```

When enabled today, routes select placeholder database repositories from:

```ts
src/api/server/repositories/database
```

Those placeholders implement the same server repository interfaces as the mock repositories, but no database client, ORM, migrations, storage provider, or connection string is connected yet. Calls fail clearly through the shared API error shape instead of pretending to persist data.

Future database secrets must be server-only environment variables, for example a future `FLASHLY_DATABASE_URL`. Do not use `EXPO_PUBLIC_` for database connection strings or service keys because public Expo variables can be exposed to frontend code.

## Backend Storage Mode

Server storage mode is explicit and backend-only:

```bash
FLASHLY_STORAGE_MODE=mock
```

Supported values:

- `mock`
- `external`

`mock` is the default. Normal app startup does not require a storage bucket, storage provider SDK, upload token, signed URL secret, or service credential.

`external` mode is reserved for future real file storage:

```bash
FLASHLY_STORAGE_MODE=external
```

When enabled today, upload creation selects a provider-neutral placeholder service from:

```ts
src/api/server/storage
```

The placeholder does not connect to a provider and does not fake a successful upload. Calls fail clearly through the shared API error shape until a real provider implementation is added.

Storage secrets must be server-only environment variables. Do not use `EXPO_PUBLIC_` for storage credentials, bucket write keys, service-role keys, signed URL secrets, or provider tokens because public Expo variables can be exposed to frontend code.

Frontend code should continue calling upload repositories and backend API routes. It should not import storage config, storage services, provider SDKs, or storage secrets directly.

## Backend Extraction Mode

Server extraction mode is explicit and backend-only:

```bash
FLASHLY_EXTRACTION_MODE=mock
```

Supported values:

- `mock`
- `external`

`mock` is the default. Normal app startup does not require PDF parsing libraries, OCR provider SDKs, AI providers, storage read credentials, worker infrastructure, or extraction environment variables.

`external` mode enables the MVP real text extraction path:

```bash
FLASHLY_EXTRACTION_MODE=external
```

When enabled, extraction routes select the external extraction service from:

```ts
src/api/server/extraction
```

The MVP external path accepts validated `sourceText` for simple text-based uploads and validated `sourceBase64` for small text PDFs and JPG/PNG images. It does not read from storage, run workers, persist full extracted text, or process scanned PDFs.

Supported text inputs:

- `.txt`
- `.md`
- text-based `.pdf`
- `.jpg`
- `.jpeg`
- `.png`
- `text/plain`
- `text/markdown`
- common markdown MIME variants such as `text/x-markdown` and `text/md`
- `application/pdf`
- `image/jpeg`
- `image/png`

Limits:

- frontend reads text files up to `64 KB`
- backend accepts `sourceText` up to `12,000` characters
- backend accepts PDF base64 input up to `4 MB`
- backend accepts JPG/PNG base64 input up to `3 MB`
- backend requires at least `40` useful characters
- extracted text preview is capped at `6,000` characters

PDF extraction uses a local backend parser for selectable text. Image OCR uses `FLASHLY_OCR_PROVIDER=ocrspace` when server-only OCR config is present. Scanned PDFs, document-like materials, HEIC images, slides, and unreadable OCR results return typed safe errors instead of fake extracted text.

Extraction and OCR secrets must be server-only environment variables. Do not use `EXPO_PUBLIC_` for OCR keys, document parsing credentials, AI vision keys, storage read credentials, or provider tokens because public Expo variables can be exposed to frontend code.

Frontend code should continue calling backend API routes. It should not import extraction config, extraction services, OCR SDKs, parsing SDKs, provider clients, or provider secrets directly.

## Backend Generation Mode

Server flashcard generation mode is explicit and backend-only:

```bash
FLASHLY_GENERATION_MODE=mock
```

Supported values:

- `mock`
- `external`

`mock` is the default. Normal app startup does not require AI provider SDKs, AI keys, model configuration, prompt files, storage read credentials, workers, queues, or generation environment variables.

`external` mode enables the MVP server-side AI flashcard generation path:

```bash
FLASHLY_GENERATION_MODE=external
# Use openai or gemini.
FLASHLY_AI_PROVIDER=openai
FLASHLY_AI_API_KEY=...
FLASHLY_AI_MODEL=...
```

When enabled, generation routes select the external generation service from:

```ts
src/api/server/generation
```

The MVP external path supports OpenAI through native `fetch` to the Responses API and Gemini through native `fetch` to the Gemini `generateContent` API. It does not add an AI SDK and does not call AI from frontend code. Missing env vars, unsupported providers, missing source text, provider failures, invalid JSON, and empty validated card output all fail through safe shared API errors.

AI secrets must be server-only environment variables. Do not use `EXPO_PUBLIC_` for AI provider keys, gateway tokens, tracing keys, model credentials, or service secrets because public Expo variables can be exposed to frontend code.

Frontend code should continue calling backend API routes. It should not import generation config, generation services, AI SDKs, prompt internals, model config, or provider secrets directly.

## Mock Routes

Current mock routes:

- `POST /api/uploads`
- `GET /api/uploads/:id/status`
- `POST /api/materials/:id/extract`
- `POST /api/materials/:id/generate-flashcards`
- `GET /api/decks`
- `GET /api/decks/:id`
- `POST /api/review-sessions`
- `GET /api/progress`
- `POST /api/assistant/chat`
- `GET /api/assistant/conversations/by-deck/:deckId`

Routes remain mock-backed by default. The extraction route can return real text extraction metadata only when `FLASHLY_EXTRACTION_MODE=external` and valid text `sourceText` is supplied.

## Backend Server Repository Boundary

API routes read data through selected server-side repositories in:

```ts
src/api/server/repositories
```

These are different from the frontend repositories in:

```ts
src/api/repositories
```

Frontend repositories are used by screens and decide whether to call local/Zustand data or backend API routes behind `EXPO_PUBLIC_USE_BACKEND`.

Server repositories are used by API routes and wrap the current backend mock data. They expose typed data-access functions for uploads, materials, decks, review sessions, progress, and Study Assistant conversations. This keeps route logic independent from `mockData.ts` so a future database implementation can replace the mock repository files without rewriting every route.

Repository selection lives in:

```ts
src/api/server/repositories/index.ts
```

It selects mock repositories by default and selects database repositories only when `FLASHLY_DATA_MODE=database`.

Current default behavior is still mock-only:

- no database reads or writes
- no persistent upload jobs
- no persisted generated decks from the mock generation route
- no persisted review sessions
- no persisted server-side assistant messages
- no storage, OCR, parsing, AI, queues, workers, or external services

When real persistence is added later, keep the route contracts stable and replace the mock server repositories with database-backed implementations that enforce user ownership server-side.

## Database Planning

Provider-neutral database planning now lives in:

```ts
docs/database-plan.md
src/api/server/schema
```

These files define future persistence-facing schema types and relationships only. No database client, ORM, migrations, connection strings, or runtime persistence layer is connected. The current API routes still use mock server repositories.

## Upload Metadata Validation

`POST /api/uploads` validates metadata only. It does not upload bytes, inspect file contents, parse documents, or create a real storage object.

Current mock limits:

- Max file size: `25 MB`
- Allowed extensions: `pdf`, `txt`, `md`, `jpg`, `jpeg`, `png`, `heic`, `ppt`, `pptx`
- Allowed MIME types include PDF, text, markdown, JPEG, PNG, HEIC, and common PowerPoint MIME types

The mock response includes production-shaped fields such as:

- `uploadJobId`
- `materialId`
- `fileName`
- `fileSize`
- `mimeType`
- `sourceType`
- `status`
- `stage`
- `progressPercentage`
- `ocrStatus`
- `ocrRequired`
- `idempotencyKey`
- `storageKey`

`storageKey` is a mock placeholder only. It is not a provider path, signed URL, bucket key, or storage credential.

The upload route now prepares `storageKey` through the selected backend storage service. In default mock mode, the key remains deterministic and development-safe. In explicit external mode, the route fails clearly until real storage is implemented.

Future real storage can use either backend-mediated uploads or signed upload URLs. In both approaches, the backend should create upload jobs, derive ownership from server-verified auth, generate storage references server-side, and keep provider credentials out of frontend code.

`GET /api/uploads/:id/status` returns a deterministic mock lifecycle response. There is no background worker; the route simply reports a typed mock status so repository switching can be verified.

## Material Extraction And OCR

`POST /api/materials/:id/extract` is an extraction lifecycle route. It validates request metadata and route params. In mock extraction mode, it returns deterministic metadata. In external extraction mode, it can turn text/markdown `sourceText` into real extracted text metadata.

The route prepares lifecycle metadata through the selected backend extraction service in `src/api/server/extraction`. In default mock mode, the service preserves the current deterministic metadata-only behavior. In explicit external mode, it supports text/markdown source text, text-based PDF base64 input, and JPG/PNG OCR base64 input when configured.

The route validates:

- `materialId` is present
- request `materialId` matches the route id
- source type is supported for future extraction
- `forceOcr` can request the OCR branch for mock lifecycle testing
- optional `sourceText` is only accepted for text-based materials
- optional `sourceText` is length-limited and must contain useful text after trimming
- optional `sourceBase64` is only accepted for PDF and image materials
- optional `sourceBase64` is size-limited and MIME-validated

The response includes production-shaped metadata:

- `material`
- `extractionStage`
- `extractionStatus`
- `ocrStatus`
- `ocrRequired`
- `extractedTextPreview`
- `textLength`
- `pageCount`

Mock OCR behavior is metadata-only:

- image-like material ids or `forceOcr: true` return `ocrRequired: true` and `ocrStatus: "complete"`
- normal text/PDF-like material ids return `ocrRequired: false` and `ocrStatus: "not-needed"`

The extracted text preview is capped before it is returned. Full extracted text should later be stored server-side and exposed through scoped APIs only when needed.

In the current MVP backend-enabled flow, the app reads small `.txt`/`.md` files locally as `sourceText` and small PDF/JPG/PNG files locally as `sourceBase64`. The route returns a real `extractedTextPreview`, which the upload flow passes to generation.

`storageKey` remains an opaque reference to the uploaded source material. Later, real extraction can use that key to read the original PDF, text file, image, scanned document, or handwritten material through server-only storage credentials. The preview returned by this route is not the same as full extracted text; full text should be retained server-side, likely under a separate extracted-text storage key, and then transformed into source chunks for flashcard generation and Study Assistant citations.

## Flashcard Generation

`POST /api/materials/:id/generate-flashcards` is a flashcard generation lifecycle route. It validates request metadata and returns a production-shaped response. Mock mode does not call an AI provider, execute prompts, parse extracted text, or persist generated decks. External mode calls the configured server-side AI provider only when extracted study material text is supplied.

The route now prepares generation lifecycle metadata and generated card DTOs through the selected backend generation service in `src/api/server/generation`. In default mock mode, the service preserves the current deterministic generated deck/card behavior. In explicit external mode, it calls the configured server-side AI provider only when extracted study material text is available.

The route validates:

- `materialId` is present
- request `materialId` matches the route id
- `idempotencyKey` is present
- `requestedCardCount` is between `3` and `20`
- `difficulty`, when provided, is `easy`, `medium`, or `hard`
- mock material readiness, using `not-ready` in the material id as a validation failure

The response includes:

- `generationJobId`
- `generationStatus`
- `generationStage`
- `deckId`
- `deckStatus`
- `requestedCardCount`
- `generatedCardCount`
- generated `deck`
- generated `cards`
- `idempotencyKey`
- `retryable`

Generation stages are metadata-only. Real AI integration should later validate model output against `FlashcardDTO`, reject malformed cards, preserve source section/page/chunk references where available, and avoid exposing provider prompts, API keys, or model configuration to the frontend.

Future generation should use full extracted text or source chunks stored server-side. The extracted text preview can remain an API-safe summary, but it should not be treated as the complete source of truth for high-quality flashcard generation.

The current external MVP validates AI output by parsing JSON, reading a `flashcards` array, keeping cards with non-empty questions and answers, trimming text to existing limits, removing duplicate questions, and failing clearly when no valid cards remain.

External mode does not silently generate from fake text. If source text is unavailable, the route returns a `not-ready` generation error.

Future idempotency should store generation request keys server-side so retries do not create duplicate decks/cards.

The generated deck response is not persisted by the mock API or server repositories. `GET /api/decks/:id` only knows about the fixed backend mock deck unless future server persistence is added.

For the MVP, the frontend upload flow persists successful generation responses locally through the existing Zustand + AsyncStorage upload store. When backend mode is enabled and generation succeeds, the app saves the returned deck/cards into the local generated deck collection. Deck repositories merge those locally generated decks with built-in/mock decks, and generated deck detail/cards resolve from the persisted local store after restart.

Duplicate handling is local and deck-id based: if the same generated deck id is saved again, the app replaces the existing generated deck/cards instead of appending another copy.

The upload flow validates generated responses before saving them. If the response has no valid deck id or no usable cards for that deck, Flashly shows a friendly save error and does not add a broken generated deck.

Manual expected flow:

```text
upload/generate deck
-> deck appears in Decks
-> open deck detail
-> restart app
-> deck still appears
-> cards still open
-> review works
```

Manual expected backend text flow:

```text
select .txt/.md file
-> extract real text
-> generate AI flashcards from that text
-> persist generated deck
-> restart app
-> generated deck still opens
```

Known limitation: generated decks/cards are device-local until real database persistence is implemented.

Manual MVP QA coverage lives in:

```ts
docs/mvp-qa-checklist.md
```

## Review Sessions And Progress

`POST /api/review-sessions` is a mock server-side review lifecycle route. It validates the review payload and returns production-shaped progress metadata, but it does not persist sessions or replace local/Zustand progress.

The route validates:

- `deckId` is present
- `idempotencyKey` is present
- `mode` is one of `full-deck`, `weak-cards`, or `quick-review`
- `startedAt`, `completedAt`, and card `answeredAt` values are valid timestamps
- `completedAt` is after `startedAt`
- at least one card review is present
- card ids are present and not duplicated in the same session
- answers are `known` or `again`

The response includes:

- `sessionId`
- `deckId`
- `mode`
- `cardsReviewed`
- `reviewedCardIds`
- known/unknown counts
- `xpEarned`
- `totalXp`
- `dailyStreak`
- `deckCompletionPercentage`
- `completedDeck`
- `weakCardCount`
- `weakCardIds`
- `cardStates`
- `startedAt`
- `completedAt`
- `retryable`

Mock XP rules live in `src/api/server/reviewRules.ts`. Current backend mock values use `7 XP` for known cards and `2 XP` for review-again cards. These are backend mock rules only; the current app still uses local/Zustand progress by default.

`GET /api/progress` returns a typed mock progress summary with XP, streak, weak cards, completed deck ids, reviewed card count, generated deck count, and last activity/review metadata. It does not read from a database.

## Smoke Check Utility

The developer utility lives at:

```ts
src/api/dev/backendSmokeCheck.ts
```

It exports:

```ts
runBackendSmokeCheck()
```

The function calls backend repository and service boundary functions, not screens:

- `getDecks()`
- `getDeckById()`
- `getCardsForDeck()`
- `getProgressSummary()`
- `createUploadJob()`
- `getUploadStatus()`
- `extractMaterial()`
- `generateFlashcards()`
- `createReviewSession()`
- `getAssistantConversation()`

It returns a typed summary with pass/fail details per check and does not run automatically. The summary includes `authMode`, `dataMode`, `storageMode`, `extractionMode`, and `generationMode`.

In default mock auth mode, the smoke check does not need a Clerk token. In explicit `clerk` auth mode, direct API route calls without a valid Bearer token will return unauthorized. Repository-level smoke checks may still pass through local fallback, depending on `EXPO_PUBLIC_USE_BACKEND`.

In default mock data mode, the smoke check continues to pass against mock server repositories. In explicit `database` mode, the current placeholder database repositories report clear not-configured failures without requiring a real database at startup.

In default mock storage mode, the smoke check prepares a mock storage key and continues to pass. In explicit `external` storage mode, the upload creation check reports the storage not-configured failure without requiring storage provider environment variables at startup.

In default mock extraction mode, the smoke check prepares a mock extraction lifecycle response and continues to pass. In explicit `external` extraction mode, the extraction check uses a small text sample so it can verify the MVP text path without OCR, PDF parsing, storage reads, or external services.

In default mock generation mode, the smoke check prepares a mock generation lifecycle response and continues to pass. In explicit `external` generation mode without AI env vars, the generation check reports the generation not-configured failure without requiring AI provider environment variables at startup.

In explicit `external` generation mode with AI env vars, the smoke check validates readiness but does not call the provider unless:

```bash
FLASHLY_GENERATION_SMOKE_ALLOW_AI=true
FLASHLY_GENERATION_SMOKE_SOURCE_TEXT="Real extracted study material text..."
```

## Fallback Behavior

When `EXPO_PUBLIC_USE_BACKEND=true`, supported repositories try mock API routes first. If a request fails, `withBackendFallback()` returns local/mock data. When the flag is false, backend requests are skipped.

The upload screen keeps this fallback for network-style backend failures. Typed extraction and generation API errors are shown to the user instead of being converted into fake AI success.

Generated decks are still local/Zustand-backed and persisted with AsyncStorage. Backend-mode deck lists merge backend mock decks with locally generated decks where supported, and generated deck detail falls back to local data.

## API Error And Lifecycle Conventions

API errors use one shared shape:

```ts
{
  error: {
    code: "validation-error" | "unsupported-media" | "not-ready" | "conflict" | "unauthorized" | "forbidden" | "not-found" | "processing-failed" | "rate-limited" | "internal" | "unknown",
    message: string,
    retryable?: boolean
  }
}
```

Routes use shared response helpers from `src/api/server/responses.ts`. Validation helpers return typed `ApiErrorDTO` values and routes convert them to consistent HTTP statuses:

- `400` for validation errors
- `401` for unauthorized requests
- `403` for forbidden resource access
- `404` for missing resources
- `409` for future idempotency/conflict cases
- `415` for unsupported media
- `425` for processing not ready
- `429` for future rate limits
- `500` for internal/mock failures

Lifecycle fields use explicit status/stage pairs where useful:

- Upload: `status` plus `stage`
- Extraction: `extractionStatus` plus `extractionStage`
- Generation: `generationStatus` plus `generationStage`
- Review: session response plus card review states

Timestamps are ISO strings. IDs are opaque strings. Idempotent write-style routes use `idempotencyKey`.

## Auth And Ownership

Current API routes use a mock backend auth boundary in:

```ts
src/api/server/auth.ts
```

Mock mode returns a deterministic mock user id and uses no secrets. This keeps the current API skeleton usable without requiring backend environment variables.

Auth mode is configured by `EXPO_PUBLIC_FLASHLY_AUTH_MODE`, which defaults to `mock`.

Future real Clerk verification belongs in `verifyClerkRequest()`. That function should verify the Clerk session/JWT server-side with backend-only utilities and derive `userId` from verified token claims. Backend routes must not trust a user id sent from the frontend.

The generic API client accepts either `authToken` or `getAuthToken`, so future frontend repositories can pass a Clerk session token without adding screen-level fetch logic. The API client does not import Clerk hooks directly.

Do not put backend Clerk secrets in `EXPO_PUBLIC_` variables. Server-only Clerk config should use backend-only environment variables when real verification is implemented.

Ownership guard placeholders live in:

```ts
src/api/server/ownership.ts
```

These guards prepare checks for user-owned uploads, materials, decks, review sessions, and assistant conversations. They currently allow mock resource ids in mock mode and should later be replaced with database-backed checks such as `resource.userId === auth.userId`.

Unauthorized and forbidden responses use the shared error shape:

```ts
{
  "error": {
    "code": "unauthorized" | "forbidden",
    "message": "..."
  }
}
```

## Assistant Caveats

Assistant conversation fetch supports backend mode through `GET /api/assistant/conversations/by-deck/:deckId`. Sending assistant messages remains local/mock so existing Zustand conversation persistence keeps working.

## Intentionally Not Implemented

Not included yet:

- real Clerk backend token verification
  - provider choices beyond OpenAI
- persisted generation jobs
- server/database persisted generated decks/cards
- real storage-backed extracted text reads
- source chunk reads
- OCR or document parsing
- extraction/OCR provider environment variables
- full extracted text storage
- real extraction workers
- retrieval/RAG or embeddings
- vector databases
- file storage
- real signed upload URLs
- remote upload byte transfer
- external storage provider SDKs
- storage provider environment variables
- database persistence
- real database client, schema migrations, or connection pooling
- server-only database environment variables
- server-authoritative progress persistence
- queues, workers, or webhooks
- secret keys or server tokens

## Verification Checklist

Run:

```bash
npm run typecheck
npm run lint
```

For API route runtime checks, start Expo with backend mode enabled and call the smoke utility from a temporary dev-only context. Do not add permanent visible UI for this.
