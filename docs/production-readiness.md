# Flashly Production Readiness

Use this checklist before shipping a production backend or native build. The verifier checks production mode flags, required server-only secrets, and core service reachability without printing secret values.

## Expected Production Modes

```bash
EXPO_PUBLIC_USE_BACKEND=true
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
FLASHLY_DATA_MODE=database
FLASHLY_STORAGE_MODE=cloud
FLASHLY_STORAGE_PROVIDER=s3
FLASHLY_EXTRACTION_MODE=external
FLASHLY_GENERATION_MODE=external
FLASHLY_AI_PROVIDER=nvidia
FLASHLY_OCR_PROVIDER=ocrspace
FLASHLY_BILLING_MODE=revenuecat
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
```

## Required Production Environment

Client-safe variables:

```bash
EXPO_PUBLIC_USE_BACKEND=true
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_key
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=public_android_sdk_key
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
```

Server-only variables:

```bash
CLERK_SECRET_KEY=server_side_clerk_secret
DATABASE_URL=postgres_connection_string
FLASHLY_S3_ENDPOINT=s3_or_r2_endpoint
FLASHLY_S3_REGION=s3_region
FLASHLY_S3_BUCKET=bucket_name
FLASHLY_S3_ACCESS_KEY_ID=server_side_access_key
FLASHLY_S3_SECRET_ACCESS_KEY=server_side_secret_key
FLASHLY_AI_API_KEY=server_side_nvidia_key
FLASHLY_AI_MODEL=openai/gpt-oss-20b
FLASHLY_AI_BASE_URL=https://integrate.api.nvidia.com/v1
FLASHLY_OCR_API_KEY=server_side_ocr_space_key
REVENUECAT_WEBHOOK_SECRET=shared_webhook_secret
```

Never prefix server-only secrets with `EXPO_PUBLIC_`.

## Run Migrations

Run database migrations before switching runtime traffic to database mode:

```bash
npm run db:migrate
```

## Run Smoke Tests

Recommended smoke checks:

```bash
npm run smoke:database
npm run smoke:database-generation
npm run smoke:storage
npm run smoke:cloud-extraction
npm run smoke:billing
npm run smoke:pdf
```

`smoke:database` requires `DATABASE_URL`.

`smoke:database-generation` requires `DATABASE_URL` and verifies material extraction, source chunk, generation job, deck, and MCQ flashcard persistence in a rolled-back transaction.

`smoke:storage` requires cloud storage mode and the S3/R2 variables.

`smoke:cloud-extraction` requires cloud storage mode, S3/R2 variables, `FLASHLY_DATA_MODE=database`, and `DATABASE_URL`. It verifies extraction can read a durable S3/R2 object by `storageKey` without local temp upload files.

`smoke:billing` verifies RevenueCat webhook secret handling and does not require production credentials.

`smoke:pdf` expects a running backend API, and validates extraction, OCR fallback behavior, NVIDIA provider wiring, and MCQ generation.

## Verify Production

Run:

```bash
npm run verify:production
```

The verifier checks:

- production mode values
- required env variables
- PostgreSQL reachability with `SELECT 1`
- S3/R2 reachability with a small put/head/delete object test
- NVIDIA chat completions reachability with a minimal request
- OCR.space configuration presence
- RevenueCat configuration presence

It prints `PASS` or `FAIL` per section, lists missing or misconfigured variables, and exits non-zero if Flashly is not production-ready.

The script intentionally does not print API keys, database URLs, or storage secrets.

## Verify Staging

Before Google Play Internal Testing, run staging validation against a deployed backend:

```bash
npm run check:staging-deployment
npm run verify:staging
```

This command requires `FLASHLY_STAGING_BASE_URL`, two short-lived Clerk staging user tokens, and all staging service variables. It fails if required staging checks are missing or fail.

See [staging-validation.md](./staging-validation.md) for setup and troubleshooting.

## Notes

- RevenueCat purchases require a native production or development-client build. Expo Go is not enough for real purchases.
- Backend entitlement checks remain authoritative even after a client purchase succeeds.
- OCR.space is checked for configuration only; document OCR is covered by `npm run smoke:pdf`.
- NVIDIA verification makes a small chat completion request, so it requires valid billing/API access on the configured NVIDIA account.
