# Flashly Production Launch Checklist

Use this checklist before submitting production builds or opening the backend to real users.

## Environment

- [ ] `.env.backend.production.example` has been copied into the backend host variables.
- [ ] `.env.app.production.example` has been copied into the Expo/EAS build environment.
- [ ] No real secrets are committed to git.
- [ ] `EXPO_PUBLIC_FLASHLY_API_BASE_URL` points to the deployed backend.
- [ ] `NODE_ENV=production` is set on the backend.
- [ ] `FLASHLY_ALLOWED_ORIGINS` is configured for any browser clients.
- [ ] Server-only secrets are not prefixed with `EXPO_PUBLIC_`.

## Database

- [ ] Production PostgreSQL database is created.
- [ ] `DATABASE_URL` is configured on the backend.
- [ ] `FLASHLY_DATA_MODE=database`.
- [ ] `npm run db:migrate` has completed.
- [ ] `npm run smoke:database` passes.
- [ ] `npm run smoke:database-generation` passes.
- [ ] `npm run smoke:ownership` passes.

## Backend Health

- [ ] Backend deploy finished successfully.
- [ ] `GET /health` returns `200`.
- [ ] `GET /ready` returns `200`.
- [ ] `npm run verify:production` passes.
- [ ] `npm run check:staging-deployment` passes.
- [ ] `npm run verify:staging` passes against the deployed staging backend.
- [ ] Request IDs are visible in API responses.

## Auth

- [ ] Clerk production app is configured.
- [ ] Signed-out users cannot access app tabs.
- [ ] Signed-in users can access app tabs.
- [ ] Backend requests include Clerk session bearer tokens.
- [ ] A second user cannot access the first user's decks, uploads, materials, review sessions, or flashcards.

## Storage and Uploads

- [ ] Cloudflare R2 or S3 bucket is created.
- [ ] S3/R2 access key has only required bucket permissions.
- [ ] `FLASHLY_STORAGE_MODE=cloud`.
- [ ] `npm run smoke:storage` passes.
- [ ] `npm run smoke:cloud-extraction` passes.
- [ ] PDF upload succeeds.
- [ ] TXT or MD upload succeeds.
- [ ] JPG or PNG upload succeeds.
- [ ] Executable/archive upload is rejected.
- [ ] Large chunk upload succeeds within configured limits.

## OCR and Extraction

- [ ] OCR.space key is configured.
- [ ] Text-based PDF extracts without OCR.
- [ ] Extraction succeeds from a database material that has only a durable cloud `storageKey`.
- [ ] Scanned PDF runs OCR.
- [ ] Poor scan failure shows a friendly error.
- [ ] `npm run smoke:pdf` passes against the deployed backend.

## AI Generation

- [ ] NVIDIA API key is configured server-side.
- [ ] `FLASHLY_AI_PROVIDER=nvidia`.
- [ ] First progressive batch returns 3 MCQ cards.
- [ ] Background generation continues after first cards.
- [ ] Extraction output, generation job, deck, and flashcards are persisted in PostgreSQL.
- [ ] Retry generation works.
- [ ] Generated cards are MCQ by default.

## Review and Progress

- [ ] Review flow works for generated decks.
- [ ] Correct and wrong answers both persist.
- [ ] XP increases.
- [ ] Daily goal count increases.
- [ ] Streak logic still works.
- [ ] Weak cards remain available.

## Billing and Entitlements

- [ ] RevenueCat project is configured.
- [ ] `pro` entitlement exists.
- [ ] Monthly/yearly products are attached to the Current offering.
- [ ] RevenueCat webhook URL points to `/api/billing/revenuecat/webhook`.
- [ ] Test purchase succeeds in an internal test build.
- [ ] Restore purchases works.
- [ ] Backend subscription status updates to Pro.
- [ ] Free plan limits are enforced.
- [ ] Pro plan limits are enforced.

## Security

- [ ] `npm run smoke:security` passes.
- [ ] `npm run smoke:ownership` passes.
- [ ] Rate limits are configured for expected production traffic.
- [ ] Hosting proxy body-size limits match Flashly upload limits.
- [ ] API errors do not expose stack traces in production.
- [ ] Uploaded content, OCR text, prompts, and tokens are not logged.

## Monitoring

- [ ] Sentry app DSN is configured.
- [ ] Sentry backend DSN is configured.
- [ ] `SENTRY_ENVIRONMENT=production`.
- [ ] `SENTRY_RELEASE` is set.
- [ ] Client test error appears in Sentry during test build.
- [ ] Backend non-production Sentry test route was verified before production.
- [ ] PostHog key and host are configured.
- [ ] Analytics events do not include document text or secrets.

## Release

- [ ] Staging validation report is completed in `docs/staging-validation-report.md`.
- [ ] Staging has passed promotion criteria in `docs/staging-validation.md`.
- [ ] Production app build uses production env.
- [ ] Backend deployment uses production env.
- [ ] Database migrations are current.
- [ ] RevenueCat, Clerk, Sentry, PostHog, OCR.space, NVIDIA, and storage dashboards are accessible to the owner.
- [ ] Rollback plan is documented.
- [ ] Support contact or feedback path is available.
