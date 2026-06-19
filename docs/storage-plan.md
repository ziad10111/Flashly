# Flashly Storage Plan

Flashly has a backend-only storage boundary for future real file uploads. No storage provider SDK, bucket, signed upload URL, file streaming, PDF parsing, OCR, AI processing, worker, or queue is implemented yet.

## Storage Mode

Storage mode is controlled by a server-only environment variable:

```bash
FLASHLY_STORAGE_MODE=mock
```

Supported values:

- `mock`
- `external`

`mock` is the default. Normal startup does not require storage provider credentials or storage environment variables.

`external` is reserved for a future provider-backed implementation. Today it selects a placeholder service that fails clearly through the shared API error shape instead of faking successful uploads.

Storage secrets must never use `EXPO_PUBLIC_`. Public Expo variables can be exposed to frontend code, so storage credentials, signed URL secrets, bucket write keys, provider tokens, and service-role keys must stay server-only.

## Current Mock Behavior

The mock storage service creates deterministic development keys shaped like:

```text
mock/uploads/<idempotency-key>/<metadata-hash>
```

It does not upload files, read files, parse files, inspect file contents, or require environment variables. The existing frontend upload flow still sends metadata to the backend or uses local fallback behavior depending on repository mode.

## Future Real Storage Options

Two safe approaches can be added later:

- Backend-mediated upload: the frontend sends the file to a backend route, and the backend writes to storage with server-only credentials.
- Signed upload URL: the backend validates the request, creates an upload job, returns a short-lived signed upload URL, and later verifies completion server-side.

Both approaches should derive ownership from verified server auth, keep provider credentials out of frontend code, and keep `storageKey` as an opaque server-created reference.

## Relationship To Upload Jobs

`storageKey` links an upload job and study material to the future stored source file. It should be stored with upload/job metadata and reused by later extraction, OCR, and generation routes.

Future extracted text can use a separate storage key so source files and processed text have separate access, retention, and cleanup rules.

## Relationship To Extraction

Extraction mode is selected separately through backend-only config:

```bash
FLASHLY_EXTRACTION_MODE=mock
```

`mock` is the default. The current extraction service uses storage-shaped metadata only and does not read files from storage. Later, a real extraction service can use `storageKey` as the server-created reference for PDFs, text files, images, scanned files, and handwritten materials.

Real extraction should first try normal text extraction where possible, run OCR only when text is empty/too short or explicitly required, clean the text, store full extracted text server-side, and create source chunks for generation/citation workflows. The API preview should remain a short extracted text preview, not the full extracted text.

Extraction and OCR provider secrets must be server-only. Do not use `EXPO_PUBLIC_` for parsing credentials, OCR keys, AI vision keys, storage read secrets, or provider tokens.

## Still Not Implemented

- real storage provider SDK
- real signed upload URLs
- frontend direct-to-storage upload
- backend file streaming
- object read/download endpoints
- storage credentials
- OCR
- PDF or document parsing
- real extraction service provider
- full extracted text storage
- source chunk creation
- AI generation from stored files
- workers, queues, cron jobs, or webhooks
