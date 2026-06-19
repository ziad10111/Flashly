# Flashly Privacy Policy Draft

This is a draft for legal review and hosting before Google Play submission. Replace placeholders and confirm the final policy with counsel or a qualified privacy reviewer.

Effective date:

```text
[Effective date]
```

Contact:

```text
[Support email]
```

## Overview

Flashly is a learning app that helps users upload study material and generate flashcards for review. This policy explains what data Flashly may collect, how it is used, and how users can request access or deletion.

## Account Data

Flashly may use Clerk for account creation, sign-in, authentication, and session management.

Account data may include:

- Name or display name, if provided
- Email address
- Clerk user identifier
- Authentication and session metadata

Flashly uses this data to provide account access, protect user data, and connect saved learning content to the signed-in user.

## Uploaded Files and Educational Content

Users may upload PDFs, images, text files, or study notes. Uploaded content may include lecture notes, scanned pages, exam practice material, textbook excerpts, or other educational files selected by the user.

Flashly processes uploaded files to:

- Extract text
- Run OCR when a file is scanned or image-based
- Generate flashcards and quizzes
- Save decks and learning progress when cloud sync is enabled

Users should not upload content they do not have permission to process or content containing sensitive personal information unless they understand the risks.

## OCR Processing

Flashly may send uploaded images or scanned document pages to an OCR provider, such as OCR.space, to convert images into text.

OCR processing may include:

- Image files
- Scanned PDF pages
- Extracted page images
- Related processing metadata such as file type and page count

OCR output is used to generate study material and is not intended for identity verification or biometric recognition.

## AI Generation Processing

Flashly may send extracted study text to an AI provider to generate flashcards, answer choices, explanations, and study prompts.

AI processing may include:

- Extracted text from uploaded files
- Generated card instructions
- Non-secret processing metadata

Flashly should not send API keys or user authentication secrets to AI providers. AI-generated content may be inaccurate, incomplete, or need review against the original source material.

## Generated Flashcards, Decks, and Progress

Flashly may store generated learning data such as:

- Deck titles
- Flashcard questions, choices, answers, and explanations
- Review answers
- Correct and incorrect counts
- XP, streaks, daily goals, and progress
- Weak-card tracking

This data is used to provide review sessions, progress tracking, and personalized study features.

## Purchases and Subscriptions

Flashly may use Google Play Billing and RevenueCat to manage subscriptions and entitlement status.

Flashly may receive subscription metadata such as:

- Product identifier
- Subscription status
- Renewal or expiration status
- Entitlement status
- Transaction identifiers or event identifiers

Payment card details are processed by Google Play and are not stored by Flashly.

## Analytics

Flashly may use PostHog analytics to understand product usage and improve the app.

Analytics events may include:

- App screen usage
- Feature usage
- Upload and generation flow status
- Non-sensitive device and app metadata

Flashly should not intentionally send uploaded document text, OCR text, AI prompts, authentication tokens, payment secrets, or private file contents to analytics tools.

## Crash Logs and Error Monitoring

Flashly may use Sentry to collect crash reports and error diagnostics.

Crash data may include:

- Error messages
- Stack traces
- Device and app version metadata
- Request identifiers for backend errors

Flashly should not intentionally log secrets, authentication tokens, uploaded file contents, extracted OCR text, or AI prompts.

## Data Sharing

Flashly may share data with service providers that help operate the app, including:

- Clerk for authentication
- OCR providers for scanned file processing
- AI providers for flashcard generation
- Cloud storage providers for uploaded files
- PostgreSQL hosting providers for app data
- RevenueCat and Google Play for subscriptions
- PostHog for analytics
- Sentry for crash reporting

These providers process data only as needed to provide app functionality, security, analytics, billing, or support.

## Data Retention

Flashly retains account data, uploaded files, generated cards, progress, subscription status, and related records for as long as needed to provide the service, comply with legal obligations, prevent abuse, resolve disputes, and support user requests.

Retention periods should be finalized before production release:

```text
[Add final retention period for uploaded files]
[Add final retention period for generated decks and progress]
[Add final backup retention period]
```

## User Deletion and Contact Requests

Users may request deletion of their account or app data by contacting:

```text
[Support email]
```

Flashly should provide a process for:

- Deleting account-linked learning data
- Removing uploaded files where possible
- Deleting generated decks and review progress
- Explaining data that must be retained for legal, billing, security, or backup reasons

## Security

Flashly uses encryption in transit for app and backend communication where supported. Production deployments should use HTTPS, server-side secrets, authenticated access, database ownership checks, and cloud storage protections.

No system is perfectly secure. Users should avoid uploading highly sensitive personal, financial, medical, or confidential material unless they understand how the app processes uploaded content.

## Children Policy Placeholder

Flashly is intended for:

```text
[Define intended age range before release]
```

If Flashly is not intended for children under the applicable age threshold, include language such as:

```text
Flashly is not intended for children under [age]. We do not knowingly collect personal data from children under [age].
```

Confirm child-directed status, age target, and Google Play Families Policy requirements before release.

## Changes to This Policy

Flashly may update this privacy policy from time to time. The updated policy should be posted at the hosted privacy policy URL with a revised effective date.
