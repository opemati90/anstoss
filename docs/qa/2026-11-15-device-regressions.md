# Device regression work — 15 November 2026

Status: stability/support test candidate, not public-release approval. Local
verification is recorded below; remote CI, deployments and distribution builds
must be checked separately against the committed revision.

## 16 November — Firebase social-login configuration (not implemented login)

- Confirmed Firebase project `anstoss-b268f`, project number `387307271714`,
  under the Stratum Dynamics account. No Renuir app or shared billing/signing
  setting was changed. Firebase remains on Spark; Railway hosting is unchanged.
- Read Anstoss's existing **Play app signing** certificate (not its upload key)
  for `com.renuirug.anstoss` and added the missing SHA-1 to Firebase:
  `A4:25:ED:6B:F4:23:6C:9A:B8:F3:70:E6:F8:E4:65:21:E1:57:C7:6D`.
  Verified the saved row. No signing key was generated, replaced or reset.
- Downloaded Android configuration now contains the Play-certificate Android
  OAuth client and web OAuth client. Updated both mobile config copies; verified
  equal contents and unchanged project/app identity and API key.
- Registered the previously missing iOS app with the same verified bundle ID,
  nickname `Anstoss iOS`. Downloaded `apps/mobile/GoogleService-Info.plist`,
  verified project/bundle identity, client ID and reversed client ID; plist lint
  passed. Native SDK/config-plugin integration remains pending.
- Google provider is enabled. Apple provider setup and both app/backend login
  implementations remain unfinished: existing buttons still call the placeholder.
  No end-to-end social-login pass is claimed. Local/debug or directly distributed
  Android signing certificates still need registration before those login tests.
- Public name is `Anstoss`; support email is still the existing Gmail address.
  The dropdown offers only that address, not the requested `support@anstoss.io`.
  Did not grant project permissions or change the email to another substitute.
  Making the branded address eligible remains required before launch.
- No EAS build, OTA, store upload or submission was performed.

## 16 November — current local verification and release hold

- User permits local simulator/emulator builds only for now. No EAS build,
  OTA, store upload, build selection or submission is authorized by this pass.
  Renuir and shared account settings remain out of scope.
- API suite: **157 suites / 1,565 tests passed; 5 suites / 31 tests skipped**.
  The final run used local-network permission; earlier transport failures were
  rerun, not silently counted as passes.
- Mobile suite: **154 suites / 1,163 tests passed; 1 test skipped**. A subsequent
  draft-hydration regression brought the focused ChatInput suite to 7 passing
  tests. Shared suite: 12 suites / 193 tests passed. Admin and website static
  smoke checks passed; these are not native end-to-end or browser sign-off.
- Fixed draft persistence on rapid navigation: pending edits flush on unmount,
  clearing/sending removes storage immediately, and a late storage read cannot
  restore a draft after the user edits/clears the composer.
- The paid-feature gate now links to the canonical subscription screen instead
  of promising all launch features free and only dismissing itself. Existing
  localized billing copy is reused; opening plans does not grant paid access.
- Direct-account access and push eligibility now consistently enforce the
  approved 16+ launch audience. Historical guardian consent does not unlock a
  direct under-16 account. Guardian-managed child records remain separate.
  Updated the blocked-account explanation in all six app locales.
- Store telemetry redacts sensitive field names case-insensitively, including
  nested purchase tokens and signed transaction/renewal payloads.
- Native sign-off remains **pending**. The dedicated iPhone's software keyboard
  did not appear before typing, so that run is not a keyboard regression pass.
  Android's unresponsive emulator was restarted without wiping data; its blank
  developer-client startup is under investigation. Neither establishes the
  physical iOS 27.2 issue is fixed.
- The updated local iOS Release simulator compile succeeded with
  `SENTRY_DISABLE_AUTO_UPLOAD=true` (no signing or distribution build). Installed
  on the dedicated QA simulator. Restarting its existing WebDriverAgent runner
  failed `UITestingUITests testRunner`; the device was subsequently Shutdown,
  so authenticated keyboard checks could not be counted. The Android emulator
  recovered to the developer launcher, but selecting local Metro is still not
  a passing app-startup/keyboard check. No app data was wiped.
