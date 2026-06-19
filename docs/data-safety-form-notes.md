# Google Play Data Safety Form Notes

These notes help prepare the Google Play Data safety form for Flashly. They are not a substitute for legal review. Confirm final answers against production behavior, provider contracts, and the hosted privacy policy.

## App Data Practices Summary

Flashly processes user-selected study material to generate flashcards and track learning progress. Data may be processed by backend services and service providers for authentication, OCR, AI generation, storage, subscriptions, analytics, and crash reporting.

## Encryption in Transit

Production should answer yes only if all app-to-backend and backend-to-provider traffic uses HTTPS/TLS.

Expected production answer:

```text
Data is encrypted in transit.
```

## User Data Deletion

Google Play asks whether users can request deletion of their data.

Expected production answer:

```text
Users can request data deletion by contacting [Support email].
```

Add an in-app deletion flow later if required by policy or product scope.

## Data Categories

### Personal Info

Possible data:

- Email address
- Name or display name, if provided
- User ID

Purpose:

- Account management
- App functionality
- Security and fraud prevention
- Customer support

Required or optional:

- Required for signed-in cloud functionality
- Optional only if app supports mock/offline usage in production

Shared with service providers:

- Clerk
- Backend/database provider
- Sentry or PostHog if user identifiers are attached

### Files and Docs

Possible data:

- Uploaded PDFs
- Uploaded images
- Uploaded text or markdown files
- Extracted text from documents
- OCR output

Purpose:

- App functionality
- Flashcard generation
- User content storage

Required or optional:

- Optional user-provided data
- Required only when the user chooses to upload material

Shared with service providers:

- Cloud storage provider
- OCR provider
- AI provider
- Backend/database provider

Notes:

- Uploaded educational content may contain personal data if the user includes it.
- Flashly should not use uploaded files for advertising.
- Flashly should not sell uploaded educational content.

### App Activity

Possible data:

- App interactions
- Screen views
- Upload flow events
- Generation status events
- Review activity
- Subscription status checks

Purpose:

- Analytics
- Product improvement
- App functionality
- Security and debugging

Required or optional:

- Some app activity is required for core functionality
- Analytics collection should be configurable according to final privacy choices

Shared with service providers:

- PostHog
- Sentry
- Backend/database provider

### App Info and Performance

Possible data:

- Crash logs
- Diagnostics
- App version
- Device model
- Operating system version
- Request identifiers

Purpose:

- Crash reporting
- App performance monitoring
- Security and debugging

Required or optional:

- Usually collected for app quality and security

Shared with service providers:

- Sentry
- PostHog, if performance events are enabled

### Purchases

Possible data:

- Subscription status
- Product ID
- Entitlement status
- Transaction or event identifiers
- Renewal or expiration date

Purpose:

- Subscription management
- Entitlement enforcement
- Fraud prevention

Required or optional:

- Required only for paid subscription features

Shared with service providers:

- Google Play
- RevenueCat
- Backend/database provider

Payment card data:

- Processed by Google Play
- Not collected directly by Flashly

### Device or Other IDs

Possible data:

- Clerk user ID
- RevenueCat app user ID
- Analytics distinct ID
- Device or installation metadata from SDKs

Purpose:

- Authentication
- Entitlements
- Analytics
- Crash diagnostics
- Fraud prevention

Shared with service providers:

- Clerk
- RevenueCat
- PostHog
- Sentry

## Data Sharing Notes

Google Play distinguishes collection from sharing. Service providers may count as sharing depending on policy interpretation and contract terms.

Document service providers:

- Clerk: authentication
- RevenueCat: subscription management
- Google Play: purchases
- OCR.space: OCR processing
- NVIDIA or configured AI provider: AI generation
- Cloudflare R2 or S3-compatible provider: file storage
- PostgreSQL provider: app data storage
- PostHog: analytics
- Sentry: crash monitoring

## Optional vs Required Data

Required for app account/cloud mode:

- Account identifier
- Authentication token/session metadata
- Generated deck/progress records needed to operate the app

Optional user-provided data:

- Uploaded files
- Uploaded images
- Uploaded text notes

Optional or configurable:

- Analytics, depending on final implementation and consent requirements

## Content Rating Notes

Flashly is an educational productivity app. The app does not intentionally include:

- User-generated public sharing
- Gambling
- Violence
- Dating
- Location tracking
- Ads, unless added later

Generated flashcard content depends on user-uploaded educational material. Review whether this affects content rating declarations before release.

## Final Review Checklist

- Confirm all SDKs used in production.
- Confirm whether analytics can be disabled.
- Confirm whether uploaded files are retained and for how long.
- Confirm whether deleted user data is removed from backups after a defined period.
- Confirm child-directed status and target age.
- Confirm privacy policy hosted URL matches the final Data safety answers.
