# Redesign integration — 2026-11-13

Base: `f0886f74` on `redesign/anstoss-2026-11`.
Working branch: `codex/redesign-integration-20261113`.

The redesign remains the visual source of truth. This branch does not replace
Claude's visual work. No production or store release has been made from it.

## Confirmed MVP rule: live-match provenance

Confirmed by the product owner on 2026-11-13:

- Show a live score, clock or timeline only from a verified working external
  feed or authorised coach-recorded match updates.
- Without either source, show the scheduled match or confirmed result. Do not
  infer a live score or simulate a running clock from the scheduled kick-off.
- Simulator fixtures are demo data, not evidence that a live integration works.
- Do not promise automatic FUSSBALL.DE imports or live coverage in the mobile
  app, website, onboarding or store copy while ingestion is disabled.
- Validate the source and freshness in connected-role tests before advertising
  live coverage. Keep coach-recorded updates distinct from external feed data.

## Additional product requirements — 2026-11-14

These remain tracked while the ordered integration work continues. Audit existing
implementations before adding anything; do not duplicate working features.

- **Billing:** monthly and annual options. Annual must cost less than twelve
  monthly payments. Existing shared amounts are €10.99/month and €109.90/year:
  €21.98 saved (16.7%, equivalent to two months free). Keep website/app/checkout
  consistent and show annual total, monthly equivalent and savings. No live
  Stripe prices have been changed.
- **Group chat:** automatically translate into each reader's configured language;
  check existing translation/preferences behavior before changing the service.
- **Rewards/campaigns:** platform-funded acquisition campaigns, not club-funded
  badges. Examples: Man of the Match, winning streaks, Player of the Week (five
  wins → Amazon gift-card eligibility), Team of the Week, and team prizes such
  as a crate of beer. User confirmed platform funding. Separate campaign rules,
  verified participation/results, winner selection, eligibility and fulfilment.
  Gift-card value, budget cap, award thresholds (where unspecified), tie-breaks,
  anti-abuse rules, geography and fulfilment provider remain undefined. No
  automatic purchase, guaranteed prize claim or new spending is authorized by
  this feature outline. Alcohol rewards require adult-only eligibility.
- **Free agents:** premium access to the pool, profiles with images/details/video,
  and the free-agent-facing journey. Preserve privacy/access checks and review
  existing marketplace/media implementations before extending them.
- **Roster management:** removal and suspension; review existing permissions,
  membership lifecycle and suspension state rather than adding a duplicate flow.

These requests do not authorize reopening youth features, exposing unimplemented
paid features, or replacing the current core-flow acceptance gates.

Reuse audit (2026-11-14; implementation presence is not production verification):

- Group-chat history already enriches messages for the stored reader language
  (`ChatGateway.enrichMessagesWithTranslation`); `MessageBubble` displays the
  translation with an original-text toggle. Translation requires a configured
  LibreTranslate service. Check realtime delivery, locale changes, failures and
  provider availability before advertising automatic translation.
- MOTM voting/archive and weekly streak calculation already exist (`motm/`,
  `streaks/`). They do not implement funded reward campaigns or fulfilment.
  Streak attendance currently derives from RSVP YES, not actual attendance;
  never treat this as verified attendance or cash/prize eligibility. MOTM is
  imported-fixture based, which also needs reconciliation with disabled imports
  and coach-recorded matches. Weekly awards, ties, finalization and anti-abuse
  require explicit campaign rules, not automatic reuse of mutable vote totals.
- Free-agent owner profiles, profile reads/search, image/video media registration
  and deletion already exist in `marketplace/`. Listing currently checks staff
  and visibility, not a paid club entitlement. Premium recruitment access and
  the approved adult-launch boundary still need reconciliation and tests.
- Club membership removal already exists with OWNER/ADMIN authorization;
  roster management already supports coach-authorized suspension-until dates.
  Suspension is a roster state, not necessarily loss of login/chat access.
  Verify these journeys and their intended access effects instead of adding
  duplicate removal/suspension endpoints.

## Ordered acceptance gates

Integration rule (product owner, 2026-11-14): compare incoming Claude/Codex work
with this branch. Adopt only missing/new or demonstrably better changes; keep
verified fixes and avoid duplicate implementations. Do not blanket-merge WIP.