- Real store purchase/restore/lifecycle verification still needs the pending
  Apple IAP key and Anstoss-scoped Google Play billing credentials. Physical
  background/killed-app push, all persona journeys, and final visual checks
  remain release gates. No production readiness claim is made.

## 16 November — typing/header render-loop regression

- The new typing-presence hook returned a fresh names array on each render.
  `ChatScreen` reported that array to its parent's header state in an effect,
  causing a child/parent render feedback loop. The reported Expo `setOptions`
  stack was where this surfaced, not a reason to modify React Native internals.
- Memoized the derived names array and made redundant presence clearing a no-op.
  Added identity-stability coverage and a bounded parent/child feedback-loop test.
  Presence remains transient, scoped to the conversation, and contains no drafts.
- **22 typing/hook tests and 35 chat grouping/input/scroll tests passed**;
  mobile typecheck, targeted ESLint and diff whitespace checks passed.
- Local Android debug compile succeeded without EAS credits. On the
  `Anstoss_API_36_1` emulator, real local-API group and direct conversations opened
  without the reported crash. Both showed the three-dot typing bubble and header
  status. Group sender names and initials were visible; the group typing status
  disappeared after the synthetic sender stopped. Keyboard-open group history
  and an unsent draft remained visible. The draft was removed without sending.
- Visual artifacts: `/tmp/anstoss-loaded.png` (group typing/sender identity),
  `/tmp/anstoss-dm-typing.png` (direct typing),
  `/tmp/anstoss-keyboard-settled.png` (group keyboard open), and
  `/tmp/anstoss-draft-fixed.png` (unsent draft). The keyboard screenshot still
  shows the newest bubble's lower edge partially clipped: do not count this as
  complete keyboard/layout sign-off. Physical iOS 27.2 and new typing UI on iOS
  remain unverified. No OTA, store build or submission was performed.
- QA environment recovery: rebooted a frozen emulator without wiping data and
  restarted only Anstoss Metro on port 8082 with IPv4 localhost binding. Used
  normal inbox navigation after development-client deep links interfered with
  startup; blank startup captures are not passing evidence.

## Confirmed product decisions

- No new translation hosting or cost. Automatic chat translation is unavailable.
  API translation requires explicit `CHAT_TRANSLATION_ENABLED=true` as well as a
  provider URL; the default is off. An obsolete URL alone cannot send chat content
  to a provider. No replacement provider has been provisioned.
- App-language selection remains available. Six app locales explain that chat
  messages remain in their original language. Translation is not a paid benefit.
- Approved three-package catalogue (supersedes the earlier four-tier proposal):
  Team (1 team) €12.99/month or €129/year; Club (3 teams) €29.99/€299;
  Unlimited €39.99/€399. The six-team package is retired, not offered for sale.
  New trials use the one-team/30-player definition. Historical grants retain
  their original definitions. Stripe prices have not been created or changed.

## Added release tasks — explicitly requested 15 November

- [ ] **Studio social publishing and AI credits.** User reconfirmed the design's
  Instagram/Facebook account connections, direct publishing, AI template creation,
  included credits and paid top-ups. Current Studio API exposes context and brand
  kit only; `brand-kit.tsx` explicitly omits connections/credits. These are missing
  integrations, not completed features. Implement scoped Meta OAuth, encrypted
  server-side tokens, disconnect/revocation, authorized club account selection,
  publish preview/confirmation, retry-safe jobs and real provider error states.
  Validate Meta permissions/review with a test Page/professional Instagram account.
  AI needs a selected provider and approved spending cap. Credits need a server
  ledger, idempotent payment fulfilment, atomic reservation/refund on generation
  failure, monthly allowance rules and store-payment-policy review before sale.
  Never sell credits or show connected/published states while providers are absent.
  User has no Meta app yet. User approved a stability/support test build with
  Meta publishing and paid AI generation disabled; no paid provider is enabled.
  The board's €10.99 subscription copy is superseded by the approved €12.99 base;
  credit-pack prices and margins still need validation against actual model costs.
