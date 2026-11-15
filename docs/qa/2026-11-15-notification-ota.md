# Notification OTA verification — 15 November 2026

## Scope and compatibility

Notification registration/recovery, foreground inbox and trial refresh, tap
destinations, and API push payload validation. No dependency or native change is
included in this OTA patch. Existing runtime: `57.0.1`; targets: iOS `testflight`
(builds 91/92) and Android `preview` (builds 24/25).

## Root causes addressed

- Registration required a membership, excluding completed free-agent profiles.
- Inbox/trial screens could remain stale while already open; they now refresh on
  notification/resume and use a 15-second foreground-only fallback.
- Registration recovery depended on reopening the app; active sessions now retry
  failed acquisition, and backend registration has bounded requests.
- Native cached notification responses could navigate twice. Responses are
  deduplicated and cleared, including on logout.
- Trial taps used a nonexistent route; club-scoped taps now request the relevant
  club context before opening their destination.
- The bell skipped its initial request when React Native had not yet resolved
  AppState. Unknown cold-start state no longer suppresses the initial count.
- Malformed push tokens passed HTTP validation. Registration now checks Expo
  token syntax; token reassignment/logout remains ownership-scoped.
- Android sends now explicitly select the existing `default` notification
  channel. Provider ticket/receipt errors log error codes without message/token
  contents. Deferred receipt checking waits 15 minutes.

## Executed checks

- Mobile Jest: 151 suites passed; 1,143 tests passed, one existing skipped test.
- Shared Jest: baseline 166 tests passed; dedicated token-format regression
  cases added separately.
- API targeted push/age-gate/inbox/chat-inbox: 4 suites, 40 tests passed.
- API and mobile lint/typecheck passed after formatting the new test.
- `apps/api/scripts/push-http-smoke.cjs`: passed against a disposable local test
  database and real HTTP auth/controllers. Covers PLAYER, COACH, FREE_AGENT and
  CLUB_ADMIN profiles, inbox ownership, mark-read, token reassignment and logout.
  Expo transport is captured in this test, not sent to devices. These profiles
  are notification-specific fixtures, not full role-journey UI tests.
- Existing Android preview APK 25 installed on a separate API 36.1 emulator.
  Welcome screen, branding, language selector and onboarding/sign-in entry
  points rendered. Further UI automation timed out under emulator resource
  pressure; authenticated role flows and keyboard/performance remain unverified
  on this release APK. The older development emulator was preserved.

## Remaining release gates

- Physical iOS foreground/background/locked-screen delivery and notification
  tap routing require two-device verification. Simulator and HTTP tests are not
  proof of APNs delivery.
- APK 25 has no Firebase app ID/sender ID resources. Its background FCM push
  cannot be repaired by OTA. Firebase project `anstoss-b268f` matches package
  `com.renuirug.anstoss`; its FCM v1 credential has now been uploaded to Expo.
  Previously, Expo reported none assigned and no stored Google service-account
  keys. Signing credentials were not changed. Native client configuration and
  one explicitly approved future Android build are still required.
- Verify FCM API/credential permissions and actual device delivery after that
  Android build. A successful credential upload is not a delivery test.
- No store-ready or full end-to-end pass is claimed by this report. No new EAS
  native build was started for these checks.

## Reproduction

Run shared/API builds before the HTTP smoke. It accepts only a loopback database
whose name ends in `_test`, rejects external provider configuration, creates
uniquely identified fixtures and cleans up only those fixtures.

```sh
env -i PATH="$PATH" \
  PUSH_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:5432/anstoss_mvp_sim_test \
  node apps/api/scripts/push-http-smoke.cjs
```

Test OTA on each installed compatible app: open online, allow the update to
download, then fully close/reopen. No forced reload should interrupt a draft.
Check join request/approval, chat and trial notifications with the receiver
foregrounded, backgrounded and locked; tap each notification, check the correct
account/club/destination, then repeat after logout/login and token reassignment.
