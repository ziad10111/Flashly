# Flashly Production Infrastructure Setup

This guide walks through the production services Flashly needs before a real launch. It assumes the standalone backend server is deployed to a Node host such as Render or Railway and the Expo app talks to that backend through `EXPO_PUBLIC_FLASHLY_API_BASE_URL`.

Do not commit real secrets. Use the templates:

- `.env.production.example`
- `.env.backend.production.example`
- `.env.app.production.example`

## 1. PostgreSQL Setup

Use a managed PostgreSQL provider such as Render Postgres, Railway Postgres, Neon, Supabase, or Fly Postgres.

Steps:

1. Create a production PostgreSQL database.
2. Copy the connection string into the backend environment as `DATABASE_URL`.
3. Make sure SSL is enabled if the provider requires it.
4. Set:

```bash
FLASHLY_DATA_MODE=database
```

5. Run migrations from the backend deployment environment:

```bash
npm run db:migrate
```

6. Run the database smoke test:

```bash
npm run smoke:database
```

7. Run the ownership smoke test:

```bash
npm run smoke:ownership
```

## 2. Cloudflare R2 or S3 Storage Setup

Cloudflare R2 is a good default because it is S3-compatible and cost-effective for uploaded PDFs.

Steps for R2:

1. Create an R2 bucket, for example `flashly-production-uploads`.
2. Create an R2 API token with object read/write/delete access for that bucket.
3. Copy the S3-compatible endpoint.
4. Set backend env:

```bash
FLASHLY_STORAGE_MODE=cloud
FLASHLY_STORAGE_PROVIDER=s3
FLASHLY_S3_ENDPOINT=https://account-id.r2.cloudflarestorage.com
FLASHLY_S3_REGION=auto
FLASHLY_S3_BUCKET=flashly-production-uploads
FLASHLY_S3_ACCESS_KEY_ID=replace_me
FLASHLY_S3_SECRET_ACCESS_KEY=replace_me
```

5. Optional: configure a public/custom domain and set:

```bash
FLASHLY_S3_PUBLIC_BASE_URL=https://files.example.com
```

6. Run:

```bash
npm run smoke:storage
```

## 3. Clerk Production App Setup

Steps:

1. Create or switch to a Clerk production instance.
2. Configure allowed redirect URLs and native deep links for the Expo app.
3. Set client env in the app build:

```bash
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_replace_me
```

4. Set backend env:

```bash
CLERK_SECRET_KEY=clerk_live_secret_replace_me
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
```

5. Verify signed-out users are blocked from app tabs.
6. Verify signed-in requests include Clerk bearer tokens.

## 4. NVIDIA AI Setup

Steps:

1. Create or use an NVIDIA API account with access to the configured model.
2. Set backend env:

```bash
FLASHLY_GENERATION_MODE=external
FLASHLY_AI_PROVIDER=nvidia
FLASHLY_AI_API_KEY=nvapi_replace_me
FLASHLY_AI_MODEL=openai/gpt-oss-20b
FLASHLY_AI_BASE_URL=https://integrate.api.nvidia.com/v1
```

3. `npm run verify:production` will make a small NVIDIA chat-completions request.

## 5. OCR.space Setup

Steps:

1. Create an OCR.space API key.
2. Set backend env:

```bash
FLASHLY_EXTRACTION_MODE=external
FLASHLY_OCR_PROVIDER=ocrspace
FLASHLY_OCR_API_KEY=replace_me
FLASHLY_OCR_API_URL=https://api.ocr.space/parse/image
FLASHLY_OCR_TIMEOUT_MS=20000
FLASHLY_PDF_EXTRACTION_PROVIDER=local
```

3. Test OCR behavior through:

```bash
npm run smoke:pdf
```

## 6. RevenueCat Setup

Steps:

1. Create a RevenueCat project.
2. Add the Android app.
3. Create a `pro` entitlement.
4. Add monthly/yearly Google Play subscription products.
5. Attach products to the Current offering.
6. Set app build env:

```bash
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_replace_me
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
```

7. Configure the webhook URL:

```text
https://your-flashly-backend.example/api/billing/revenuecat/webhook
```

8. Set backend env:

```bash
FLASHLY_BILLING_MODE=revenuecat
REVENUECAT_WEBHOOK_SECRET=replace_me
REVENUECAT_PROJECT_ID=
REVENUECAT_API_KEY=
```

9. Confirm a RevenueCat webhook updates the `subscriptions` table.

## 7. Sentry Setup

Recommended setup:

- one Sentry project for the Expo app
- one Sentry project for the backend

App env:

```bash
EXPO_PUBLIC_SENTRY_DSN=https://public@sentry.example/project
```

Backend env:

```bash
SENTRY_DSN=https://private@sentry.example/project
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=flashly@1.0.0
```

Do not send uploaded content, OCR text, AI prompts, tokens, or secrets to Sentry.

## 8. Backend Deployment on Render

This repo includes `render.yaml`.

Recommended Render settings:

```bash
Build Command: npm ci && npm run build:server && npm run db:migrate
Start Command: npm run start:server
Health Check Path: /health
```

Set all backend variables from `.env.backend.production.example` in the Render dashboard. Keep secrets out of `render.yaml`.

After deploy, check:

```text
GET https://your-flashly-backend.example/health
GET https://your-flashly-backend.example/ready
```

## 9. Backend Deployment on Railway

This repo includes `railway.json` and a Dockerfile. Railway should use the Dockerfile and run:

```bash
Start Command: npm run start:staging
```

`render.yaml` applies only to Render and does not configure Railway.

`npm run start:staging` performs:

```text
validate staging runtime environment
-> run database migrations
-> start backend server
```

Railway provides `PORT`; Flashly reads it automatically and binds to `0.0.0.0`. Set all backend variables from `.env.backend.production.example` in Railway variables.

After deploy, verify:

```text
GET /health -> HTTP 200
GET /ready -> HTTP 200
```

## 10. App Build Backend URL

Set app public env before production native builds:

```bash
EXPO_PUBLIC_USE_BACKEND=true
EXPO_PUBLIC_FLASHLY_API_BASE_URL=https://your-flashly-backend.example
```

Any change to `EXPO_PUBLIC_` variables requires a new native build or update, depending on how the app is shipped.

## 11. Production Verification Commands

Run from the backend environment:

```bash
npm run verify:production
npm run smoke:database
npm run smoke:storage
npm run smoke:security
npm run smoke:ownership
```

Run with a backend server available:

```bash
npm run smoke:pdf
```

## 12. Final Production Modes

Backend:

```bash
NODE_ENV=production
FLASHLY_DATA_MODE=database
FLASHLY_STORAGE_MODE=cloud
FLASHLY_EXTRACTION_MODE=external
FLASHLY_GENERATION_MODE=external
FLASHLY_AI_PROVIDER=nvidia
FLASHLY_OCR_PROVIDER=ocrspace
FLASHLY_BILLING_MODE=revenuecat
```

App:

```bash
EXPO_PUBLIC_USE_BACKEND=true
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
```
