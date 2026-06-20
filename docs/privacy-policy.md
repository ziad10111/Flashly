# Flashly Privacy Policy

**Effective date:** June 20, 2026

## Introduction

Flashly is an AI-powered educational mobile application that helps students and learners turn study materials into flashcards, multiple-choice questions, review sessions, and learning progress.

This Privacy Policy explains what information Flashly may collect, how it is used, how third-party service providers may process it, and how users can request account or data deletion.

If you have questions or want to request deletion of your account or data, contact us at [flashlysupport@gmail.com](mailto:flashlysupport@gmail.com).

## Information Users Provide

Users may provide information when they create an account, use the app, upload learning materials, review flashcards, or contact support.

This information may include:

- Account information, such as identifiers provided through Clerk authentication.
- Uploaded educational materials, such as PDFs, scanned PDFs, images, text files, Markdown files, and notes.
- Study content generated from uploaded materials, including decks, flashcards, MCQ choices, explanations, and review history.
- Support messages or other information users choose to send to Flashly.

## Uploaded Educational Materials

Flashly allows users to upload educational materials so the app can extract text, run OCR when needed, and generate study cards.

Uploaded materials may include personal notes, course documents, textbook scans, exam papers, screenshots, or other learning files selected by the user. Users should avoid uploading materials they do not have the right to use or materials containing sensitive information that they do not want processed by Flashly or its service providers.

Uploaded files may be stored in Backblaze B2 cloud storage. Extracted text, OCR output, generated decks, flashcards, review sessions, progress, XP, streaks, and subscription status may be stored in PostgreSQL hosted through Aiven.

## Automatically Collected Technical Data

Flashly may collect technical information needed to operate, secure, monitor, and improve the app.

This may include:

- Device and app information, such as app version, operating system, platform, and basic runtime diagnostics.
- Backend request metadata, such as request identifiers, timestamps, status codes, and error categories.
- Crash and error information when Sentry is enabled.
- Product usage events when PostHog is enabled.

Flashly does not intentionally collect uploaded file contents, OCR text, AI prompts, authentication tokens, API keys, or secrets in analytics or crash logs.

## How Information Is Used

Flashly may use collected information to:

- Provide account access and authentication.
- Upload, store, extract, and process educational materials.
- Run OCR on scanned or image-based materials.
- Generate flashcards, MCQs, explanations, and study decks.
- Save review sessions, progress, XP, streaks, and learning history.
- Enforce usage limits and subscription entitlements.
- Process subscription status and purchase-related events.
- Monitor app reliability, diagnose errors, and improve product quality.
- Protect the app, users, backend systems, and service providers from abuse, fraud, or unauthorized access.
- Respond to support requests and deletion requests.

## AI and OCR Processing

Flashly uses OCR.space to process scanned documents or images when selectable text is not available or is insufficient.

Flashly uses NVIDIA API Catalog to generate flashcards and MCQs from extracted educational content. Uploaded material text or OCR output may be sent to NVIDIA API Catalog for the purpose of generating study content.

AI-generated content may be inaccurate or incomplete. Users should review generated flashcards and explanations before relying on them for study or exam preparation.

## Authentication

Flashly uses Clerk for authentication and account management. Clerk may process account identifiers, session information, and related authentication data to sign users in, keep sessions secure, and protect account access.

Flashly uses the authenticated user identity to associate uploads, decks, flashcards, progress, subscription status, and other app data with the correct account.

## Cloud Storage and Database Persistence

Flashly may use:

- Backblaze B2 for cloud storage of uploaded files.
- Aiven PostgreSQL for storing app data such as uploads, materials, extracted text, OCR metadata, decks, flashcards, review sessions, progress, XP, streaks, and subscription status.
- Railway for hosting backend services.

These services are used to make uploaded materials and generated study data available through the app and to support backend processing.

## Subscriptions and Payments

Flashly may offer paid subscription features. Subscription management may use RevenueCat and Google Play Billing.

