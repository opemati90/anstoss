# Anstoss release readiness — 2026-08-21

## Decision

The final source candidate is **not yet launch-ready as a deployed product**.
Automated code and store gates pass, but the production deployment and store
binaries predate the reviewed fixes. The admin console is packaged but not
deployed. Do not submit iOS build 60.

## Current verified source

- API: 66 suites / 562 tests passed.
- Mobile: 116 suites / 542 tests passed / 1 skipped.
- Shared: 7 suites / 117 tests passed.
- Lint, TypeScript, repository builds, store audit, coverage audit, admin local
  smoke, mobile contrast, Expo Doctor, and dependency-tree validation passed.
- Expo SDK 57 / React Native 0.86.2 use OTA runtime `57.0.0`; SDK 56 build 58
  remains isolated on runtime `1.0.0`.
- iOS Podfile.lock now includes Reanimated and Worklets.
- EAS is authenticated as project owner `opemati1521`.

## Release blockers

1. Current branch is ahead of `origin/develop`; push and allow CI/deploy to
   finish, then canary the live API, legal pages, invite landing, and App Links.
2. iOS build 60 came from commit `831ee89` and does not contain the reviewed
   security/mobile fixes. Create and test build 61+ from final HEAD.
3. Build a fresh Android `preview` APK for testers. For Play, create the app,
   enable Play App Signing, add its SHA-256 to Asset Links, and upload a
   production AAB to Internal testing.
4. `admin.anstoss.io` and `admin.anstoss.app` do not resolve. Deploy the admin
   service and run authenticated production smoke tests.
5. App Store Connect and Play Console privacy/content/access metadata remain an
   external manual verification step.

## Required production acceptance matrix

- New adult, under-16 player, guardian, coach, club owner/admin, and platform
  admin authentication/onboarding.
- Create/join club and team; roster invitation, redemption, consent, trial,
  loan, recall, expiry, and removal.
- Events, RSVP, lineup/readiness, attendance, streaks, MOTM, duties, injury,
  reminders, and notification preferences.
- Channel/DM text, image, voice note, report/block, offline/reconnect, and
  immediate access revocation.
- Contributions: mandate/payment creation, provider success/failure, history,
  and webhook idempotency.
- Profile, avatar/badge/sponsor media, verification state, data export, account
  deletion, and legal/support links.
- Admin login, health, clubs/users/subscriptions, audit log, feature flags,
  release settings, and moderation. Broadcast remains disabled for launch.

## Go criteria

Public launch becomes GO only after all blockers above are closed, fresh iOS
and Android binaries pass the acceptance matrix, production canaries remain
healthy, and the independent adversarial audit has no open high-severity item.
