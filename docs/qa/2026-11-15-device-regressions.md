# Device regression work — 15 November 2026

Status: stability/support test candidate, not public-release approval. Local
verification is recorded below; remote CI, deployments and distribution builds
must be checked separately against the committed revision.

## Confirmed product decisions

- No new translation hosting or cost. Automatic chat translation is unavailable.
  API translation requires explicit `CHAT_TRANSLATION_ENABLED=true` as well as a
  provider URL; the default is off. An obsolete URL alone cannot send chat content
  to a provider. No replacement provider has been provisioned.
- App-language selection remains available. Six app locales explain that chat
  messages remain in their original language. Translation is not a paid benefit.
- Proposed package catalogue, using the approved €12.99 single-team base:
  1 team €12.99/month or €129.90/year; 3 teams €24.99/€249.90;
  6 teams €39.99/€399.90; unlimited €49.99/€499.90.
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
- [ ] **Subscription lifecycle and Stripe test-mode verification.** Check all
  four monthly/yearly package mappings, signed/idempotent/out-of-order webhooks,
  first payment/SCA/SEPA processing, renewals, failed-payment grace, cancellation
  at period end, expiry, downgrade and refresh after app resume. Free and paid
  limits must be enforced on the server, not merely hidden in the UI. Never
  delete club data on downgrade. Add clear renewal/expiry dates and deduplicated
  reminders to billing admins; distinguish automatic renewal from access ending.
  Validate store checkout policy separately from web Stripe checkout. No live
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
