# Flashly Database Plan

This plan is provider-neutral. No database client, ORM, migrations, connection strings, storage provider, AI service, OCR service, worker, or queue is currently implemented.

## Recommended Direction

Flashly is a good fit for a relational database once mock/local persistence is replaced with server persistence. Postgres, including a managed option such as Supabase, would fit well because the app needs user-owned records, joins across materials/decks/cards/reviews, transactional idempotent writes, and indexed progress queries.

The current app should continue using local/mock repositories by default. When persistence is added, replace the mock server repositories in `src/api/server/repositories` with DB-backed implementations while keeping API contracts stable.

## Current MVP Persistence

Generated decks and flashcards are currently persisted locally in the app with Zustand + AsyncStorage. This is intentionally an MVP bridge, not a real database integration.

Local generated deck persistence:

- stores successful `GenerateFlashcardsResponse` deck/card data on the device
- keeps built-in mock decks separate from generated decks
- preserves generated deck ids and card ids
- upserts by deck id to avoid duplicates when a response is handled more than once
- lets Decks, Deck Detail, Review, progress, and the current local Assistant context resolve generated deck data after restart

Known limitation: local generated decks/cards are device-specific and will not sync across devices or accounts.

Future production persistence should move this data to server repositories backed by `decks`, `flashcards`, and `flashcard_generation_jobs`, with server-side user ownership and idempotency records. The frontend repository contracts should remain stable while the source of truth moves from AsyncStorage to the backend/database boundary.

## Data Mode Configuration

Server repository selection is controlled by a backend-only environment variable:

```bash
FLASHLY_DATA_MODE=mock
```

Supported values:

- `mock`
- `database`

`mock` is the default. Normal app startup must not require database environment variables, connection strings, migrations, storage buckets, or provider credentials.

`database` mode is an explicit future switch. Today it selects placeholder database repositories in:

```text
src/api/server/repositories/database
```

Those placeholders implement the same TypeScript interfaces as the mock repositories, but they do not connect to a database and do not fake persistence. They throw a typed server-only not-configured error that API routes convert into the shared safe error response shape.

Database secrets must be server-only variables such as a future `FLASHLY_DATABASE_URL`, not `EXPO_PUBLIC_*` variables. `EXPO_PUBLIC_*` values can be bundled into frontend code, so they must never contain database URLs, service-role keys, Clerk backend secrets, OCR keys, AI keys, storage credentials, or any other server secret.

Frontend code should continue using frontend repositories and API contracts. It should not import database config or database clients directly.

## Storage Boundary

File storage is a separate backend-only boundary from database persistence. Storage mode is controlled by:

```bash
FLASHLY_STORAGE_MODE=mock
```

Supported values:

- `mock`
- `external`

`mock` is the default and preserves the current metadata-only upload flow. It creates deterministic mock `storageKey` values, does not upload or read files, and requires no storage provider environment variables.

`external` is a future placeholder mode. It should be enabled only when a real backend storage implementation exists. Today it fails clearly instead of pretending to store files.

Storage secrets must remain server-only. Do not use `EXPO_PUBLIC_` for storage credentials, signed URL secrets, bucket write keys, or provider service tokens. Frontend code should not import storage config or provider SDKs.

`upload_jobs.storage_key` and `study_materials.storage_key` should reference the storage object that contains the original uploaded file. Future extracted text may use a separate `extracted_text_storage_key` so source files and processed text can have separate retention and access rules.

## Extraction Boundary

Text extraction and OCR are separate backend-only service concerns from database persistence. Extraction mode is controlled by:

```bash
FLASHLY_EXTRACTION_MODE=mock
```

Supported values:

- `mock`
- `external`

`mock` is the default and preserves the current deterministic preview-only extraction metadata. It does not read uploaded files, parse PDFs, run OCR, call AI, or require environment variables.

`external` is a future placeholder mode. Today it fails clearly through the shared API error shape and should only be enabled once a real server-side extraction/OCR provider implementation exists.

Extraction and OCR secrets must remain server-only. Do not use `EXPO_PUBLIC_` for OCR provider keys, document parsing credentials, AI vision keys, storage read credentials, or provider tokens. Frontend code should not import extraction config or provider SDKs.

Future database rows should treat `extracted_text_preview` as a short UI/API summary only. Full extracted text should be stored server-side, commonly behind an `extracted_text_storage_key`, and source chunks should be created from the full text for flashcard generation and Study Assistant citations.

## Generation Boundary

Flashcard generation is a separate backend-only service concern from database persistence. Generation mode is controlled by:

```bash
FLASHLY_GENERATION_MODE=mock
```

Supported values:

- `mock`
- `external`

`mock` is the default and preserves the current deterministic generated deck/card response. It does not call AI, read full extracted text, validate model output, persist generated decks, or require environment variables.