- [ ] **On-device chat translation** (after chat stability). Investigate Google
  ML Kit with no translation hosting/usage cost. Validate the Expo wrapper on
  this SDK: it uses Apple Translation on iOS and ML Kit on Android, not ML Kit
  everywhere. If parity is insufficient, evaluate a small native Expo module.
  Preserve original messages; detect language locally; target the reader's
  chosen language; cache per-account/message revision/target language locally;
  invalidate on edit/delete/logout/account deletion. Include Show original,
  Always translate and Off; opt-in model downloads over Wi-Fi by default,
  progress/retry/remove-model controls, required attribution and privacy copy.
  Cover en/de/fr/es/pt/it/pl/nl/sv/da/no/fi/cs/ro/el, unsupported language,
  short/ambiguous text, failed downloads, offline use, memory use and model
  availability on both platforms. App UI locale coverage is a separate task.
  Translation must never hide or block original chat messages. Do not claim
  this is shipped; server translation remains disabled meanwhile.
  Sources: https://developers.google.com/ml-kit/language/translation and
  https://github.com/bluesky-social/expo-translate-text .
- [ ] **Native store subscription lifecycle verification.** Check the six
  Apple/Google products for the three approved monthly/yearly packages,
  verified purchases/restores, signed/idempotent/out-of-order notifications,
  renewals, failed-payment grace, cancellation
  at period end, expiry, downgrade and refresh after app resume. Free and paid
  limits must be enforced on the server, not merely hidden in the UI. Never
  delete club data on downgrade. Add clear renewal/expiry dates and deduplicated
  reminders to billing admins; distinguish automatic renewal from access ending.
  Native Apple/Google checkout is the approved mobile purchase path; merchant
  account setup or draft products alone is not a completed integration. No live
  charges or secret values in chat. Current audit found no subscription-expiry
  reminder worker. Corrected provider status locally: software subscriptions now
  report Stripe without requiring a separate club Connect account (four regression
  tests). Review the seven-day grace period against the resolver's expiry filter.
- [x] **Contact support → platform-admin inbox implementation.** User-requested in-app report
  form and ticket history, platform-admin inbox with reply/resolution, replies
  visible to the requester. Optional screenshots require private upload/access
  controls and deletion handling. Include non-sensitive app/build/OS metadata;
  never attach chats, credentials or other users' data automatically. Support
  must work for free agents and pending users as well as club members. Enforce
  requester ownership, platform-admin access, input limits/rate limits, audit
  logging and account erasure. Existing SUPPORT_NOTE admin actions are not a
  user-facing ticket system. Added personal ticket endpoints, in-app history and
  replies, platform-admin inbox, resolution/reopening, retry-safe UUIDs, ownership
  guards, rate/size limits, audit metadata and account-erasure cascade. No automatic
  chat attachment, screenshot upload or support-reply push delivery is claimed.
  Native-device verification remains a separate release check.

## Build 91 keyboard investigation

- User confirmed Anstoss 1.0.2 (91), iPhone 16, **iOS 27.2**. Installed simulator
  runtime is only **iOS 26.5**; Xcode 27.2 alone does not provide an iOS 27.2
  simulator runtime. This explains a coverage gap, not proof of root cause.
- EAS read-only metadata: build `0cd50575-edc1-4aae-839b-2703e4802d05`, commit
  `3bcc96a060ab4916e289844b343526715749f77c`. TestFlight channel's latest OTA
  metadata points at `31ad6adb` (published from a dirty worktree); it predates
  this binary. Actual device update ID is not yet collected.
- Upstream issue https://github.com/react/react-native/issues/59731 describes
  physical iOS 27 Fabric inverted lists failing to paint while content size and
  scrolling remain valid. Removing inversion restores painting in that report;
  removing clipping/MVCP alone does not. Its RN version is 0.88, ours is 0.86.3:
  this is strong corroborating evidence, not an exact local reproduction.
- Local fix removes `inverted` and row reversal from shared DM/group ChatScreen.
  Chronological anchoring now handles initial unread, latest alignment on viewport
  resize before typing, prepended history and preserving the older-message reader.
  Older pages load from the start, not the end. Virtualization remains enabled;
  no data-clearing/remount workaround or all-history ScrollView was introduced.