1. **Complete — reported preview defects and native simulator refresh**
   - Chat timestamp: replace estimated invisible spacer with a normal-flow footer;
     only uncaptioned photo/video metadata overlays media. Ten regression cases pass.
   - Blank language picker: change its native presentation from form sheet to card;
     all six choices and German → English → German verified in simulator.
   - Clipboard native dependency installed; local iOS build rebuilt and installed,
     without EAS credits. Copying the mock team's invitation writes its expected
     link to the simulator clipboard.
   - Invite sharing labels were absent in all six locales. Added a separate
     `invite.shareScreen` namespace without breaking the legacy `invite.share`
     button label; six locale regression cases pass.
   - Unsigned local build exposed Expo Notifications keychain errors. Rebuilt with
     simulator code signing enabled; regression passed without suppressing errors.
2. **Pending — design verification**
   - Mobile reference screens: German, small phones, light/dark and large text.
   - Website desktop/mobile references, navigation, links and seven languages.
     The updated website is explicitly in scope (owner reconfirmed 2026-11-14).
     Compare incoming web changes selectively; check German/English and all seven
     language options, Arabic RTL, mobile navigation, signup/store/legal/deletion
     links, and feature/pricing claims against the shipping API. Web package
     test/lint/typecheck scripts currently exit 0 without checking anything;
     they are not browser or localization evidence. Do not import the new
     monthly Studio-credit promise until that service works.
   - Calendar interaction implemented: horizontally scrollable dates, selected-day
     highlight/filter, clear-to-agenda action and stronger semantic row dividers.
     Date arithmetic uses local calendar days across DST and month boundaries.
     The same strip is now available to players, not only coaches; event creation
     remains staff-only. Role-parameterized tests cover both calendar experiences.
   - Filled 53 missing onboarding keys in each non-German locale, including the
     language preview body and CTA. Language-name subtitles are localized too.
     Locale parity and referenced-key checks now pass for all six mobile locales.
3. **Pending — backend integration**
   - RSVP auto-reminder implemented: persisted create/update/series flag, due-event
     worker, atomic shared cooldown, locale-aware event-mute-respecting notifications.
     Seven opt-in PostgreSQL integration tests pass, including concurrent workers,
     role/tenant rejection and player RSVP → coach aggregate. Outbound push is stubbed;
     this is local database/service evidence, not production device delivery.
   - Reconcile BACKEND_GAPS.md against the newer acting/plan implementations.
   - Carry forward the prior release's private-media, deletion and auth safeguards.
   - Implement missing contracts with tenant/role authorization and regression tests.
   - Preserve the approved adult-only launch scope; design placeholders do not
     authorize youth/health features or new production billing settings.
   - Live-data provenance: the simulator's fixture-1 score/timeline is seeded in
     `src/e2e/session.ts`, not a verified FUSSBALL.DE feed. Federation ingestion is
     disabled in the scraper service. The separate coach-recorded event-live API
     exists, but the imported-fixture detail screen reads `/fixtures/:id/timeline`.
     Reconcile these paths; never present demo or stale fixture data as a live feed.
4. **Pending — connected-role verification**
   - Player request → admin approval → player access.
   - Player RSVP → coach aggregate → reminder → squad → attendance.
   - Chat/media, permissions, reconnect/retry and deletion across accounts.
   - Mock simulator screenshots are not evidence of API synchronization.
5. **Pending — release**
   - Passing validation and release checks, then merge to develop.
   - Coordinated deployment and iOS/Android test builds; no paid builds before gates pass.

## Evidence

### Incoming Studio checkpoint — 2026-11-14

Reviewed `origin/redesign/anstoss-2026-11` at `5510d949` in an isolated snapshot;
no blanket merge. See [Studio review](STUDIO_REVIEW_20261114.md) for findings,
selective adoption decisions and the implementation order. The UI/rendering
work is substantial, but absent server routes, false export-success states and
unscoped async match/consent state prevent a production-complete sign-off.
Incoming author test totals have not been independently rerun.

### Studio foundation implementation — 2026-11-14

- Selectively added incoming Studio schemas, pure graphic rules, palette,
  suggestion rules and their tests. No new Studio routes, entry points, paid
  plan flags or provider integrations have been enabled.
- Replaced the incoming match hook with atomic user/session/club/team/event
  snapshots, immediate invalidation, request-generation guards and response
  identity checks. Missing/malformed context fails closed; the unscoped
  club-wide feed fallback is deliberately not carried over. Result writes
  require current access and an exact confirmed server score.
- Studio access follows the brief's explicit offices; being a coach alone
  does not add Studio permission. Server authorization is still required.
- Added an export handoff primitive that distinguishes cancellation, stale
  scope and failure from a share-sheet handoff. It never claims publication,
  or silently substitutes a caption; it attempts temporary-image cleanup on
  every outcome. Wiring it into the incoming editor remains pending.
