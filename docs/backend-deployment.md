# Flashly Backend Deployment

Flashly can run its API routes in local Expo development, and it now has a standalone Node backend entrypoint for production hosts such as Render, Railway, Fly.io, or similar container/process platforms.

## Recommended Option

Use a Node web service for the first production backend. Flashly currently depends on Node-friendly services and libraries:

- PostgreSQL through `pg`
- S3/R2 storage through the AWS SDK
- large JSON upload and chunk upload routes
- server-side Clerk verification
- RevenueCat webhooks
- NVIDIA and OCR.space server-side calls

EAS Hosting is still useful for Expo apps, but this backend is better suited to a Node runtime because of the database, storage SDK, and large upload requirements.

## Entrypoint

Production server:

```text
src/api/server/index.ts
```

It dispatches requests to the existing Expo API route handlers under:

```text
src/app/api
```

Local Expo API routes are not changed. `expo start` and the existing development flow continue to work.

## Scripts

Build/typecheck the server:

```bash
npm run build:server
```

Start the production server:

```bash
npm run start:server
```

Start the staging server with runtime validation and migrations:

```bash
npm run start:staging
```

Run migrations:

```bash
npm run db:migrate
```

Recommended production verification:

```bash
npm run verify:production
```

## Health and Readiness

Health:

```text
GET /health
```

Returns `200` JSON when the server process is alive:

```json
{ "ok": true, "service": "flashly-backend" }
```

Readiness:

```text
GET /ready
```

Returns JSON with dependency checks:

- server
- storage readiness
- PostgreSQL readiness when `FLASHLY_DATA_MODE=database`

If a required dependency is unavailable, `/ready` returns `503`.

## CORS

The standalone backend adds CORS headers for API responses and handles `OPTIONS` preflight requests.

Optional:

```bash
FLASHLY_CORS_ORIGIN=https://your-web-origin.example
```

If multiple origins are needed, separate them with commas. Native mobile requests typically do not send a browser `Origin` header.

## Large Uploads

The server supports existing direct and chunk upload routes. Default max request body size:

```bash
FLASHLY_SERVER_MAX_BODY_BYTES=83886080
```

This defaults to 80 MB to leave room for base64 overhead. Keep production proxies aligned with this limit. On Render, Railway, Fly.io, or a reverse proxy, also check request body size and timeout settings.

## Required Environment Variables

See [production-readiness.md](./production-readiness.md) for the full production list.

At minimum, production backend deployments should configure:

```bash
EXPO_PUBLIC_USE_BACKEND=true
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
FLASHLY_DATA_MODE=database
DATABASE_URL=...
DATABASE_CA_CERT=...
# or DATABASE_CA_CERT_BASE64=...
FLASHLY_STORAGE_MODE=cloud
FLASHLY_STORAGE_PROVIDER=s3
FLASHLY_S3_ENDPOINT=...
FLASHLY_S3_REGION=...
FLASHLY_S3_BUCKET=...
FLASHLY_S3_ACCESS_KEY_ID=...
FLASHLY_S3_SECRET_ACCESS_KEY=...
FLASHLY_S3_FORCE_PATH_STYLE=true
FLASHLY_EXTRACTION_MODE=external
FLASHLY_GENERATION_MODE=external
FLASHLY_AI_PROVIDER=nvidia
FLASHLY_AI_API_KEY=...
FLASHLY_AI_MODEL=openai/gpt-oss-20b
FLASHLY_AI_BASE_URL=https://integrate.api.nvidia.com/v1
FLASHLY_AI_REQUEST_TIMEOUT_MS=120000
FLASHLY_OCR_PROVIDER=ocrspace
FLASHLY_OCR_API_KEY=...
FLASHLY_BILLING_MODE=revenuecat
REVENUECAT_WEBHOOK_SECRET=...
```

Never expose server-only secrets with `EXPO_PUBLIC_`.

## PostgreSQL TLS for Aiven and Managed Providers

For staging and production database mode, Flashly verifies PostgreSQL TLS certificates with Node's normal hostname and certificate checks enabled.

Managed PostgreSQL providers such as Aiven may use a project CA that is not in Node's default trust store. Store the project CA in the deployment environment as one of:

```bash
DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
DATABASE_CA_CERT_BASE64=base64_encoded_pem_certificate
```

`DATABASE_CA_CERT` may contain escaped `\n` sequences. `DATABASE_CA_CERT_BASE64` must decode to a PEM certificate. Do not commit a real CA certificate or database credentials.

Flashly strips PostgreSQL URL SSL query parameters such as `sslmode`, `sslcert`, `sslkey`, and `sslrootcert` before connecting, then supplies TLS through:

```js
ssl: {
  ca: resolvedCaCertificate,
  rejectUnauthorized: true
}
```

Do not use `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, or any global TLS bypass.

## Render Example

This repo includes:

```text
render.yaml
```

It defines:

- build command: `npm ci && npm run build:server && npm run db:migrate`
- start command: `npm run start:staging`
- health check path: `/health`

Set secret values in the Render dashboard. Do not commit secrets to `render.yaml`.
`render.yaml` applies only to Render. Railway does not read it.

## Railway Notes

This repo includes:

```text
railway.json
```

Railway must run:

```bash
npm run start:staging
```

The staging startup sequence is:

```text
validate staging runtime environment
-> run database migrations
-> start backend server
```

The Dockerfile also defaults to `CMD ["npm", "run", "start:staging"]`, so Railway's Docker deployment and Railway's explicit start command agree.

Railway provides `PORT`; Flashly reads it automatically and binds the backend to `0.0.0.0`.

After deploy, verify:

```text
GET https://your-flashly-backend.example/health
GET https://your-flashly-backend.example/ready
```

## Fly.io Notes

Use the same commands in a Node image or Fly launch configuration:

```bash
npm run build:server
npm run db:migrate
npm run start:server
```

For large uploads, confirm Fly machine memory and request timeout settings are high enough for OCR and generation workloads.

## Mobile App Backend URL

Set the app API base URL to the deployed backend:

```bash
EXPO_PUBLIC_FLASHLY_API_BASE_URL=https://your-flashly-backend.example
EXPO_PUBLIC_USE_BACKEND=true
```

Rebuild the native app after changing `EXPO_PUBLIC_` values for production builds.

## Common Deployment Errors

`/ready` returns `503`:

- database URL is missing or unreachable
- S3/R2 env is incomplete
- bucket credentials do not allow access

Uploads fail with large files:

- hosting platform body limit is lower than Flashly's request size
- proxy timeout is too short
- `FLASHLY_SERVER_MAX_BODY_BYTES` is too low

Auth always returns unauthorized:

- `EXPO_PUBLIC_FLASHLY_AUTH_MODE` is not `clerk`
- `CLERK_SECRET_KEY` is missing
- the app is not sending a Clerk bearer token

Generation fails:

- `FLASHLY_AI_PROVIDER` is not `nvidia`
- NVIDIA key/model/base URL is missing or invalid
- `FLASHLY_AI_REQUEST_TIMEOUT_MS` is too low for the configured model and prompt size
- host egress to NVIDIA is blocked

RevenueCat webhooks fail:

- `FLASHLY_BILLING_MODE` is not `revenuecat`
- `REVENUECAT_WEBHOOK_SECRET` does not match the RevenueCat dashboard
- RevenueCat `app_user_id` does not match the Clerk user id