`external` is a future placeholder mode. Today it fails clearly through the shared API error shape and should only be enabled once a real server-side AI provider implementation exists.

AI secrets must remain server-only. Do not use `EXPO_PUBLIC_` for provider keys, gateway tokens, tracing keys, model credentials, or service secrets. Frontend code should not import generation config or provider SDKs.

Future persisted generation should use `flashcard_generation_jobs`, `decks`, and `flashcards` together. The generation service should prepare lifecycle metadata and generated card DTOs, then repository/database code should persist the resulting deck/cards and idempotency records.

## Ownership Model

Every user-owned table should include `user_id`.

Backend routes must derive this value from verified Clerk auth on the server. They must not trust a user id sent in a request body. Ownership checks should follow the pattern:

```text
resource.user_id === auth.userId
```

The app already has placeholder auth and ownership helpers in `src/api/server/auth.ts` and `src/api/server/ownership.ts`.

Auth is currently in mock mode by default. Future production auth should enable explicit Clerk mode, verify the Bearer token server-side, derive the Clerk user id from verified token claims, and then map that Clerk user id to the `users` table.

## Suggested Tables

### users

Stores the backend user record linked to Clerk.

- `id`
- `clerk_user_id`
- `email`
- `display_name`
- `image_url`
- `last_signed_in_at`
- `created_at`
- `updated_at`

### upload_jobs

Tracks upload metadata and lifecycle status. It should not store raw file bytes.

- `id`
- `user_id`
- `material_id`
- `deck_id`
- `file_name`
- `file_size`
- `mime_type`
- `source_type`
- `storage_key`
- `status`
- `stage`
- `progress_percentage`
- `ocr_required`
- `ocr_status`
- `idempotency_key`
- `error_code`
- `error_message`
- `created_at`
- `updated_at`

### study_materials

Represents an uploaded study material and extracted text metadata.

- `id`
- `user_id`
- `upload_job_id`
- `file_name`
- `file_type`
- `mime_type`
- `file_size`
- `storage_key`
- `extraction_status`
- `extraction_stage`
- `ocr_required`
- `ocr_status`
- `extracted_text_preview`
- `extracted_text_storage_key`
- `text_length`
- `page_count`
- `error_code`
- `error_message`
- `created_at`
- `updated_at`

### source_chunks

Planned for future Study Assistant retrieval and source citations.

- `id`
- `user_id`
- `material_id`
- `chunk_index`
- `text`
- `text_length`
- `token_count`
- `source_page`
- `source_section`
- `embedding_ref`
- `created_at`
- `updated_at`

`embedding_ref` is only a placeholder for a future embedding/vector storage reference. Do not add embeddings or a vector database yet.

### decks

Stores generated flashcard decks.

- `id`
- `user_id`
- `material_id`
- `title`
- `description`
- `source_file_name`
- `source_type`
- `status`
- `card_count`
- `generation_job_id`
- `last_reviewed_at`
- `created_at`
- `updated_at`

Progress fields in `DeckDTO`, such as `reviewedCount`, `weakCardCount`, `xpEarned`, and `completionPercentage`, should be mapped from deck and progress rows rather than duplicated everywhere.

### flashcards

Stores individual cards.

- `id`
- `user_id`
- `deck_id`
- `material_id`
- `source_chunk_id`
- `question`
- `answer`
- `explanation`
- `difficulty`
- `topic`
- `source_page`
- `source_section`
- `position`
- `created_at`
- `updated_at`

### flashcard_generation_jobs

Tracks AI generation lifecycle without storing provider secrets or prompts in frontend-accessible data.

- `id`
- `user_id`
- `material_id`
- `deck_id`
- `status`
- `stage`
- `requested_card_count`
- `generated_card_count`
- `difficulty`
- `topic_focus`
- `options`
- `idempotency_key`
- `error_code`
- `error_message`
- `created_at`
- `updated_at`

### review_sessions

Stores completed review sessions.

- `id`
- `user_id`
- `deck_id`
- `mode`
- `cards_reviewed`
- `known_count`
- `unknown_count`
- `xp_earned`
- `started_at`
- `completed_at`
- `idempotency_key`
- `created_at`
- `updated_at`

### review_answers

Stores card-level answers within a session.

- `id`
- `user_id`
- `session_id`
- `deck_id`
- `card_id`
- `answer`
- `answered_at`
- `created_at`
- `updated_at`

### card_review_states

Stores per-user, per-card aggregate review state.

- `id`
- `user_id`
- `deck_id`
- `card_id`
- `review_count`
- `known_count`
- `unknown_count`
- `is_weak`
- `last_reviewed_at`
- `next_review_at`
- `created_at`
- `updated_at`

### deck_progress