- 45 focused chat tests passed; mobile typecheck and focused ESLint passed.
  Signed local Release build succeeded. Dark native Maestro passes cover a
  five-message two-sided DM, draft visibility, 40-message DM across the 30-message
  API pagination boundary, jump-to-latest and two-sender group with keyboard open.
  Group screenshot inspected: incoming sender name/avatar and draft both visible.
- Full mobile Jest run: **147 suites passed, 1,115 tests passed, one skipped**.
  Unit tests do not validate physical iOS compositing. Two light-mode native
  attempts stopped at software-keyboard visibility: screenshots show a focused
  text input and visible messages but no keyboard. Hardware-keyboard mode was
  off; the dedicated simulator was restarted before another attempt. That third
  attempt also failed the `id: space` keyboard-visibility assertion, before any
  typing. Its artifacts are in
  `/tmp/anstoss-mvp-sim-50z9uw/maestro/connected-chat-keyboard-history/2026-11-15_184126`.
  Do not count these runs as passes or as reproduction of the reported blank
  history. The final extended flow's older-reader keyboard reopen and native
  group-send steps therefore remain unverified.
- 53 billing tests passed (49 catalogue/lifecycle tests and four provider-status
  tests); API typecheck and focused billing ESLint passed. Corrected an old
  publication-test fixture to the new 1-team annual price; historical definitions
  are still tested separately and remain unchanged.
- **Physical iOS 27.2 confirmation remains required.** Do not mark the user's
  report closed or claim that the iOS 26.5 simulator reproduced the painting bug.

## Support screenshot investigation, 19:15

- The native Release app had the new form, but the long-running local QA API was
  still the older implementation. Authenticated `GET /me/support` returned **404**.
  This is a client/backend version mismatch, not invalid form input.
- Applied all three new migrations to the isolated local QA database. Restarted
  the updated API using a validated resume mode, preserving the existing users,
  club, team, messages and journey IDs. No production data was reset.
- The resumed server rotates local signing keys, so simulator users must sign in
  again. Verified the existing player's active team membership via authenticated
  HTTP and verified `GET /me/support` now returns **200**.
- Added a UI regression to avoid showing “No requests yet” when loading failed.
- The latest Maestro screenshot captured PlantCircle, not the selected Anstoss
  simulator: another active driver on port 7001 was reused. This run is invalid
  evidence for Anstoss. Do not count it as a pass or app regression. Other running
  simulators were left untouched. Isolated Appium on 4727/WDA 8117 now controls
  only the dedicated Anstoss simulator.
- Native support submission now passed: signed in through email OTP, opened
  support without the error, submitted `Native support QA 15 November`, saw the
  conversation and verified persistence through authenticated HTTP. Screenshot:
  `/tmp/anstoss-support-native-sent.png`. The admin reply cycle passed in the
  separate compiled-API HTTP integration test; it was not clicked in the native
  simulator or admin browser during this check.
- Isolated native dark- and light-mode short/long/group keyboard assertions passed, including
  keyboard visible before typing, history visible with the keyboard, visible draft,
  group sender identity and membership restoration after each app relaunch.
  Reproducible fallback: `apps/api/scripts/mvp-appium-chat.mjs` with an existing
  local-only Appium session. Both mode runs passed all three scenarios. These
  checks use iOS 26.5 and do not close the physical iOS 27.2 report.

## Supplied store assets

- Original archive: `/Users/yemi/Downloads/anstoss-store-assets.zip`, intact ZIP.
  Contains 42 App Store screenshots, 42 Google Play screenshots, seven feature
  graphics, two icons and `store-listing.md`; de/en/tr/es/fr/pt/ar language sets.
- Sample dimensions verified: iOS 1320×2868, Android 1080×1920, feature graphic
  1024×500, RGB PNG. Original files have not been altered or uploaded.
- Do not publish the supplied listing unchanged. It promises automatic chat
  translation (disabled) and family/under-16 features (`FAMILY_FEATURE_ENABLED`
  is false). Screenshot 05 is a parent flow and must be held for a later release.
