# Flashly Storage Runtime Integration

Flashly now has a provider-based upload storage boundary. The app keeps the current local upload behavior by default, while production deployments can opt into S3-compatible cloud storage such as Cloudflare R2.

## Storage Modes

### Local Mode

Use local mode for development:

```bash
FLASHLY_STORAGE_MODE=local
```

Legacy `FLASHLY_STORAGE_MODE=mock` also resolves to local mode for compatibility.

Local mode preserves the existing behavior:

- direct upload metadata is prepared in the backend
- chunked uploads are assembled under `.tmp/flashly-uploads`
- extraction continues reading completed chunk uploads from temporary local files
- no cloud object is written

Do not rely on `.tmp/flashly-uploads` in production. It is temporary process-local storage and can disappear when the server restarts, scales horizontally, or runs in an ephemeral hosting environment.

### Cloud Mode

Use cloud mode for production:

```bash
FLASHLY_STORAGE_MODE=cloud
FLASHLY_STORAGE_PROVIDER=s3
FLASHLY_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
FLASHLY_S3_REGION=auto
FLASHLY_S3_BUCKET=flashly-uploads
FLASHLY_S3_ACCESS_KEY_ID=server_side_access_key
FLASHLY_S3_SECRET_ACCESS_KEY=server_side_secret_key
FLASHLY_S3_PUBLIC_BASE_URL=https://cdn.example.com # optional
```

Legacy `FLASHLY_STORAGE_MODE=external` also resolves to cloud mode for compatibility.

All S3 credentials are server-only. Do not prefix them with `EXPO_PUBLIC_`.

## What Cloud Mode Does

Cloud mode uses an S3-compatible client to write uploaded source files to the configured bucket.

- Direct PDF/image uploads are stored when extraction receives `sourceBase64`.
- Direct text uploads are stored when extraction receives `sourceText`.
- Chunked uploads are stored after all parts are assembled.
- Extraction reads source bytes/text back from S3/R2 with `storageKey` when request-local bytes are not available.
- Database-backed material records keep the durable `storageKey`, so extraction can proceed after a backend restart or on another instance.
- Object metadata includes the original file name where possible.
- Upload records continue storing the generated `storageKey` when repository/database mode supports it.

The frontend still talks only to Flashly backend routes. It never receives S3 credentials.

## Chunk Upload Finalization

Large PDF uploads still follow the existing chunk flow:

1. The frontend creates an upload job and receives a server-generated `storageKey`.
2. The frontend starts a chunked upload with that opaque `storageKey`.
3. The backend writes incoming chunks to `.tmp/flashly-uploads`.
4. The complete route assembles the file.
5. In cloud mode, the assembled file is uploaded to the S3 bucket.
6. Extraction reads the durable S3/R2 object by `storageKey` when available.
7. Local assembled files are best-effort temporary cache only and are not required after cloud upload succeeds.

This keeps progressive generation and OCR behavior unchanged while adding durable production storage.

This is not yet a true S3 multipart upload. The backend still receives chunk payloads and assembles them once before writing to cloud storage. That is acceptable for the current 50 MB limit, but direct multipart upload/resume support remains a future scaling improvement.

## Smoke Test

Run the cloud storage smoke test after configuring env variables:

```bash
npm run smoke:storage
```

The script:

- validates `FLASHLY_STORAGE_MODE=cloud`
- validates required S3 env variables
- uploads a small text object
- runs a head check
- deletes the test object
- prints PASS or FAIL

Run the cloud extraction smoke test when both cloud storage and PostgreSQL are configured:

```bash
npm run smoke:cloud-extraction
```

The script:

- requires `FLASHLY_STORAGE_MODE=cloud`, S3/R2 env variables, `FLASHLY_DATA_MODE=database`, and `DATABASE_URL`
- uploads a tiny text object to S3/R2
- creates database material metadata pointing only to the durable `storageKey`
- runs the Flashly extraction service using that storage key
- verifies extracted text persisted to PostgreSQL
- deletes the test object and test database user

For deployed staging, `npm run smoke:staging` validates the same durable storage path over HTTP:

```text
upload metadata
-> one-part chunk upload
-> S3/R2 object
-> extraction request with storageKey only
-> persisted extracted text
```

## Current Boundaries

Implemented now:

- storage provider selection
- local mode compatibility
- S3-compatible cloud provider
- cloud object read/download support for extraction
- direct upload object persistence at extraction time
- chunk upload persistence after assembly
- extraction from durable `storageKey` without process-local temp files
- storage smoke script
- cloud extraction smoke script

Still future work:

- native/client streaming uploads that avoid reading the whole selected file as base64 before chunking
- background upload workers
- signed direct-to-bucket browser/mobile uploads
- lifecycle policies and virus scanning
