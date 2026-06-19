# Flashly Staging Validation Report

## Validation Metadata

- Validation date:
- Validator:
- Backend URL:
- Deployment platform:
- Container image/tag:
- Backend git commit:
- Backend version:
- Android version:
- Android version code:
- Database migration version:

## Configured Service Modes

- `FLASHLY_ENV`:
- `FLASHLY_DATA_MODE`:
- `FLASHLY_STORAGE_MODE`:
- `FLASHLY_STORAGE_PROVIDER`:
- `EXPO_PUBLIC_FLASHLY_AUTH_MODE`:
- `FLASHLY_EXTRACTION_MODE`:
- `FLASHLY_OCR_PROVIDER`:
- `FLASHLY_GENERATION_MODE`:
- `FLASHLY_AI_PROVIDER`:
- `FLASHLY_BILLING_MODE`:
- `SENTRY_ENVIRONMENT`:

## Automated Results

- Health result:
- Readiness result:
- Database result:
- Storage result:
- Cloud extraction result:
- Generation persistence result:
- Ownership result:
- Billing result:
- Security result:
- Staging E2E result:
- Docker build result:
- Docker run result:
- `check:staging-deployment` result:
- `verify:staging` exit code:
- Staging smoke run id:

## Functional Results

- Upload metadata persistence:
- Chunk upload:
- Chunk duplicate completion behavior:
- Extraction from `storageKey`:
- OCR fallback:
- MCQ generation:
- Progressive generation:
- Deck persistence:
- Flashcard persistence:
- MCQ choices persisted:
- `correctChoiceId` persisted:
- Review persistence:
- Progress persistence:
- Subscription status:
- Test data cleanup/manual cleanup id:

## Manual Android Results

- Fresh install:
- Sign up:
- Sign in:
- Sign out:
- Small PDF:
- Scanned PDF:
- Large PDF:
- Poor network:
- Upgrade screen:
- Purchase:
- Restore:

## Known Limitations

- Expo large-file upload still allocates file base64 before chunking.
- Destructive staging cleanup is manual until safe test-only cleanup routes exist.

## Final Decision

- Pass/fail:
- Approved for Google Play Internal Testing:
- Required fixes before promotion:

Do not include secrets, session tokens, uploaded document text, OCR output, or AI prompts in this report.
