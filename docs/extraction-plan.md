# Flashly Extraction Plan

Flashly has a backend-only extraction boundary. Mock extraction remains the default. The first MVP external path accepts real text from simple text uploads, small text-based PDFs, and small JPG/PNG images when server-only OCR is configured.

No AI vision provider, worker, queue, database, storage reader, or broad document parser is currently implemented.

## Extraction Mode

Extraction mode is controlled by a server-only environment variable:

```bash
FLASHLY_EXTRACTION_MODE=mock
```

Supported values:

- `mock`
- `external`

`mock` is the default. Normal startup does not require OCR keys, parsing credentials, storage read credentials, workers, queues, or extraction environment variables.

`external` enables the MVP extraction path for:

- `.txt`, `.md`
- text-based `.pdf`
- `.jpg`, `.jpeg`, `.png`

Because real storage is not implemented yet, the frontend sends bounded `sourceText` for text files or bounded `sourceBase64` for PDF/image files to `POST /api/materials/:id/extract`. Parsing and OCR still happen only in backend/server code. This base64 handoff is demo-only and should later be replaced by storage-backed server reads.

Optional external extraction settings:

```bash
FLASHLY_PDF_EXTRACTION_PROVIDER=local
FLASHLY_OCR_PROVIDER=ocrspace
FLASHLY_OCR_API_KEY=your_server_only_key_here
FLASHLY_OCR_API_URL=https://api.ocr.space/parse/image
FLASHLY_OCR_TIMEOUT_MS=20000
```

`FLASHLY_OCR_API_KEY` must never use `EXPO_PUBLIC_`. Mock mode does not require OCR config.

## Current Behavior

Mock extraction still returns deterministic lifecycle metadata and does not read actual files, parse documents, inspect storage, run OCR, call AI, or persist full extracted text.

External extraction supports:

- text/markdown extraction from `sourceText`
- PDF selectable-text extraction through a local backend parser
- image OCR through the configured backend-only OCR provider

Limits:

- frontend reads text files up to `64 KB`
- backend accepts `sourceText` up to `12,000` characters
- backend accepts PDF base64 input up to `4 MB`
- backend accepts JPG/PNG base64 input up to `3 MB`
- backend requires at least `40` useful characters after trimming
- extracted text preview is capped at `6,000` characters

PDF support is for text-based PDFs. Scanned PDFs return a clear not-ready message unless a future scanned PDF OCR path is added. The local parser handles common text operators and Flate-compressed streams when the API runtime supports `DecompressionStream`, but it is not a complete production document parser.

Image OCR supports JPG and PNG only. Missing OCR config, provider timeout/failure, unsupported image formats, and no-text OCR results return typed safe errors. Handwriting may work only if the OCR provider reads it well; it is not guaranteed MVP behavior.

## Relationship To Generation

Flashcard generation mode is selected separately:

```bash
FLASHLY_GENERATION_MODE=mock
```

In the MVP backend-enabled flow, the upload screen passes `extractedTextPreview` into flashcard generation. This lets external AI generation create cards from real `.txt`, `.md`, text PDF, or OCR image content without adding storage-backed full text reads yet.

Later, production generation should consume full extracted text references or source chunks created by extraction. The preview can help with API status and debugging, but it should not be the only input for production-quality flashcard generation.

## Future Real Flow

A fuller external extraction service should:

1. Use `storageKey` as an opaque server-created reference to the uploaded source file.
2. Read the file with server-only storage credentials.
3. Try normal text extraction first for PDFs, text files, and document-like sources.
4. Run OCR only when extracted text is empty/too short, the source is image-like, or `forceOcr` is requested.
5. Clean extracted text server-side.
6. Store full extracted text server-side.
7. Return only a short preview through the extract API.
8. Create source chunks later for generation and Assistant citations.

## Still Not Implemented

- scanned PDF OCR
- guaranteed handwritten OCR
- storage-backed file reads
- full extracted text storage
- broad Word, PowerPoint, Excel, or HEIC parsing
- robust production PDF parsing for every PDF encoding
- source chunk creation
- workers, queues, cron jobs, embeddings, RAG, or vector databases

## Latest Focused QA

Final certification attempt on 2026-06-02:

```text
[BLOCKED] Android AVD Resizable_Experimental booted, but no Expo Go/development build was installed and Expo Android launch timed out
[BLOCKED] .env did not include server-only OpenAI or OCR.space keys
[PASS] no AI/OCR provider secret used an EXPO_PUBLIC_ prefix
[NOT RUN] real JPG/PNG OCR provider extraction
[NOT RUN] real simulator/device upload and restart persistence
```

Run date: 2026-06-02

Local backend/service QA passed for `.txt`, `.md`, and a minimal selectable-text PDF fixture. Scanned/image-only PDF returned the expected limitation instead of fake text. Missing OCR.space configuration and missing OpenAI configuration returned safe typed errors. Too-large PDF/image validation returned friendly size errors.

Real OCR.space JPG/PNG calls, no-text image provider behavior, and simulator/device upload persistence were not run in this pass because no OCR/OpenAI server keys or simulator/device session were available from the project shell.

Manual MVP extraction and generation checks live in `docs/mvp-qa-checklist.md`.
