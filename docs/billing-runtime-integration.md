# Flashly Billing Runtime Integration

Flashly now has a provider-based billing boundary. It supports safe mock billing during development, RevenueCat webhooks on the backend, and native RevenueCat purchases in production Android builds.

## Why RevenueCat

RevenueCat is a good first production billing layer for Flashly because it can sit above Apple, Google Play, and future web payments while exposing one entitlement model to the backend. Flashly can keep enforcing its own server-side limits from the `subscriptions` table and let RevenueCat handle store purchase state, renewals, cancellations, and billing issues.

## Billing Modes

```bash
FLASHLY_BILLING_MODE=mock
FLASHLY_BILLING_MODE=revenuecat
```

### Mock

Mock mode is the default. It returns a local Pro-like subscription status for development screens and does not require any webhook configuration.

### RevenueCat

RevenueCat mode enables the webhook endpoint and maps RevenueCat events into Flashly subscriptions.

Required server configuration:

```bash
FLASHLY_BILLING_MODE=revenuecat
REVENUECAT_WEBHOOK_SECRET=shared_webhook_secret
```

RevenueCat mode fails closed. If `FLASHLY_BILLING_MODE=revenuecat` is enabled and `REVENUECAT_WEBHOOK_SECRET` is missing, the webhook rejects all requests with a server configuration error. Unsigned webhook requests are not accepted.

Optional server-only configuration:

```bash
REVENUECAT_PROJECT_ID=project_id
REVENUECAT_API_KEY=<YOUR_REVENUECAT_API_KEY>
```

Client-side native purchase configuration:

```bash
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=public_android_sdk_key
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=public_ios_sdk_key
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
```

The platform SDK keys are safe to expose to the native client. For Android, use the public SDK key for the RevenueCat app whose package is `com.flashly.app`. RevenueCat keys beginning with `test_` are rejected in release builds. RevenueCat webhook secrets and REST API keys are server-only and must never use `EXPO_PUBLIC_`.

## Endpoints

### RevenueCat Webhook

```text
POST /api/billing/revenuecat/webhook
```

The webhook expects the shared secret in either:

```text
Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
```

or:

```text
X-RevenueCat-Signature: <REVENUECAT_WEBHOOK_SECRET>
```

Webhook verification behavior:

- configured secret plus matching `Authorization: Bearer ...` header: accepted
- configured secret plus matching `X-RevenueCat-Signature` header: accepted
- missing server `REVENUECAT_WEBHOOK_SECRET` in RevenueCat mode: rejected with HTTP 500
- missing incoming auth/signature header: rejected with HTTP 401
- incorrect incoming secret: rejected with HTTP 403

The first implementation expects RevenueCat `app_user_id` to be the Clerk user id. This keeps identity mapping simple and lets database repositories store subscriptions against the same user records used by entitlements.

Mapped event fields:

- `event.id`
- `event.type`
- `event.app_user_id`
- `event.product_id`
- `event.entitlement_id` or `event.entitlement_ids`
- `event.original_transaction_id` or `event.transaction_id`
- `event.purchased_at_ms`
- `event.expiration_at_ms`

RevenueCat product or entitlement ids containing `pro` or `premium` map to Flashly `plan_id='pro'`; otherwise they map to `free`.

### Current Subscription

```text
GET /api/me/subscription
```

Requires normal Flashly backend auth. Returns:

- current plan
- subscription status
- renewal or expiration date when available
- entitlement source
- limits summary

## Database Behavior

RevenueCat webhook events upsert rows in `subscriptions` using:

- `provider='revenuecat'`
- `provider_customer_id=app_user_id`
- `provider_subscription_id=original_transaction_id || transaction_id || event.id`
- `plan_id='free' | 'pro'`
- `status='active' | 'past-due' | 'canceled'`

Migration `002_revenuecat_subscriptions.sql` updates the subscription provider constraint to allow `revenuecat`.

## Native Purchase Screen

The app has a RevenueCat-aware upgrade screen:

```text
src/app/upgrade.tsx
```

