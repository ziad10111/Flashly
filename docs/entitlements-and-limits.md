# Flashly Entitlements And Usage Limits

Flashly now has a centralized server-side entitlement layer for upload and generation limits. This is designed to work before payment integration and later connect cleanly to Google Play Billing, RevenueCat, or another subscription system.

## Plans

### Free

- max file size: 10 MB
- uploads per month: 10
- generated cards per month: 300
- total decks: 20

### Pro

- max file size: 50 MB
- uploads per month: 10,000
- generated cards per month: 100,000
- total decks: 10,000

The high Pro numbers are intentionally production-safe placeholders until paid plan configuration is finalized.

## Runtime Behavior

The entitlement module lives in:

```text
src/api/server/entitlements
```

It resolves:

- the authenticated user id from the API route auth context
- the active plan from the subscriptions repository
- current usage from existing database tables where available

Mock mode remains permissive so local development and lessons are not blocked.

## Enforcement Points

Limits are enforced before:

- direct upload job creation: `src/app/api/uploads+api.ts`
- chunk upload start: `src/app/api/uploads/chunk/start+api.ts`
- material extraction: `src/app/api/materials/[id]/extract+api.ts`
- flashcard generation and deck creation: `src/app/api/materials/[id]/generate-flashcards+api.ts`

Generation checks count requested cards before the AI provider is called. Deck count is checked when generation is expected to create a deck, such as the first progressive batch or a non-batch generation request.

## Database Mode Usage Sources

In `FLASHLY_DATA_MODE=database`, usage is read from:

- `subscriptions` for active/trialing plan state
- `uploads` for monthly upload count
- `decks` for total deck count
- `generation_jobs.generated_card_count` for monthly generated card count
- `flashcards` as a fallback monthly card count while generation job persistence is still being completed

If there is no active or trialing subscription, the user is treated as Free.

## Mock Mode

In mock mode, Flashly uses permissive Pro-like limits. This keeps local MVP flows, demos, and teaching examples working without requiring subscription setup.

## Limit Errors

When a limit is reached, API routes return:

```json
{
  "error": {
    "code": "rate-limited",
    "message": "Monthly uploads is limited on the Free plan. Limit: 10 uploads. Current usage: 10 uploads. Upgrade to Pro to continue."
  }
}
```

The upload UI displays the friendly message and shows a small Pro upgrade placeholder CTA.

## Future Payment Integration

Payment providers should update the `subscriptions` table:

- `user_id`
- `provider`
- `provider_customer_id`
- `provider_subscription_id`
- `plan_id`
- `status`
- `current_period_start`
- `current_period_end`

For RevenueCat, the webhook or server sync can translate active entitlements into `plan_id='pro'` and `status='active'`.

For Google Play Billing, a backend receipt verifier should write the same subscription shape after validating purchases server-side.

The app should not trust client-provided plan data.