- App locale resources currently support de/en/fr/it/pt/tr, not the seven locales
  claimed in the listing. A localized store listing is not proof of app-language
  support; correct the language claim and provide Italian assets if desired.
- Studio screenshot 03 shows an AI credit balance although paid AI generation and
  credit purchases are deferred. Replace/recapture before publication. Distinguish
  ordinary graphic export/share from direct Meta account publishing (not enabled).
- Subscription copy must use the new 1/3/6/unlimited team packages rather than
  imply every paid Club plan has unlimited teams. Payment/dues claims need the
  outstanding Stripe test-mode verification. Avoid blanket compliance promises.

## Verification in this work session

- Full API suite: **153 suites passed, four skipped; 1,508 tests passed, 30 skipped**.
- Full mobile suite: **147 suites passed; 1,115 tests passed, one skipped**.
- Shared suite: **nine suites, 166 tests passed**. Full workspace lint and
  typecheck passed. API compiled and signed iOS simulator Release built.
- Subsequent focused support tests cover submit, retry, refocus and account-switch
  privacy. Real PostgreSQL test passed concurrent create/reply idempotency,
  ownership, status lifecycle and erasure cascade; this test is now enabled in CI.
- Compiled full-API HTTP smoke passed app/admin authentication, validation,
  ownership isolation, report submission, admin inbox and reply read-back.
- Support creation uses the same per-user advisory transaction lock as account
  deletion. Admin logout clears private ticket state and rejects stale responses.
- Admin static smoke and website seven-locale/package smoke passed.

- 41 focused mobile tests passed: chat connection state, recorder lifecycle,
  event reminder toggle, and subscription display (including all four monthly
  and annual package prices).
- 32 API plan/catalogue tests passed, including historical entitlement limits.
- 16 API environment/translation tests passed, including zero provider fetches
  for disabled translation even when a URL remains configured.
- Website smoke passed for seven locales, annual savings, shared-price parity,
  subscription claims, signup and local links.
- Mobile and API typechecks passed; mobile was rerun after package UI changes.
- Local iPhone 16 simulator (iOS 26.5) Release build succeeded against only the
  isolated localhost:3167 QA API. Sentry upload was disabled only for this local
  diagnostic build. Xcode simulator signing is necessary for Keychain access;
  the unsigned diagnostic build did not restore login. With Xcode signing the
  QA player session restored after stop/launch.
- Dark-mode Release Maestro keyboard flow passed: short incoming DM visible
  before keyboard, immediately after opening it without typing, while entering
  a draft, and after a swipe. Screenshots visually inspected. Light-mode history
  and draft assertions also passed; that first run failed only on Maestro's
  unsupported `hideKeyboard` step, subsequently replaced by a swipe.

## Release blockers / incomplete verification

- **The reported physical-device blank-history issue is not yet verified fixed
  on iOS 27.2.** A chronological-list fix is now implemented (see investigation
  above), with native iOS 26.5 regression coverage. Still verify the exact runtime,
  device accessibility settings, and Android. No new distribution build submitted.
- Voice recorder fixes have unit coverage, not yet native record/upload/playback
  verification. Also test permission denial and interruptions by calls.
- Chat suspension/removal needs live authorization checks and
  native moderation testing. Review reaction/edit/poll mutation paths for the
  intended read-only suspension semantics; do not claim moderation complete.
- Channel moderation, package and support migrations are applied to the isolated
  QA database and the QA API is updated. Production deployment is still pending.
- Package UI still requires visual checks on mobile, website and admin. Review
  remaining old pricing copy, admin fixtures and full-suite compatibility.
- Recheck onboarding, DOB format, required markers, relaunch membership,
  notification delivery, coach-only formation actions, sender identity and
  reminder-toggle appearance before any release claim.
- Browser E2E, remaining native role journeys and both distribution builds remain
  outstanding. No production reset is authorized by
  this work session; earlier reset approval must not be replayed.

## Local diagnostic references

- Repository: `anstoss-redesign-review-20261113`, branch
  `codex/redesign-integration-20261113`, starting HEAD `3bcc96a0`.
- QA simulator: `D0946EB8-5569-40EF-A2DC-E1B68B19DAD9`.
- QA state: `/tmp/anstoss-mvp-sim-50z9uw/state.json`; journal contains credentials,
  so do not print or commit it.
