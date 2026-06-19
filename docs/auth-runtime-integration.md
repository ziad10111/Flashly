# Flashly Auth Runtime Integration

Flashly supports two auth runtime modes:

```bash
EXPO_PUBLIC_FLASHLY_AUTH_MODE=mock
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
```

## Mock Mode

Mock mode is the default for local lessons and demos:

```bash
EXPO_PUBLIC_FLASHLY_AUTH_MODE=mock
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

Behavior:

- app screens bypass signed-in checks
- backend API routes use the stable local user id `mock-clerk-user-flashly`
- frontend API requests do not attach fake auth headers
- local/mock repositories keep existing behavior

The app still initializes `ClerkProvider` because auth screens and profile UI use Clerk hooks. Keep a publishable key in local `.env`.

## Clerk Mode

Clerk mode uses the real signed-in Clerk user:

```bash
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_or_test_...
CLERK_SECRET_KEY=sk_live_or_test_...
```

Behavior:

- signed-out users are redirected to onboarding/sign-in
- signed-in users can access tabs and study flows
- frontend API requests attach the current Clerk session token
- backend API routes verify the token with `@clerk/backend`
- repository context uses the verified Clerk user id
- database repositories upsert the user record when first needed

Never expose `CLERK_SECRET_KEY` with an `EXPO_PUBLIC_` prefix.

## Local Development

1. Create or open a Clerk application.
2. Copy the publishable key into `.env`:

```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
```

3. For mock mode:

```bash
EXPO_PUBLIC_FLASHLY_AUTH_MODE=mock
```

4. For real auth mode:

```bash
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
CLERK_SECRET_KEY=sk_test_...
```

5. Restart Expo after changing env variables.

## Production Setup

Set server-only values in the backend hosting environment:

```bash
CLERK_SECRET_KEY=sk_live_...
```

Set client-safe values in the Expo app build environment:

```bash
EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
```

If `FLASHLY_DATA_MODE=database` is also enabled, run migrations before production traffic:

```bash
npm run db:migrate
```

## Manual Verification

Use `EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk`:

1. Launch the app signed out.
   - Expected: onboarding/auth screens are shown.
2. Create a new account.
   - Expected: successful sign-up enters study type selection or the app tabs.
3. Sign out from Profile.
   - Expected: app returns to onboarding and tabs are blocked.
4. Sign in again.
   - Expected: app tabs are available.
5. Upload a file.
   - Expected: backend receives a Clerk-authenticated request and uses the real Clerk user id.
6. With `FLASHLY_DATA_MODE=database`, create data as user A.
7. Sign in as user B and try to open user A's deck URL/id.
   - Expected: repositories scoped by user id do not return user A's data.

## Common Errors

`Missing Clerk session token.`

- The frontend did not attach a token.
- Confirm `EXPO_PUBLIC_FLASHLY_AUTH_MODE=clerk` and the user is signed in.

`Clerk backend authentication is missing server configuration.`

- `CLERK_SECRET_KEY` is missing on the backend.
- Add it as a server-only env variable.

`Invalid or expired Clerk session token.`

- The token is expired, malformed, or belongs to another Clerk instance.
- Sign in again and verify publishable/secret keys come from the same Clerk app.

`Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to the .env file.`

- The Expo runtime needs the publishable key for `ClerkProvider`.
- This key is safe to expose because it is explicitly public.
