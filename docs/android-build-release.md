# Flashly Android Build and Release

Flashly is configured for Android production builds with EAS. The production profile creates an Android App Bundle (`.aab`) for Google Play, and the preview profile creates an internal APK for testing.

## Android Identity

App name:

```text
Flashly
```

Android package name:

```text
com.flashly.app
```

Version:

```text
1.0.0
```

Initial Android versionCode:

```text
1
```

EAS production builds use remote app versioning with `autoIncrement`, so later production builds can increment Play-ready build numbers through EAS.

## Install and Login to EAS CLI

Install:

```bash
npm install -g eas-cli
```

Login:

```bash
eas login
```

Confirm access:

```bash
eas whoami
```

## Configure the EAS Project

If the project has not been linked to EAS yet, run:

```bash
eas init
```

This may add an EAS project id to Expo config. Commit the project id if Expo adds it to config, but do not commit any secrets.

## Production Public Environment

Use `.env.app.production.example` as the source of client-safe variables. Configure these in EAS environment variables or your build environment:

```bash
EXPO_PUBLIC_USE_BACKEND=true
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
EXPO_PUBLIC_FLASHLY_API_BASE_URL=https://your-flashly-backend.example
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_replace_me
EXPO_PUBLIC_POSTHOG_KEY=phc_replace_me
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_replace_me
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_replace_me
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
EXPO_PUBLIC_SENTRY_DSN=https://public@sentry.example/project
```

Never put backend secrets in app build env. Do not use `CLERK_SECRET_KEY`, `DATABASE_URL`, S3 secrets, NVIDIA keys, OCR keys, RevenueCat webhook secrets, or backend Sentry DSNs in the Expo client.

For EAS builds, set the public RevenueCat SDK keys in the EAS dashboard or with the CLI. Preview and production Android builds must use the public Android SDK key from the RevenueCat app configured for `com.flashly.app`, not a key beginning with `test_`.

```bash
eas env:create --environment preview --name EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY --value goog_replace_me --visibility plaintext --force --non-interactive
eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY --value goog_replace_me --visibility plaintext --force --non-interactive
eas env:create --environment preview --name EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID --value pro --visibility plaintext --force --non-interactive
eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID --value pro --visibility plaintext --force --non-interactive
```

Use `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` the same way when an iOS build is added. RevenueCat secret REST keys and webhook secrets belong only in backend/server environments.

## Build Profiles

`eas.json` includes:

- `development`: development client
- `preview`: internal APK
- `production`: Google Play AAB

Preview profile:

```json
{
  "distribution": "internal",
  "android": {
    "buildType": "apk"
  }
}
```

Production profile:

```json
{
  "autoIncrement": true,
  "android": {
    "buildType": "app-bundle"
  }
}
```

## Build Preview APK

Use this for internal testing outside Google Play:

```bash
npm run build:android:preview
```

or:

```bash
eas build --platform android --profile preview
```

The EAS build page will provide an APK download link when complete.

## Build Production AAB

Use this for Google Play Console:

```bash
npm run build:android:production
```

or:

```bash
eas build --platform android --profile production
```

The EAS build page will provide an `.aab` artifact link when complete.

## Submit to Google Play

First configure Google Play credentials and service account access in EAS/Google Play Console. Then submit the production build manually through the Play Console or with:

```bash
eas submit --platform android --profile production
```

The current submit profile targets the `internal` track by default. Move from internal to closed, open, then production as testing matures.

## Android Permissions Review

Flashly disables or blocks permissions that are not needed for this release:

- `android.permission.CAMERA`
- `android.permission.RECORD_AUDIO`
- `android.permission.READ_MEDIA_AUDIO`
- `android.permission.READ_MEDIA_VIDEO`

The `expo-audio` plugin is configured for foreground app sounds only:

```json
["expo-audio", { "recordAudioAndroid": false, "enableBackgroundPlayback": false }]
```

The app uses document picking, backend upload, RevenueCat purchases, and network-backed learning flows. Re-check generated Android permissions before Play submission:

```bash
eas build:inspect --platform android --profile production
```

## Adaptive Icon

Android adaptive icon assets are configured in `app.json`:

```text
assets/images/android-icon-foreground.png
assets/images/android-icon-background.png
assets/images/android-icon-monochrome.png
```

Preview these on devices with light/dark themes before uploading to Google Play.

## Where to Find Artifacts

After a build starts, EAS prints a build URL. You can also list builds:

```bash
eas build:list --platform android
```

Open the build URL to download the APK or AAB artifact.

## Common Build Errors

Missing EAS project:

```text
Run eas init and commit any generated project id.
```

Missing public env:

```text
Set EXPO_PUBLIC_FLASHLY_API_BASE_URL, EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY, and RevenueCat public key in EAS env.
```

RevenueCat package not available:

```text
Use an EAS native build. Expo Go cannot perform real purchases.
```

Google Play package conflict:

```text
The package name com.flashly.app must be unique in Google Play and cannot be changed after release.
```

Wrong artifact type:

```text
Use preview for APK testing and production for AAB upload.
```

Version code already used:

```text
Run eas build:version:set or let EAS remote autoIncrement assign the next versionCode.
```

Backend requests fail in production build:

```text
Verify EXPO_PUBLIC_FLASHLY_API_BASE_URL points to the deployed backend and /health passes.
```
