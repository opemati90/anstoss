# Anstoss launch QA report — 2026-08-21

## Verdict

**NO-GO for public launch today.** The reviewed source passes the automated
release gates, but it is not the version currently deployed or in TestFlight.
The admin console also has no production hostname. A fresh mobile binary,
production API/web deployment, admin deployment, and real-device acceptance
pass are still required.

## Automated evidence

- Repository lint, TypeScript, builds, and package test suites: passed.
- API: 66 suites, 562 tests passed.
- Mobile: 116 suites, 542 tests passed, 1 skipped.
- Shared: 7 suites, 117 tests passed.
- Admin: lint, typecheck, build, and local static browser smoke passed.
- Store readiness audit: passed.
- Feature coverage audit: passed.
- Mobile light/dark contrast audit: all checked pairs meet WCAG AA.
- Expo Doctor: 20/20 checks passed after Expo 57 dependency alignment.
- `npm ls --all --omit=optional`: clean.
- iOS CocoaPods resolved React Native 0.86.2, Reanimated 4.5.1, and Worklets
  0.10.1; the lockfile is committed with those native pods.

## Areas covered by regressions

- Authentication, OTP abuse limits, JWT/session refresh, age gate, parent
  handoff, account deletion, and tenant isolation.
- Clubs, teams, team hierarchy, roster slots, join requests/codes, invitations,
  parental consent, guardian access, player trials, and dated player loans.
- Events, RSVP, lineup/readiness, attendance/streaks, MOTM, duties, injuries,
  team feeds, reminders, and notification audiences.
- Team chat, direct chat, reporting/blocking, socket authentication, socket
  rate limits, CORS, and access revocation across chat/events/live namespaces.
- Contribution mandate/payment verification and webhook-derived payment state.
- Media upload namespaces, ownership, content type/size checks, avatars, club
  badges, sponsor logos, and chat attachments.
- Platform admin authentication, inventory, audit records, feature flags,
  release settings, moderation, and disabled-by-default broadcasts.
- iOS store configuration, privacy declarations, SDK 57 OTA runtime isolation,
  Android permissions, signing configuration, and App Links source files.

## Security changes in this release candidate

- Production rate limiting fails closed when its Redis backend is unavailable.
- Join/invite/consent secrets are longer, rate limited, recipient-bound, and
  tenant-scoped; unverified client phone claims no longer grant membership.
- Contribution state is derived from verified provider evidence rather than
  client assertions.
- Asset URLs must belong to the correct uploaded namespace and pass remote
  metadata validation before persistence.
- Removed/rejected/expired users are ejected from every realtime namespace.
- Loan expiry and manual recall dynamically recompute linked guardian access,
  including multiple children and permanent-vs-dated entitlements.

## Accepted dependency risk

`npm audit --omit=dev` reports eight high-severity advisories in the Metro
`image-size` build-tool chain. The only automated remediation downgrades Expo
57 to Expo 53 and is not safe. This package is used during bundling rather than
as a production API request parser. Track the Expo/Metro upstream fix; do not
run `npm audit fix --force` on this release line.

## External/manual blockers

1. Push the reviewed commits and verify CI plus the production API/web deploy.
2. Verify live `https://anstoss.io/.well-known/assetlinks.json` returns JSON,
   not marketing HTML, and add the Google Play App Signing SHA-256 fingerprint.
3. Build iOS 61+ and a fresh Android tester APK from final HEAD. Build 60 is
   obsolete and must not be submitted.
4. Complete a real-device TestFlight/Android acceptance pass using player,
   parent, coach, club-admin, and platform-admin accounts.
5. Deploy `apps/admin`, configure Basic Auth and API upstream, attach DNS, and
   test with a real `PLATFORM_ADMIN` account. Local static smoke is insufficient.
6. Complete App Store Connect privacy, age rating, screenshots, reviewer notes,
   reviewer account/demo club, and Google Play Data Safety/App Access records.
7. Configure Android FCM V1 credentials before expecting production push on
   Android. A Play service account is also needed for automated EAS submission.