Stores per-user, per-deck aggregate progress.

- `id`
- `user_id`
- `deck_id`
- `reviewed_card_count`
- `weak_card_count`
- `xp_earned`
- `completion_percentage`
- `completed_at`
- `last_reviewed_at`
- `created_at`
- `updated_at`

### user_progress

Stores user-level progress summary.

- `id`
- `user_id`
- `total_xp`
- `daily_streak`
- `last_activity_date`
- `last_reviewed_at`
- `completed_deck_count`
- `reviewed_card_count`
- `weak_card_count`
- `generated_deck_count`
- `created_at`
- `updated_at`

### assistant_conversations

Stores Study Assistant conversation metadata scoped to deck/material context.

- `id`
- `user_id`
- `deck_id`
- `material_id`
- `title`
- `created_at`
- `updated_at`

### assistant_messages

Stores Study Assistant messages and optional source citations.

- `id`
- `user_id`
- `conversation_id`
- `deck_id`
- `material_id`
- `role`
- `content`
- `citations`
- `metadata`
- `created_at`
- `updated_at`

### idempotency_records

Stores write-style request keys so retries do not create duplicates.

- `id`
- `user_id`
- `scope`
- `idempotency_key`
- `resource_id`
- `request_hash`
- `response_snapshot`
- `expires_at`
- `created_at`
- `updated_at`

Suggested scopes:

- `upload-create`
- `flashcard-generation`
- `review-session-create`

## Relationships

- `users` owns all user data through `user_id`.
- `upload_jobs` may create one `study_materials` row.
- `study_materials` may have many `source_chunks`.
- `study_materials` may have many `decks`.
- `decks` has many `flashcards`.
- `flashcards` may reference `source_chunks`.
- `review_sessions` belongs to a `deck`.
- `review_answers` belongs to a `review_session` and `flashcard`.
- `card_review_states` aggregates progress per card.
- `deck_progress` aggregates progress per deck.
- `user_progress` aggregates progress per user.
- `assistant_conversations` belong to a deck/material context.
- `assistant_messages` belong to an assistant conversation.

## Suggested Indexes

Add these when a real database is introduced:

- `users.clerk_user_id` unique
- `upload_jobs.user_id, created_at`
- `upload_jobs.user_id, idempotency_key` unique
- `study_materials.user_id, created_at`
- `source_chunks.material_id, chunk_index` unique
- `decks.user_id, updated_at`
- `decks.material_id`
- `flashcards.deck_id, position` unique
- `flashcard_generation_jobs.user_id, idempotency_key` unique
- `review_sessions.user_id, completed_at`
- `review_sessions.user_id, idempotency_key` unique
- `review_answers.session_id`
- `card_review_states.user_id, card_id` unique
- `deck_progress.user_id, deck_id` unique
- `assistant_conversations.user_id, deck_id`
- `assistant_messages.conversation_id, created_at`
- `idempotency_records.user_id, scope, idempotency_key` unique

## Mapping To API Contracts

Schema row types live in `src/api/server/schema`. API transport DTOs live in `src/api/contracts`.

Server repositories should map rows to DTOs:

- `UploadJobRow` to `CreateUploadResponse` and `UploadStatusResponse`
- `StudyMaterialRow` to `StudyMaterialDTO` and `ExtractMaterialResponse`
- `DeckRow` plus progress rows to `DeckDTO`
- `FlashcardRow` to `FlashcardDTO`
- `ReviewSessionRow`, `ReviewAnswerRow`, and `CardReviewStateRow` to review responses
- `UserProgressRow`, `DeckProgressRow`, and `CardReviewStateRow` to `ProgressResponse`
- `AssistantConversationRow` and `AssistantMessageRow` to assistant DTOs

## Migration Strategy

1. Keep contracts and route signatures stable.
2. Keep `FLASHLY_DATA_MODE=mock` as the default while building and testing.
3. Add a real DB client in a server-only module later.
4. Add server-only database environment variables such as a future `FLASHLY_DATABASE_URL`.
5. Replace the placeholder database repositories with real DB-backed implementations matching the server repository interfaces.
6. Enable `FLASHLY_DATA_MODE=database` only in environments with real database configuration.
7. Switch API routes through the existing repository selection boundary, not by importing a database client in route files.
8. Keep mock repositories available for local development and tests.
9. Move frontend `AsyncStorage` data to backend sync gradually.
10. Add one-time migration or account bootstrap logic only after real persistence exists.

## Intentionally Not Implemented

- database client
- ORM
- migrations
- connection strings
- server-only database env vars
- object storage
- signed upload URLs
- OCR
- file parsing
- extraction/OCR provider environment variables
- AI calls
- embeddings or vector database
- workers, queues, cron jobs, or webhooks
- server-authoritative progress writes
