# Flashly Staging Validation

Staging validation proves Flashly against real external infrastructure before Google Play Internal Testing.

## Required Services

- PostgreSQL with migrations applied
- S3-compatible storage or Cloudflare R2
- Clerk staging app
- OCR.space account
- NVIDIA API account
- RevenueCat sandbox project
- Sentry staging project
- Deployed Flashly backend

## Deployment Order

1. Provision PostgreSQL.
2. Provision S3/R2 bucket.
3. Deploy backend.
4. Run `npm run db:migrate`.
5. Configure Clerk.
6. Configure OCR.space.
7. Configure NVIDIA.
8. Configure RevenueCat.
9. Check `/health`.
10. Check `/ready`.
11. Run `npm run verify:staging`.
12. Build Android preview.
13. Run device end-to-end test.

## Backend Deployment Artifact

The standalone backend entrypoint is:

```bash
npm run start:server
```

The staging-safe startup wrapper is:

```bash
npm run start:staging
```

`start:staging` runs:

```text
verify staging environment
-> run database migrations
-> start standalone backend
```

The Docker image can be built with:

```bash
docker build -t flashly-staging .
```

Run it with staging variables supplied by the host:

```bash
docker run --env-file .env.staging -p 8081:8081 flashly-staging
```

For Railway staging, use `railway.json` or set the Railway Start Command manually to:

```bash
npm run start:staging
```

Do not rely on `render.yaml` for Railway; it applies only to Render.

Successful startup should log the staging runtime validation, database migration run, and backend server startup. After deployment, verify:

```text
GET /health -> HTTP 200
GET /ready -> HTTP 200
```

`/health` includes safe release metadata when Railway provides it, including the deployed commit from `RAILWAY_GIT_COMMIT_SHA`. If `/ready` still shows an older response shape, compare `/health.release.commit` with the expected Git commit and redeploy the latest `master` commit.

Secrets are not baked into the image.

## Environment

Copy `.env.staging.example` into the staging secret manager and fill every placeholder. Do not commit real secrets.

Required staging-only test variables:

```bash
FLASHLY_STAGING_BASE_URL=https://staging-api.example.com
FLASHLY_STAGING_TEST_TOKEN=short_lived_clerk_session_token_for_user_a
FLASHLY_STAGING_SECOND_USER_TOKEN=short_lived_clerk_session_token_for_user_b
FLASHLY_STAGING_TEST_CLERK_USER_ID=optional_if_test_token_is_not_a_jwt
FLASHLY_STAGING_RATE_LIMIT_ATTEMPTS=150
```

The two tokens must belong to different Clerk users. Use short-lived tokens from a staging Clerk app. Do not hardcode passwords or commit tokens.
`FLASHLY_STAGING_TEST_CLERK_USER_ID` is only needed if the primary token is opaque and the smoke cannot infer the Clerk user id from a JWT `sub` claim.

For long staging smoke runs, prefer session-id token minting instead of static 60-second JWTs:

```bash
CLERK_SECRET_KEY=server_side_staging_clerk_secret
FLASHLY_STAGING_TEST_SESSION_ID=session_id_for_user_a
FLASHLY_STAGING_SECOND_USER_SESSION_ID=session_id_for_user_b
```

When those three values are configured, `npm run smoke:staging` mints fresh Clerk session tokens with the Clerk Backend API before major authenticated phases. It refreshes User B immediately before the ownership check and User A before review/progress checks, and retries one authenticated request after HTTP 401 by minting a new token. It never logs the Clerk secret, JWTs, session ids, or authorization headers.

Static token variables remain supported for backward compatibility. If session ids are not configured, provide both `FLASHLY_STAGING_TEST_TOKEN` and `FLASHLY_STAGING_SECOND_USER_TOKEN`; a 401 later in the run usually means the static token expired and the session-id strategy should be used.

## Migrations

Run migrations from a backend environment with staging `DATABASE_URL`:

```bash
npm run db:migrate
```

For Aiven PostgreSQL, add the project CA certificate to Railway before running migrations:

```bash
DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
```

or:

```bash
DATABASE_CA_CERT_BASE64=base64_encoded_pem_certificate
```

Flashly requires one of these in staging database mode and keeps `rejectUnauthorized: true`. The connection helper removes `sslmode`, `sslcert`, `sslkey`, and `sslrootcert` from `DATABASE_URL` and applies TLS through the shared node-postgres `ssl` object.

Then verify database-specific checks:

```bash
npm run smoke:database
npm run smoke:database-generation
npm run smoke:ownership
```

