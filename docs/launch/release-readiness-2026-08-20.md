# Anstoss Release Readiness — 2026-08-20

## Decision

The Expo 57 mobile source and native iOS project are release-build ready, but
the product is not yet ready to submit as a complete app-and-admin launch.
Submission remains blocked by Expo project access and unverified App Store
Connect metadata. The admin console remains blocked by deployment and DNS.

## Verified locally

- `npm run validate`: passed for mobile, API, shared, worker, web, and admin.
- Mobile: 116 suites passed; 542 tests passed; 1 skipped.
- API: 51 suites and 514 tests passed.
- Shared: 7 suites and 117 tests passed.
- Admin static smoke test, lint, typecheck, and build passed.
- `npm run audit:store`: passed.
- `npx expo-doctor@latest`: 21/21 checks passed.
- Expo 57 / React Native 0.86 dependencies and iOS pods are aligned.
- Xcode 26.6 Release simulator build completed with `BUILD SUCCEEDED` and ran
  Xcode's store validation step.
- The SDK 57 build uses the fingerprint runtime policy, isolating it from the
  existing SDK 56 TestFlight binary and incompatible OTA updates.
- The native splash uses the cropped app mark at 200pt with 1x/2x/3x assets.
- Face ID, Expo development-network declarations, and unwanted Android
  media/storage/overlay permissions are absent or blocked by release
  configuration.
- The production API health endpoint reports API and database healthy.
- Privacy policy, terms, and account-deletion pages return HTTP 200.

## Mobile submission blockers

1. EAS CLI is signed in as `renuirapp-2`, which cannot read Expo project
   `a30e1b35-50fa-4214-b121-f457dfb1444c` owned by `opemati1521`. Sign in to
   the authorized account before creating the Expo 57 replacement build.
2. Verify or complete App Store Connect privacy labels, age rating, screenshots,
   reviewer notes, and a working reviewer account/demo club. These are external
   records and could not be inspected with the current credentials.
3. Do not publish an SDK 57 EAS Update with runtime `1.0.0`. Build and test the
   fingerprint-runtime binary first.

## Admin launch blockers

1. `admin.anstoss.app` and `admin.anstoss.io` do not resolve in DNS.
2. Create and deploy the `apps/admin` service, configure Basic Auth and
   `API_UPSTREAM`, attach the private/custom hostname, and verify `/healthz`.
3. Perform authenticated browser smoke tests with a real `PLATFORM_ADMIN`
   operator after deployment. Local static checks do not validate production
   routing, credentials, or operator permissions.

## Accepted risk / follow-up

- `npm audit --omit=dev` reports eight high-severity advisories in the
  Expo/Metro `image-size` build chain. There is no safe patched Expo 57 upgrade
  available at this review; do not force the suggested Expo downgrade. Track
  upstream and rerun the audit before each release.
- Android Play submission additionally requires the production signing
  fingerprint in App Links and completed Play Data Safety/App Access forms.

## Release sequence

1. Restore authorized Expo access.
2. Build the iOS `testflight` profile from this reviewed worktree.
3. Test onboarding, DOB keyboard behavior, club/team creation, chat, tabs,
   profile verification state, notifications, media, and account deletion on
   the new TestFlight binary.
4. Complete App Store Connect records and submit that binary for review.
5. Deploy the admin console, then run authenticated production smoke tests.