- 70 focused tests pass; mobile typecheck, shared build and scoped ESLint pass.
  Full mobile regression passed 132 suites / 987 tests (one pre-existing skip)
  before the final old-refresh guard/test; the 70-test focused rerun then passed.
  Shared regression: all 157 tests pass.
  This is tested foundation code, not a completed Studio screen/API integration.
- Backend follow-up below supplies scoped context and brand-kit persistence.
  Next: wire the editor's export/persistence errors and verify the screens.

### Studio backend checkpoint — 2026-11-14

- Added authenticated, age-gated, rate-limited context and brand-kit endpoints.
  Server checks membership, office, active team access and paid entitlement;
  coach status alone does not grant access. Club identity edits require a
  club-wide office. Sponsor references must belong to the same club.
- Added tenant-scoped StudioBrandKit storage, MEDIA_MANAGER office and an
  additive migration. Partial edits preserve independent concurrent changes;
  removed sponsors are not resurrected from stored references.
- No publication-consent dataset exists yet. Context deliberately returns no
  identity grants; app-access/parental approval is not reused as photo/name
  publication consent. Social accounts remain disconnected and no AI/credit,
  rendering, archive or publishing provider is represented as working.
- Migration applied only to the isolated local PostgreSQL test database.
  All seven real-database tests pass: persistence across service instances,
  concurrent edits, team isolation, foreign-club/sponsor rejection, revoked or
  expired/future access, expired plan and tenant-context enforcement. An initial
  fixture's lazy Prisma query lost its async context; corrected and rerun.
- The preceding focused unit/controller/tenant run passed 44 tests. These checks
  do not establish production end-to-end sync or complete Studio UI integration.
- Added a separate scope-safe mobile brand-kit hook. It validates responses and
  acknowledgements, rejects optimistic false success, blocks duplicate writes,
  and ignores stale requests across user/token/club/team/permission changes.
  A refresh preserves the last display snapshot but disables export readiness;
  failed authorization/read/write clears usable settings. No cross-session
  module cache. Server checks remain authoritative for paid access and offices.
- Added MEDIA_MANAGER labels in all six mobile locales and a role-key coverage
  test. The focused brand-kit/match hooks pass 48 tests. Final regression:
  API **136 suites / 1,408 tests** (14 opt-in DB cases skipped in this run),
  mobile **133 suites / 1,017 tests** (one pre-existing skip), shared **157 tests**.
  The seven Studio DB cases passed separately against explicit localhost test
  storage. API build, mobile typecheck and scoped lint pass. No production
  migration, deployment, paid feature enablement or build-credit use.

### Selective upstream review: `f0886f74` → `8279b7b4`

No blanket merge. Incoming branch contains 78 changed files; review is ongoing.

- **Adopted:** hero background/foreground semantic-token corrections, SVG web
  accessibility warning fix, channel read-count label using the existing API
  receipt count (all six languages), and RSVP actor attribution in the correct
  notification path. These extend rather than replace verified fixes.
- **Adopted:** invitation tests explicitly open the email wizard and exercise
  hardware Back only on Android, matching the existing navigation contract.
- **Kept ours:** normal-flow chat timestamp footer, interactive date strip and
  selected date, stronger dividers, full language preview/localization fixes,
  working `invite.shareScreen` namespace and home sponsor removal. Incoming
  `invite.board` duplicates that namespace; it is not added.
- **Deferred offline queue:** persisted rows are not bound to the signed-in
  account; flush can overwrite replies added during an in-flight request and
  does not await initial hydration. Do not wire this into production yet.
- **Deferred member profile:** novel design, but bundled profile/role endpoints
  are still absent; fallback labels RSVP intent as attendance. Do not adopt
  fabricated attendance or dead role controls as completed functionality.
- Remaining onboarding, money, role-preview and related WIP changes require
  their own comparison and acceptance checks, not automatic copying.

