# Android Pre-Release QA

Use this checklist before promoting Flashly from Google Play internal testing to a wider release.

## Automated Pre-Release Command

Run:

```bash
npm run pre-release-check
```

The command runs the available automated checks in this order:

- `npm run typecheck`
- `npm run lint`
- `npm run smoke:security`, when the backend health endpoint is reachable
- `npm run build:server`
- `npm run verify:production`, when production env is fully configured
- `npm run smoke:database`, when `DATABASE_URL` exists
- `npm run smoke:storage`, when cloud storage env is configured
- `npm run smoke:ownership`, when `DATABASE_URL` exists

For a strict production gate, set:

```bash
FLASHLY_REQUIRE_PRODUCTION_ENV=true
```

If this flag is set, missing production env makes the pre-release check fail instead of skip.

## Fresh Install

- [ ] Install the app from Google Play internal testing.
- [ ] Confirm the app opens without a crash.
- [ ] Confirm splash screen and app icon are correct.
- [ ] Confirm no development menu or debug UI is visible.
- [ ] Confirm app version matches the intended release.

## Authentication

- [ ] Sign up with a new test user.
- [ ] Sign out.
- [ ] Sign in again.
- [ ] Confirm signed-out users cannot access private tabs.
- [ ] Confirm a second test user cannot see the first user's decks or progress.

## Upload: Small PDF

- [ ] Upload a small text-based PDF.
- [ ] Confirm upload progress is visible.
- [ ] Confirm text extraction runs without OCR.
- [ ] Confirm first cards are generated.
- [ ] Confirm generated cards open in Deck Detail.

## Upload: Scanned PDF

- [ ] Upload a scanned or image-only PDF.
- [ ] Confirm the UI says OCR is running.
- [ ] Confirm generation continues after OCR.
- [ ] Confirm generated cards are readable and based on the scan.

## Upload: Large PDF

- [ ] Upload a large PDF near the supported file-size limit for the active plan.
- [ ] Confirm chunk upload starts.
- [ ] Confirm progress does not freeze.
- [ ] Confirm generation begins after enough content is available.
- [ ] Confirm background generation continues after first cards are ready.

## OCR Failure Handling

- [ ] Upload an unreadable or intentionally poor-quality scan.
- [ ] Confirm the app shows a friendly error.
- [ ] Confirm the app does not crash.
- [ ] Confirm retry or upload-again options are clear.

## MCQ Generation

- [ ] Upload normal explanatory text without MCQ formatting.
- [ ] Confirm generated cards are MCQs.
- [ ] Confirm each card has four choices.
- [ ] Confirm one choice is correct.
- [ ] Confirm explanations are brief and source-based.
- [ ] Upload existing MCQ material and confirm choices are preserved when possible.

## Progressive Generation

- [ ] Confirm the first batch opens quickly.
- [ ] Confirm Deck Detail card count updates live.
- [ ] Confirm Review sees newly generated cards without manual refresh.
- [ ] Confirm no duplicate cards appear.
- [ ] Confirm retry works after a partial generation error.

## Review Flow

- [ ] Start a review session from Deck Detail.
- [ ] Answer MCQ cards correctly and incorrectly.
- [ ] Confirm feedback colors, sounds, and haptics work.
- [ ] Confirm current card does not reset when new cards arrive.
- [ ] Complete a review session and verify the summary screen.

## XP and Progress

- [ ] Confirm correct and wrong answers both count as reviewed.
- [ ] Confirm XP increases when expected.
- [ ] Confirm Daily Goal updates after returning Home.
- [ ] Confirm streak behavior is correct.
- [ ] Confirm weak cards are tracked.
- [ ] Restart the app and confirm progress persists.

## Free Plan Limits

- [ ] Use a free-plan test user.
- [ ] Try uploading a file above the free file-size limit.
- [ ] Confirm the limit error is friendly.
- [ ] Confirm the upgrade CTA is visible.
- [ ] Confirm uploads, generated cards, and deck-count limits are enforced.

## Upgrade Screen

- [ ] Open the Upgrade screen.
- [ ] Confirm current plan is displayed.
- [ ] Confirm Pro benefits are clear.
- [ ] Confirm the screen does not crash if RevenueCat offerings are unavailable.
- [ ] Confirm unavailable native payments show the production-build message.

## Purchase and Restore in Internal Testing

- [ ] Use a Google Play license tester.
- [ ] Purchase the monthly or yearly Pro package.
- [ ] Confirm RevenueCat reports the Pro entitlement.
- [ ] Confirm backend subscription status updates.
- [ ] Confirm limits update to Pro.
- [ ] Restore purchases on a fresh install.
- [ ] Confirm restore updates entitlement status.

## Offline and Poor Network Behavior

- [ ] Open the app offline.
- [ ] Confirm cached/local screens do not crash.
- [ ] Try upload while offline and confirm friendly failure.
- [ ] Interrupt network during upload and confirm recoverable state.
- [ ] Interrupt network during generation and confirm retry works.
- [ ] Confirm no endless spinner remains after network recovery.

## Crash Monitoring Test

- [ ] Confirm Sentry DSNs are configured for the build.
- [ ] Trigger a safe development-only backend error in staging, if available.
- [ ] Confirm Sentry receives the backend error with request id.
- [ ] Confirm client errors are captured without secrets or uploaded content.
- [ ] Confirm no crash trigger is exposed in production UI.

## Privacy Policy URL

- [ ] Hosted privacy policy URL is public.
- [ ] URL matches the Google Play listing.
- [ ] Policy mentions account data, uploaded files, OCR, AI processing, analytics, crash logs, subscriptions, retention, and deletion requests.
- [ ] Support email is real and monitored.

## Play Store Internal Testing

- [ ] AAB uploaded to the internal track.
- [ ] Data safety form completed.
- [ ] Content rating completed.
- [ ] App access instructions completed.
- [ ] Test account provided if needed.
- [ ] Store listing screenshots and feature graphic uploaded.
- [ ] Internal testers can install from Play.
- [ ] Internal testers complete upload, generation, review, and purchase tests.

## Release Decision

- [ ] `npm run pre-release-check` has no unexpected failures.
- [ ] All required production service smoke checks passed in staging or production.
- [ ] Manual QA blockers are resolved.
- [ ] Monitoring is active.
- [ ] Rollout plan is documented.
