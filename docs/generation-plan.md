# Flashly Generation Plan

Flashly has a backend-only flashcard generation boundary. Mock generation remains the default, and the MVP external path can call a configured AI provider from server code only. No AI provider SDK, embedding system, vector database, worker, queue, PDF parser, storage provider, or extra generation infrastructure is currently implemented.

## Generation Mode

Generation mode is controlled by a server-only environment variable:

```bash
FLASHLY_GENERATION_MODE=mock
```

Supported values:

- `mock`
- `external`

`mock` is the default. Normal startup does not require AI provider keys, provider SDKs, model configuration, storage read credentials, workers, queues, or generation environment variables.

`external` enables the MVP server-side AI generation path:

```bash
FLASHLY_GENERATION_MODE=external
FLASHLY_AI_PROVIDER=openai
FLASHLY_AI_API_KEY=...
FLASHLY_AI_MODEL=...
```

The current MVP supports `FLASHLY_AI_PROVIDER=openai` or `FLASHLY_AI_PROVIDER=gemini`. OpenAI uses the Responses API, and Gemini uses the Gemini `generateContent` API. Both paths use native `fetch`, keep provider keys server-only, and return through the same Flashly flashcard validation. Missing or unsupported AI config fails clearly through the shared API error shape. The service does not add an SDK and does not call AI from frontend code.

AI secrets must never use `EXPO_PUBLIC_`. Public Expo variables can be exposed to frontend code, so provider API keys, model secrets, gateway tokens, tracing keys, and service credentials must stay server-only.

## Current Mock Behavior

The mock generation service returns deterministic flashcards and preserves the current lifecycle response:

- `generationStatus: "complete"`
- `generationStage: "creating-deck"`
- deterministic `generationJobId`
- deterministic generated deck id
- requested card count between the current validation limits
- generated cards based on the existing mock flashcard templates
- `retryable: false`

It does not call AI, read full extracted text, execute prompts, validate model output, persist generated decks, or require environment variables.

## MVP Local Persistence

Generated deck/card responses are persisted in the app for the MVP through the existing Zustand + AsyncStorage upload store. When the upload flow receives a successful `GenerateFlashcardsResponse`, it saves the returned `deck` and `cards` into the local generated deck collection.

This keeps Flashly demoable after an app restart without adding a database too early. Generated decks appear beside built-in mock decks, open in Deck Detail, provide cards to Review, and remain available to the current local Assistant context.

The backend generation route still does not persist generated decks/cards. The local store upserts by generated deck id, so handling the same response again replaces the existing local copy instead of adding a duplicate. This is device-specific and will later migrate behind the server repository/database boundary.

Before saving, the app verifies that the generation response has a valid deck id and at least one usable card with a question and answer for that deck. Empty or malformed generated decks are rejected with a friendly upload error instead of being added to local storage.

## Current External Behavior

The external generation service:

1. Requires `FLASHLY_AI_PROVIDER=openai` or `FLASHLY_AI_PROVIDER=gemini`, plus `FLASHLY_AI_API_KEY` and `FLASHLY_AI_MODEL`.
2. Requires extracted study material text through the generation service input.
3. Sends a strict flashcard-generation prompt to the AI provider from backend/server code.
4. Requests JSON output with a `flashcards` array.
5. Parses JSON safely.
6. Keeps cards with non-empty `question` and `answer`.
7. Trims question and answer text to the existing generation limits.
8. Removes duplicate questions.
9. Returns the existing `GenerateFlashcardsResponse` shape.

External mode does not silently generate from mock or fallback study text. If extracted source text is unavailable, it returns a typed `not-ready` error explaining that extracted text is required.

In the current backend-enabled MVP, `.txt`, `.md`, text-based PDF, and configured JPG/PNG OCR uploads can provide real source text through the extraction route. The extraction response returns a capped `extractedTextPreview`, and the upload flow passes that text into generation. Scanned PDF OCR, guaranteed handwriting OCR, slides, and broad document extraction remain future work.

The frontend does not silently treat API generation failures as successful AI output. Missing AI environment variables, provider failures, invalid JSON output, and empty validated card output surface as safe user-facing upload errors. Network-style backend failures may still fall back to the existing local mock flow, matching the current repository fallback model.

## Future Real Flow

A fuller external generation service should:

1. Read validated generation metadata from the route.
2. Use a server-side full text reference or source chunk reference from extraction.
3. Build provider prompts and model configuration only on the server.
4. Request flashcards from a selected AI provider using server-only secrets.
5. Validate output against `FlashcardDTO` shape and current limits.
6. Reject malformed or unsafe responses instead of coercing bad data silently.
7. Preserve source references such as section, page, or chunk id when available.
8. Create or update generation job lifecycle metadata.
9. Persist the generated deck/cards through repository/database boundaries when persistence exists.
10. Return the same public response shape to the frontend.

The route can pass `extractedTextPreview`, `fullTextRef`, or `sourceChunks` into the generation service. The preview is only a short API-safe summary; production generation should prefer full extracted text or source chunks stored server-side.

## Idempotency Expectations

The current request requires `idempotencyKey`. In mock mode it shapes deterministic job ids only.

Future real generation should store idempotency records server-side so retries with the same user, route, and request body return the original generation result instead of creating duplicate decks/cards.

## Smoke Check

Backend smoke checks continue to pass in mock generation mode.

In external mode, the smoke check validates AI configuration but skips the provider call unless:

```bash
FLASHLY_GENERATION_SMOKE_ALLOW_AI=true
FLASHLY_GENERATION_SMOKE_SOURCE_TEXT="Real extracted study material text..."
```

This prevents accidental AI calls during normal developer smoke checks.

## Demo QA

Manual MVP demo coverage lives in `docs/mvp-qa-checklist.md`.

## Still Not Implemented

- provider choices beyond OpenAI and Gemini
- persisted generation jobs
- server/database persisted generated decks and cards
- full extracted text reads
- source chunk reads
- model output repair or retry loops
- token budgeting for long source material
- embeddings, RAG, or vector databases
- workers, queues, cron jobs, or external services