The initial broad mobile run found 62 failures across 16 suites (839 tests passed).
After individual review and fixes, the clean run passes **129 suites / 915 tests**
(one pre-existing skipped chat-preview test). No tests were newly disabled.
Result: `/private/tmp/anstoss-mobile-regression-clean-20261114.json`; process exit 0.
Repeated cleanly at `/private/tmp/anstoss-mobile-regression-checkpoint-20261114.json`.
The subsequent player-calendar extension passes 18 focused schedule/state tests
(including three additional player cases), mobile typecheck and scoped ESLint.
Its full mobile run passes **129 suites / 918 tests**, with the same one pre-existing
skip: `/private/tmp/anstoss-mobile-player-calendar-20261114.json` (exit 0).
The player-calendar simulator rerun now passes (German, dark mode): today selected,
matching-date filter, event details and back, horizontal date scrolling, empty day,
and clear-to-agenda. Screenshot inspected:
`/private/tmp/anstoss-player-calendar-selected-20261114.png`.
Run: `.maestro/redesign-calendar.yaml` with `-e SCENARIO=player`, exit 0.
An earlier attempt collided with another simulator's Maestro driver on port 7001;
its results were rejected. A separate Appium attempt did not connect and its owned
server/build processes were stopped. The Anstoss simulator was restarted without
erasing data. The final passing run used the correct simulator after that conflict.
The full home → coach-switch flow still needs a clean complete rerun; its RSVP
confirmation steps passed earlier. These remain mock UI checks, not connected-role
production evidence.

- Kept DM restrictions, coach editing, stale-response, RSVP API writes and
  guardian proxy-write coverage; updated assertions only for intentional layout
  changes (compact agenda, earliest-child selection, accessible reply labels).
- Fixed actual regressions: stale YES after rescheduling no longer opens check-in;
  visible home/away context restored; latest announcements retained in compact
  rows; family fee amount restored beside its plan and status.
- Squad history now uses actual check-ins from the existing staff-only report.
  RSVP YES never becomes attendance; unknown/padded/failed slots never become
  absences. No staff-report calls for players. Five hook tests cover evidence,
  access loss, failed reports, cancelled/future dates and stale club responses.
- Tab-layout tests now unmount their render trees, fixing a post-teardown import
  error that previously caused exit 1 despite passing assertions.
- Mobile typecheck and scoped ESLint pass. No production database, API deployment
  or store build was changed by this checkpoint.

- Removed the home sponsor section on request; sponsor management is unchanged.
  Fifteen home-branch tests pass; removal visually verified in the running simulator.
- All 76 migrations applied to an isolated local PostgreSQL cluster, including
  `20261114001000_event_rsvp_auto_reminder`. No production database changed.
- API regression after reminder implementation: 134 suites / 1,376 tests pass;
  the opt-in PostgreSQL suite is skipped without its explicit local test URL.
  API build, API/mobile typechecks and scoped API lint pass. Locale coverage
  fixtures now supply the acting-session actor name and duration.

- Calendar/localization follow-up: **29 tests passing** across six suites,
  mobile typecheck, scoped ESLint and `git diff --check` pass.
- `.maestro/redesign-calendar.yaml`: passed date selection, filtering, opening
  match details, returning, horizontal scroll, empty-day selection and clear-to-agenda.
- Expanded `.maestro/redesign-language.yaml`: passed English preview body and
  CTA before Apply, then applied English and returned to German successfully.
- Inspected light/dark selected date and agenda dividers in simulator screenshots;
  dark-mode date-selection check passed. Also checked XL system text and restored
  the original text-size setting. These are local mock UI checks, not live API tests.
- Focused tests: **25 passing** across MessageBubble, ChatInput, inviteShare,
  languageSync and defaultValue-keys. Mobile typecheck and scoped ESLint pass.
- `.maestro/redesign-language.yaml`: passed against the refreshed iOS simulator
  `A9118726-BCB5-44F5-A18F-6C1E5BF97097`, German → English → German.
- Light/dark screenshots inspected for chat metadata and populated language rows.
  Largest accessibility text also checked for chat metadata; composer now caps
  its font scaling at 200%, with a regression test.
- Local video: `/private/tmp/anstoss-language-regression-20261113.mp4`.
- Local signed native build: `/private/tmp/anstoss-redesign-native-20261113`;
  build log: `/private/tmp/anstoss-redesign-native-signed-20261113.log`.
- Native clipboard check: rendered German invite labels, tapped copy, saw
  `Kopiert`, and checked simulator clipboard against the fictional team link.
  A subsequent direct deep link from the still-open invitation modal did not
  navigate; use its Done action before opening the next screen. The independent
  language regression above passed.

## Simulator build configuration

Keep signing enabled even for a local simulator build so keychain-dependent
native modules receive the simulated application identifier:

```sh
xcodebuild -workspace Anstoss.xcworkspace -scheme Anstoss \
  -configuration Debug -sdk iphonesimulator \
  -destination 'id=A9118726-BCB5-44F5-A18F-6C1E5BF97097' \
  -derivedDataPath /private/tmp/anstoss-redesign-native-20261113 \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
```

Run from `apps/mobile/ios`. This is not a distribution build. No production/API
synchronization or store-readiness claim follows from these mocked UI tests.