- Release derived data: `/tmp/anstoss-chat-release-20261115`.
- Last keyboard artifacts: `/private/tmp/anstoss-chat-before-keyboard.png`,
  `/private/tmp/anstoss-chat-keyboard-open.png`,
  `/private/tmp/anstoss-chat-keyboard-draft.png` (dark mode).
- Maestro flows: `connected-release-login.yaml`, `connected-chat-keyboard.yaml`.
  The login flow expects a signed-out app; it correctly fails on an already
  signed-in home screen and is not itself a cold-start persistence test.

## 2026-11-16 personal event reminder audit (local, not deployed)

The physical screenshot's enabled switch proves an opt-in appearance, not delivery.
An independent adversarial agent reviewed the worker and re-reviewed fixture
rescheduling and timezone fixes. No live user notification was sent in these tests.

Implemented:

- Retry zero-ticket push failures instead of marking them sent; prevent overlapping
  worker instances from concurrently claiming the same preference with row locks.
- Skip cancelled, archived, past events and deleted users; recheck current team/event
  access before sending. Include club/team routing context in notification data.
- Reschedule existing opt-ins atomically with event date changes, including series,
  public fixture refresh and licensed-feed import. Do not recreate opt-ins on RSVP.
- Permit turning reminders off within the last hour; reject new late opt-ins.
  Disable rapid concurrent toggle requests, restore state and show a save error on
  failure, prevent stale fetch rollback, and warn when device registration is denied.
- Save device IANA timezone with notification preferences and share DST-aware quiet
  hours evaluation between per-user and team push paths. Existing rows without a
  timezone retain legacy interpretation until their owner saves settings; no guessed
  geographic backfill. Update stored club-wide preferences as well as bulk team rows.
- Handle nullable club-wide preferences with a serialized transaction instead of an
  invalid Prisma compound-key upsert; update historical duplicates consistently.

Validation:

- API and mobile TypeScript checks passed. Ten targeted backend suites and two
  targeted mobile suites passed (17 mobile cases). These are not full-app E2E tests.
- Two real PostgreSQL integration tests passed on the isolated local test database:
  failed provider acceptance remains retryable; simultaneous independent workers
  send once; simultaneous nullable preference saves create one row; legacy duplicate
  quiet-hour rows are updated together. Push and membership checks are mocked here.
- Reviewer independently passed worker (13), fixture-sync (10), and timezone (8)
  tests. Added mobile regression for updating a stored club-wide row's timezone.
- Final adversarial review of null-scope transactions found no new blocker. Existing
  bulk-setting saves can partially persist when one team request fails while the UI
  rolls back; a settled-request refetch or atomic bulk endpoint remains follow-up.
- Android local debug compile succeeded and APK installation on QA emulator succeeded.
  iOS arm64 debug compilation failed at React Native C++ symbol linking; this is not
  an iOS test pass. No EAS build, OTA, store upload, production deployment or Renuir change.
- Native reminder UI inspection was not completed: the Android screen capture showed
  a Pixel Launcher not-responding dialog, not an Anstoss reminder screen. Diagnostic
  capture: `/tmp/anstoss-reminder-android-20261116.png`. Do not count it as a UI pass.

Release ordering and remaining proof:

1. Apply `20261116123000_notification_quiet_timezone` BEFORE deploying the API that
   selects the new column. It has only been applied to the local test DB so far.
   The nullable addition remains compatible with the old API.
2. Expo ticket acceptance is not delivery. Later receipt failures are currently logged
   by in-memory polling, not linked to a durable reminder retry. A process restart can
   lose polling. A crash after provider acceptance but before DB commit can duplicate
   delivery despite concurrent-worker locking. Durable receipt/outbox work remains.
3. Verify on actual iOS and Android devices while backgrounded/locked, including
   permission denial, quiet hours, muted events, rescheduling, cancellation, reconnect,
   and tap routing. A simulator-generated notification is not APNs/FCM proof.
4. Confirm the deployed worker is enabled and all push credentials are valid before
   claiming the screenshot's reminder works in production. No such live claim yet.