It shows:

- current plan when the backend is available
- Pro benefits
- current limits
- monthly or yearly RevenueCat packages when native purchases are available
- purchase and restore actions
- a clear production-build notice when RevenueCat is unavailable

Native purchase setup uses `react-native-purchases`. The SDK is configured only when all of these are true:

- the app is running in a native Android or iOS release build
- the matching platform `EXPO_PUBLIC_REVENUECAT_*_API_KEY` is present and does not start with `test_`
- a Clerk user is signed in

Expo Go and development builds without RevenueCat configuration keep the placeholder messaging and do not crash if the native module is unavailable. The Clerk user id is used as the RevenueCat app user id so webhook `app_user_id` maps back to Flashly users.

After purchase or restore, the screen refreshes:

```text
GET /api/me/subscription
```

Server-side entitlement checks remain authoritative. The client purchase state never bypasses upload, generation, or deck limits.

## RevenueCat Dashboard Setup

1. Create a RevenueCat project for Flashly.
2. Add the Android app with package `com.flashly.app` and copy the public Android SDK key into `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`.
3. Create a `pro` entitlement, or set `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID` to the entitlement id you choose.
4. Connect Google Play Billing in RevenueCat.
5. Add monthly and yearly subscription products from Google Play.
6. Attach those products to an offering that is marked as Current.
7. Configure the Flashly webhook URL:

```text
POST /api/billing/revenuecat/webhook
```

8. Set the same shared secret in RevenueCat and `REVENUECAT_WEBHOOK_SECRET`.

Recommended Google Play product id examples:

```text
flashly_pro_monthly
flashly_pro_yearly
```

RevenueCat maps these products to the `pro` entitlement. Flashly also treats RevenueCat product or entitlement ids containing `pro` or `premium` as the Pro plan when processing webhook events.

## Google Play Billing Later

Two paths are supported by this architecture:

1. RevenueCat Android SDK handles Google Play purchases and sends webhook updates to Flashly.
2. A future direct Google Play Billing backend verifies purchase tokens and writes the same `subscriptions` rows.

In both cases, entitlement enforcement remains server-side and reads the subscription state rather than trusting client purchase data.

## Manual Testing Checklist

1. Run migrations:

```bash
npm run db:migrate
```

Run the webhook security smoke test:

```bash
npm run smoke:billing
```

This verifies fail-closed behavior for missing server secret, missing incoming auth, wrong incoming secret, and valid secret headers without touching the database.

2. Configure:

```bash
FLASHLY_BILLING_MODE=revenuecat
REVENUECAT_WEBHOOK_SECRET=local_secret
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=public_android_sdk_key
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
```

3. Send a test webhook with a Clerk user id as `app_user_id`.
4. Confirm `POST /api/billing/revenuecat/webhook` returns `processed`.
5. Confirm the `subscriptions` table has a `revenuecat` row.
6. Sign in as the same user and call `GET /api/me/subscription`.
7. Confirm the Upgrade screen shows the expected plan and limits.
8. Confirm entitlement limits use the stored subscription plan.

## Android Internal Testing

1. Create Google Play subscription products and attach them to the RevenueCat Current offering.
2. Add license testers in Google Play Console.
3. Build a native Android production or internal testing build. Expo Go cannot load the RevenueCat native module.
4. Sign in with Clerk.
5. Open the Upgrade screen and confirm RevenueCat packages load.
6. Purchase a monthly or yearly package with a license tester account.
7. Confirm RevenueCat sends a webhook to Flashly.
8. Confirm `GET /api/me/subscription` returns `planId: "pro"`.
9. Confirm upload and generation limits use Pro limits.
10. Test Restore purchases on a fresh install signed in as the same Clerk user.

Internal testing notes:

- Store purchase state can take a short time to reach the backend through webhooks.
- The Upgrade screen refreshes subscription status after purchase and restore, but backend limits should be verified after the webhook has been processed.
- If packages do not appear, check that the RevenueCat offering is Current and that Google Play products are approved or available for testers.