Payment transactions are processed by Google Play and related payment providers. Flashly does not directly receive or store full payment card numbers. Flashly may receive subscription status, entitlement, transaction, product, renewal, and expiration information from RevenueCat or Google Play so the app can enable or disable paid features.

## Analytics and Crash Reporting

Flashly may use PostHog for product analytics when enabled. Analytics help us understand how users interact with app features and where the product can be improved.

Flashly may use Sentry for crash and error monitoring when enabled. Error monitoring helps detect crashes, backend failures, and reliability issues.

Flashly aims to avoid sending sensitive uploaded content, OCR text, AI prompts, authentication tokens, credentials, or secrets to analytics or crash reporting tools.

## Third-Party Service Providers

Flashly may use the following third-party providers:

- Clerk for authentication and account management.
- Backblaze B2 for cloud file storage.
- Aiven PostgreSQL for database hosting.
- OCR.space for OCR processing.
- NVIDIA API Catalog for AI flashcard and MCQ generation.
- RevenueCat for subscription management.
- Google Play for Android app distribution and billing.
- Railway for backend hosting.
- Sentry for crash and error monitoring, when enabled.
- PostHog for product analytics, when enabled.

These providers may process information only as needed to provide their services to Flashly, subject to their own terms and privacy practices.

## Data Sharing

Flashly does not sell personal data.

Flashly may share information with service providers listed in this policy to operate the app, process uploads, generate flashcards, manage subscriptions, monitor reliability, and protect the service.

Flashly may also disclose information when required by law, to protect rights and safety, to prevent fraud or abuse, to enforce terms, or to respond to valid legal requests.

## Data Retention

Flashly keeps information for as long as reasonably needed to provide the app, maintain user accounts, support learning history, process subscriptions, meet legal obligations, prevent fraud or abuse, resolve disputes, and maintain security.

Some information may be retained after account deletion when legally required or when needed for fraud prevention, security, billing records, backups, audit logs, or dispute resolution.

## Account and Data Deletion

Users may request account and data deletion by contacting [flashlysupport@gmail.com](mailto:flashlysupport@gmail.com).

Deletion requests should include enough information to identify the account, such as the email address used to sign in. Flashly may need to verify the request before deleting data.

After verification, Flashly will take reasonable steps to delete or de-identify account data and associated app data, subject to retention needs described in this policy.

## Data Security

Flashly uses technical and organizational measures intended to protect user information. Data is transmitted using encrypted HTTPS connections.

No method of transmission or storage is completely secure. Flashly cannot guarantee absolute security, but works to protect user information and reduce unauthorized access, disclosure, alteration, or loss.

## International Data Processing

Flashly may be used internationally. Information may be processed, stored, or transferred in countries where Flashly, its hosting providers, or service providers operate.

By using Flashly, users understand that their information may be processed outside their country of residence, subject to this Privacy Policy and applicable service provider practices.

## Children's Privacy

Flashly is intended for students and learners, but it is not specifically designed for children.

Users should only use Flashly if they are old enough to use online services in their location or have appropriate permission from a parent, guardian, school, or institution. If you believe a child has provided personal information without appropriate permission, contact [flashlysupport@gmail.com](mailto:flashlysupport@gmail.com).

## User Rights

Depending on where users live, they may have rights to request access, correction, deletion, portability, restriction, or objection regarding personal information.

Flashly has not been formally assessed for compliance with every privacy law in every jurisdiction. Users can contact [flashlysupport@gmail.com](mailto:flashlysupport@gmail.com) to make privacy-related requests, and Flashly will respond as reasonably required by applicable law.

## Changes to This Policy

Flashly may update this Privacy Policy from time to time. When changes are made, the effective date will be updated. Continued use of Flashly after an updated policy is posted means the updated policy applies to future use.

## Contact Information

For privacy questions, support requests, or account and data deletion requests, contact:

[flashlysupport@gmail.com](mailto:flashlysupport@gmail.com)