## Storage

Cloud storage must use:

```bash
FLASHLY_STORAGE_MODE=cloud
FLASHLY_STORAGE_PROVIDER=s3
FLASHLY_S3_FORCE_PATH_STYLE=true
```

`FLASHLY_S3_FORCE_PATH_STYLE` defaults to `true`, matching the runtime client and smoke scripts. Keep it enabled for most S3-compatible providers, including Cloudflare R2 and Backblaze B2, unless the provider specifically requires virtual-hosted-style addressing.

Run:

```bash
npm run smoke:storage
npm run smoke:cloud-extraction
```

`smoke:storage` writes, reads, compares, and deletes text and binary objects.

`smoke:cloud-extraction` proves extraction can read a durable `storageKey` without process-local temp files.

## Readiness

`GET /health` is lightweight and confirms the server process is alive.

`GET /ready` validates:

- runtime configuration
- PostgreSQL connectivity
- schema migrations
- S3/R2 write/read/delete
- Clerk configuration
- OCR configuration
- NVIDIA configuration
- RevenueCat configuration
- security/rate-limit config shape

The endpoint returns non-2xx when required dependencies fail. It does not print secrets.

## Staging End-To-End Smoke

Run:

```bash
npm run verify:staging
```

This runs:

```bash
node scripts/verify-staging-env.js
node scripts/smoke-staging-e2e.js
```

The HTTP smoke test validates:

1. `/health`
2. `/ready`
3. authenticated staging test user
4. upload metadata persistence
5. chunk upload to cloud storage
6. extraction from `storageKey`
7. generated MCQ deck persistence
8. MCQ choices and `correctChoiceId` after database read
9. cross-user ownership rejection
10. review session and progress persistence
11. RevenueCat webhook auth, idempotency, and subscription normalization
12. malformed JSON and upload validation
13. rate limiting

The smoke test must fail if required staging config is missing. It must not silently skip required checks.

Before the full E2E smoke, validate the deployed backend:

```bash
npm run check:staging-deployment
```

This requires HTTPS `FLASHLY_STAGING_BASE_URL`, checks `/health`, checks `/ready`, and fails if any required dependency reports `failed`.

The smoke uses committed fixtures from `fixtures/staging/` and creates unique run ids for upload names, idempotency keys, deck titles, and RevenueCat event ids.

## RevenueCat Sandbox

Configure RevenueCat webhook URL:

```text
https://staging-api.example.com/api/billing/revenuecat/webhook
```

Set `REVENUECAT_WEBHOOK_SECRET` in the backend. The staging smoke uses a synthetic sandbox webhook payload and does not require a real purchase event.

## Troubleshooting

- `/ready` fails database: check `DATABASE_URL`, network allowlist, and migrations.
- `/ready` fails storage: check the reported phase (`write`, `read`, `compare`, `delete`, or `missing-object-check`), then check bucket name, endpoint, region, path-style setting, and access policy.
- staging smoke fails auth: refresh both Clerk session tokens and ensure they belong to different users.
- generation fails: check the safe API error code (`ai-provider-timeout`, `ai-provider-rate-limited`, `ai-provider-upstream`, `ai-provider-authentication`, `ai-provider-authorization`, or `ai-provider-invalid-response`), then verify NVIDIA key/model/base URL, `FLASHLY_AI_REQUEST_TIMEOUT_MS`, account access, and host egress.
- OCR fails only on scanned fixtures: verify OCR.space account quota and timeout.
- rate limit check fails: set `FLASHLY_STAGING_RATE_LIMIT_ATTEMPTS` above the configured general limit.

## Cleanup

The staging HTTP smoke uses a run id like `staging-<timestamp>-<random>` in upload names, idempotency keys, and RevenueCat event ids. It does not delete app data because production routes do not expose destructive test cleanup endpoints. Periodically remove staging test rows and objects by that run id/prefix if desired.

## Promotion Criteria

Flashly can move to Google Play Internal Testing only after:

- `npm run verify:staging` passes.
- Android preview build signs in with Clerk.
- small PDF, scanned PDF, and large PDF flows pass on a real device.
- purchase and restore pass in RevenueCat/Google Play internal testing.
- Sentry receives a controlled staging error.

## Future Upload Hardening

The Expo client still reads large files into base64 before chunking.

Future scaling path:

```text
Expo client
-> direct multipart or presigned upload
-> no whole-file base64 allocation
```

This is not a staging blocker for the current 50 MB upload limit.
