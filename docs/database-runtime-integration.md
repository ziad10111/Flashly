# Flashly Database Runtime Integration

This document describes the production database runtime layer for Flashly.

`FLASHLY_DATA_MODE=mock` remains available for local development, lessons, and demos. In `FLASHLY_DATA_MODE=database`, PostgreSQL is the authoritative source for uploads, materials, extraction results, generation jobs, decks, flashcards, review sessions, progress, and subscriptions.

## Runtime Modes

Server data repositories are selected with a server-only environment variable:

```bash
FLASHLY_DATA_MODE=mock
```

Supported values:

- `mock`: default mode. Uses existing mock server repositories and current frontend/local persistence behavior.
- `database`: selects PostgreSQL-backed repositories and validates database configuration before database operations.

The frontend must not import database clients, database URLs, or server repository implementations. App screens should continue using API routes and frontend repositories.

Upload object storage is configured separately. See [storage-runtime-integration.md](./storage-runtime-integration.md) for local and cloud storage setup.

## Required Environment Variables

Mock mode requires no database environment variables:

```bash
FLASHLY_DATA_MODE=mock
```

Database mode requires:

```bash
FLASHLY_DATA_MODE=database
DATABASE_URL=postgres://user:password@host:5432/database
```

`DATABASE_URL` is server-only. Do not create an `EXPO_PUBLIC_DATABASE_URL`; Expo public variables can be bundled into client code.

## What Is Implemented Now

This layer now persists the core upload-to-study flow in PostgreSQL:

- PostgreSQL client module using `pg`
- lazy server-only connection pool
- `DATABASE_URL` validation
- PostgreSQL schema migrations
- migration runner script
- provider-based repository selection through `FLASHLY_DATA_MODE`
- mock repository implementations for the new core domains
- database repositories for the route-backed core domains
- material extraction result persistence
- extracted source chunk persistence
- generation job lifecycle persistence
- deck and flashcard persistence for generated MCQs
- upload status linkage to material/deck generation state
- explicit repository interfaces for:
  - users
  - uploads
  - materials
  - decks
  - flashcards
  - review sessions
  - progress
  - subscriptions
  - assistant conversations

The PostgreSQL client lives in:

```text
src/api/server/database
```

The provider switch lives in:

```text
src/api/server/repositories/index.ts
```

Database repositories live in:

```text
src/api/server/repositories/database
```

If `FLASHLY_DATA_MODE=database` is enabled without `DATABASE_URL`, database repository operations fail with a clear server error:

```text
FLASHLY_DATA_MODE=database requires a server-only DATABASE_URL environment variable.
```

If `DATABASE_URL` is configured, the implemented database repositories use PostgreSQL. Repository failures are wrapped in clear server repository errors.

## Running Migrations

Run migrations only in a backend/server environment with `DATABASE_URL` configured:

```bash
npm run db:migrate
```

The migration runner:

- loads `DATABASE_URL` from the process environment or local `.env`
- connects to PostgreSQL with `pg`
- creates a `schema_migrations` tracking table
- runs pending `.sql` files from `src/api/server/database/migrations` in filename order
- records each applied migration
- fails clearly if `DATABASE_URL` is missing

The first migration is:

```text
src/api/server/database/migrations/001_initial_schema.sql
```

It creates:

- `users`
- `uploads`
- `materials`
- `source_chunks`
- `decks`
- `flashcards`
- `generation_jobs`
- `review_sessions`
- `review_answers`
- `progress`
- `subscriptions`
- `idempotency_keys`
- `schema_migrations`

Running migrations does not switch app behavior by itself. Set `FLASHLY_DATA_MODE=database` in the backend environment to use PostgreSQL repositories.

## Repository Implementation Status

Implemented PostgreSQL repositories:

- users: read/bootstrap by Clerk user id
- uploads: create upload job, read upload status
- materials: read material, persist extraction result, persist source chunks, create/update generation jobs, persist generated decks and flashcards
- decks: list decks, read deck with flashcards
- flashcards: read flashcards by deck, including MCQ choices and correct answer ids
- review sessions: create session and review answers
- progress: read user/deck/card progress summary
- subscriptions: read latest subscription by user id

Not yet implemented:

- assistant conversations/messages: still placeholder for database mode.

Current route methods that use database repositories are promise-based and still preserve existing API response shapes.

## Testing Database Mode

1. Configure `DATABASE_URL`.
2. Run migrations:

```bash
npm run db:migrate
```

3. Run the database smoke check:

```bash
npm run smoke:database
```

The smoke check:

- requires `DATABASE_URL`
- opens a transaction
- inserts a test user, material, deck, flashcards, and progress rows
- reads them back
- rolls back the transaction so test records are not retained

Run the generation persistence smoke check:

```bash
npm run smoke:database-generation
```

The generation smoke check:

- requires `DATABASE_URL`
- opens a transaction
- inserts a test user/material/source chunk/generation job/deck/MCQ flashcard
- verifies extraction, source chunk, generation job, deck, and flashcard rows exist
- rolls back the transaction

To test app API routes in database mode, set:

```bash
FLASHLY_DATA_MODE=database
DATABASE_URL=postgres://user:password@host:5432/database
```

Mock mode remains recommended for fast local app iteration. Database mode should be used in staging/production once migrations and smoke checks pass.

## What Still Needs Migration

Still needed:

- assistant conversation/message storage
- background worker queue for long-running generation outside the app-open lifecycle
- broader route-level integration tests against database mode

## Migration Plan

1. Keep `FLASHLY_DATA_MODE=mock` for local development and current app flows.
2. Run migrations before enabling database traffic.
3. Keep route contracts stable while repository internals evolve.
4. Enable `FLASHLY_DATA_MODE=database` only in an environment with `DATABASE_URL`.
5. Keep the frontend using backend returned deck/card ids; local Zustand mirrors the persisted backend state for immediate UI responsiveness.

## Safety Rules

- Never expose `DATABASE_URL` through `EXPO_PUBLIC_*`.
- Do not import `pg` or database modules from frontend code.
- Keep mock mode available for demos, lessons, and local development.
- Do not change API response contracts during repository migration unless a feature explicitly requires it.
