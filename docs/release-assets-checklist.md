# Flashly Release Assets Checklist

Use this checklist before uploading Flashly 1.0.0 to Google Play.

## App Identity

- [ ] App name: `Flashly`
- [ ] Android package name: `com.flashly.app`
- [ ] Version name: `1.0.0`
- [ ] Version code confirmed in EAS/Play Console
- [ ] App category selected: Education
- [ ] Tags selected where available: study, flashcards, productivity, education

## App Icon

- [ ] App icon exported and reviewed
- [ ] Icon matches Flashly brand and owl identity
- [ ] Icon is readable at small sizes
- [ ] Icon does not include transparent padding issues
- [ ] Icon does not violate Google Play metadata rules

Current configured asset:

```text
assets/images/icon.png
```

## Adaptive Icon

- [ ] Foreground image reviewed
- [ ] Background image reviewed
- [ ] Monochrome image reviewed
- [ ] Icon tested in light and dark launchers
- [ ] Icon tested in circle, rounded square, and themed icon contexts

Configured assets:

```text
assets/images/android-icon-foreground.png
assets/images/android-icon-background.png
assets/images/android-icon-monochrome.png
```

## Feature Graphic

- [ ] 1024 x 500 px feature graphic created
- [ ] No tiny unreadable text
- [ ] No screenshots with personal data
- [ ] Flashly name or owl identity visible
- [ ] Communicates PDF/notes to flashcards clearly

Suggested message:

```text
Turn notes into smart flashcards
```

## Phone Screenshots

Prepare at least 4 screenshots. Recommended set:

- [ ] Home dashboard with daily goal and progress
- [ ] Upload screen with supported file types
- [ ] Processing/OCR/generation state
- [ ] Deck detail with generated cards
- [ ] Review screen with MCQ choices
- [ ] Answer feedback with XP
- [ ] Profile/progress screen
- [ ] Upgrade screen, if subscriptions are enabled

Screenshot rules:

- [ ] Use realistic sample study material only
- [ ] Do not show real user data
- [ ] Do not show debug menus or local server URLs
- [ ] Do not show API keys or internal IDs
- [ ] Keep text legible after Play Store compression

## Tablet Screenshots Optional

- [ ] Tablet screenshots prepared, if tablet support is advertised
- [ ] Layout reviewed on tablet dimensions
- [ ] No stretched or broken UI

## Store Listing Text

- [ ] App title finalized
- [ ] Short description finalized
- [ ] Full description finalized
- [ ] Release notes finalized
- [ ] Keywords reviewed for natural language and policy compliance

Source doc:

```text
docs/google-play-listing.md
```

## Privacy and Compliance

- [ ] Hosted privacy policy URL ready
- [ ] Privacy policy reviewed
- [ ] Data safety form completed
- [ ] Children policy and target age finalized
- [ ] Content rating questionnaire completed
- [ ] Ads declaration completed
- [ ] App access instructions completed, if login blocks review
- [ ] Subscription disclosure reviewed, if Pro is enabled

Source docs:

```text
docs/privacy-policy-draft.md
docs/data-safety-form-notes.md
```

## Support and Review Access

- [ ] Support email configured
- [ ] Website or support URL configured
- [ ] Privacy policy URL configured
- [ ] Test account credentials prepared if Google review needs sign-in
- [ ] Test account does not expose real user data
- [ ] Test account has sample decks or upload path available

Placeholders to replace:

```text
[Support email]
[Website URL]
[Privacy policy URL]
[Test account email]
[Test account password or review instructions]
```

## Production Build

- [ ] `npm run verify:production` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build:android:production` completed
- [ ] AAB downloaded or submitted
- [ ] Backend `/health` passes
- [ ] Backend `/ready` passes
- [ ] Upload tested
- [ ] OCR tested
- [ ] AI generation tested
- [ ] Review flow tested
- [ ] Purchase tested in internal testing
- [ ] Restore purchase tested
- [ ] Crash reporting tested

## Google Play Tracks

- [ ] Internal testing release created
- [ ] Internal testers added
- [ ] Install and sign-in tested from Play
- [ ] Closed testing prepared if required
- [ ] Production rollout percentage chosen
- [ ] Monitoring plan ready after release
