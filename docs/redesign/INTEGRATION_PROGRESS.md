# Redesign integration — 2026-11-13

Base: `f0886f74` on `redesign/anstoss-2026-11`.
Working branch: `codex/redesign-integration-20261113`.

The redesign remains the visual source of truth. This branch does not replace
Claude's visual work. Release progress is recorded below.

### Develop / TestFlight preparation — 14 November, late evening

- Promoted `b2ca9768` to `develop`; all six GitHub quality jobs passed.
- GitHub API deployment failed with an invalid Railway project token. The working
  local Railway login deployed that exact API source successfully (deployment
  `b1f865ab-75e4-4bf9-a7f2-2e9edc20e1eb`); public health and database checks passed.
  CI credentials were not replaced with a personal account token.
- Production startup exposed Redis adapter installation on a namespace and a
  lazy Prisma retention query executed outside tenant context. Fixed the owning
  server adapter setup (shared once across namespaces) and awaited the retention
  query within its club context. Full API regression: 143 suites, 1,434 passed,
  30 opt-in skipped; API lint/typecheck/build passed.
- Fixed clipped admin club-detail scrolling using a bounded flex dialog with a
  non-shrinking header and one keyboard-focusable scroll body. Browser wheel
  scrolling reaches top/bottom at 1440×1000 and 390×640; grant controls are visible.
  Admin smoke/lint/build pass. Impeccable's detector was degraded (parser packages
  absent); its Inter warnings are intentionally retained per the approved brand.
- Admin access labels now use Verein (PRO), with SCALE marked custom agreement.
  Limits/grants are shared with mobile, but legacy six-/twelve-month plan
  definitions do NOT manage the advertised monthly/yearly checkout pricing.
  The UI now states that limitation. Do not call billing administration fully
  aligned or a paid checkout verified; this is an open paid-launch item.
- Set native iOS/Android and Expo marketing version to 1.0.2 so this redesign
  cannot regress behind the previous 1.0.1 TestFlight release. EAS owns build numbers.
- Production worker fixes, admin/website rollout and the iOS build are pending
  verification at this source checkpoint; queued work is not a success claim.

## Current owner priority — 2026-11-14, four-role MVP

### Latest verification checkpoint — 14 November, evening

This checkpoint supersedes the older counts and unfinished-code notes below;
earlier entries are retained as historical evidence, not the current release verdict.

- Admin now uses the approved Anstoss brand: self-hosted Inter/Barlow Condensed,
  pitch/ink/lime, warm surfaces, pill actions, readable forms and responsive
  navigation. Verified local browser login/logout, rejected credentials, session
  persistence, overview, clubs/details, users, billing, operations and settings.
  Desktop and phone captures inspected. No production credential was reset.
- Player home has an explicit **Who’s coming? / Wer kommt?** link to the event's
  response list, including before voting and for linked fixtures. Players can
  see response statuses and change their own answer; other people's private
  absence reasons/notes remain staff-only. Added UI and API regression coverage.
- Connected native checks against the isolated Nest/PostgreSQL API passed:
  player requests access, admin approves, player enters club, player answers YES,
  then MAYBE; the coach API sees the corresponding counts. The latter is a change
  of answer, not proof of native reconfirmation after a coach reschedules.
- Free-agent privacy setup and coach invitation were exercised over the real
  local API; native candidate acceptance passed and the coach API confirmed
  ACCEPTED. Maestro emitted a simulator-driver cleanup error after those passing
  steps; do not describe this as a flawless all-device run.
- Native last-club removal passed without sign-out/reload: club identity and squad
  disappeared, the independent portal appeared, and the API returned 403 for the
  removed club. Native account deletion then returned to welcome; the old session
  returned 401. Only the fictional local QA player was deleted. A first deletion
  test tapped below the scroll viewport; centering the target and escaping the
  confirmation question mark fixed the test, and the complete rerun passed.
- Explicit PLAYER/COACH recruitment profiles, vacancies and invitation role
  snapshots are implemented. Self-selected recruitment identity never grants club
  staff permissions. The 16 PostgreSQL tests cover cross-role journeys and
  concurrent duplicate club/team registration (10 journey + 6 registration cases).
- Website copy reflects the MVP in all seven website locales. Removed obsolete
  pilot mailto signup; signup now points to the app, accepts personal email and
  explains that roster/invitations can wait. English browser signup and annual
  toggle checked; Arabic phone signup inspected. Annual €109.90 versus €10.99
  monthly is two months saved. App languages remain six, not seven.
- Full regression: API **141 suites / 1,431 passed, 30 opt-in skipped**;
  mobile **139 suites / 1,067 passed, one existing skip**; shared **166 passed**.
  Admin and website smoke tests, repository lint/typecheck and API/admin/website
  builds passed. Website/worker lint/typecheck scripts that are no-ops are not
  independent quality evidence; website now has an actual locale/link smoke test.
- Production database migrations, real R2 erasure/media upload, historical-storage
  reconciliation, actual email/push delivery and store distribution are not proven
  by this local run. No paid service or store build credit was used.
- The separately reported iPhone 17 Zod `CONSTANT_CATCH` crash matched the other
  running PlantCircle project's installed source, not this Anstoss dependency.
  That project was not edited. Anstoss native QA uses its named Media QA simulator
  and port 8125; cold launch needs the explicit dev-client connection first.
  Earlier retry failures were on the dev-client launcher, not app error screens;
  the subsequent connected login/removal/deletion passes used the loaded bundle.

### Independent recruitment / erasure follow-up — 2026-11-14

Latest requested scope and unfinished work live in [FREE_AGENT_MVP.md](./FREE_AGENT_MVP.md).
This pass implements removal/access and opt-in/privacy foundations; it does not
claim coach-specific recruitment or automated matching is finished.

- Last-club removal switches PLAYER/COACH accounts to the independent portal,
  preserves other memberships, revokes stale invitations and pauses an old
  listing. No profile is created or published by removal.
- Mobile refreshes `/me` on server socket revocation, foreground and a bounded
  active-app poll. Late account responses cannot undo sign-out. The regression
  tests exercise auth state, not a native removal recording.
- Discovery defaults off. The legacy onboarding endpoint now honours the
  supplied trial preference and never forces PUBLIC visibility.
- Added transactional `MediaDeletionJob` queue for referenced account/profile/
  individual media. Retries storage failures, waits out issued upload URLs,
  alerts on overdue work and removes completed jobs. Local QA migration applied;
  production migration and actual R2 deletion are not tested/deployed here.
- Re-read profiles under the account lifecycle lock during deletion; preserve
  fresh trial tenant scope. Validate clip/thumbnail ownership, stored metadata
  and storage availability. Ignore foreign legacy thumbnails during erasure.
- Expanded recruitment preferences in data export. Updated DE/EN privacy,
  terms and deletion information in both app and website, retaining the 30-day
  deletion commitment. Historical/orphan media and retained markers still need
  reconciliation; policy edits are not a blanket GDPR-compliance certification.
- Verification: API **140 suites / 1,427 passed**, 29 opt-in tests skipped in
  the default run. Separately, **9 HTTP/PostgreSQL journeys passed** (52 with
  UsersService tests). Mobile **139 suites / 1,060 passed**, one existing skip.
  API/mobile typecheck, API lint, changed-mobile-file lint and API build passed.
  Website static-copy build passed; no browser/device visual pass is claimed.
- Full mobile lint exposed seven existing errors in untouched admin-billing,
  CombinedHome, Text and recruitment Cards files (raw style literals / unused
  typography imports). The full repository is not marked lint-clean.
- No commit, push, production deployment, production migration or paid store
  build was performed. Existing simulator API still runs the earlier code;
  local source changes are not evidence that its current session was updated.

Admin, player, coach and free-agent journeys are the release priority. Family /
guardian journeys come later. Finish shared-state correctness before expanding
optional Studio/AI/reward features. The website remains in scope, but its claims
must reflect this MVP rather than the full design roadmap.

- Family-management links in Verein and Kader are now behind the disabled
  `FAMILY_FEATURE_ENABLED` launch switch. `/team-families` redirects to Home
  without mounting its data-fetching component. No family data or API is deleted.
- Normal onboarding hides the parent-role choice and guardian setup-code link;
  player, coach, admin and free-agent entry points remain. Deferred-family tests
  explicitly enable the switch, so their future coverage is preserved.
- This is a navigation/onboarding boundary, not a claim that every legacy parent
  endpoint/invite or consent-management route has been retired. Existing consent
  withdrawal and age/privacy safeguards must not be removed to simplify menus.
- Verified local German simulator: admin navigation, coach squad tools and direct
  family-management deep-link redirect. Flow: `.maestro/mvp-family-hidden.yaml`.
  Screenshots: `/private/tmp/anstoss-mvp-{admin,coach}-family-hidden.png`.
- Focused checks: 29 admin/squad/family-route tests and 43 onboarding tests pass.
  These are mocked/local UI checks, not cross-account production synchronization.
- Final mobile regression: **138 suites / 1,049 passing tests**, one pre-existing
  skip; exit 0. Mobile typecheck, scoped ESLint and diff whitespace checks pass.
  Four deferred-family test failures in an initial run came from a test mock
  getter being copied into a fixed value; corrected the test-only override and
  reran the complete suite. No failing tests were removed or newly skipped.

Next acceptance sequence (finish each before moving on):

1. Player join request → admin decision → refreshed player access, including
   rejection and cross-club denial, using shared persisted API data.
2. Coach event/create/reschedule → player RSVP → coach counts and lineup;
   reminders, reconnect/retry and chat must reflect confirmed server state.
3. Free-agent profile/visibility/media → authorised recruitment/search → trial
   invitation/response → roster transition, with paid-pool restrictions checked.
4. Combined German/English simulator regression and website feature/price claims;
   only then build/release checks. Do not relabel demo fixtures as API evidence.

Studio is a separate five-screen backlog: Brand Kit is the only integrated screen.
Start, Editor, Gratis-Plan and KI-Credits are reviewed incoming implementations,
not completed simulator-tested features. See `STUDIO_REVIEW_20261114.md`.

### Simple registration and duplicate identity — 2026-11-14

Owner decision: no paid feed or DFB agreement dependency. Registration must work
without an external team link, squad import or invitations. Players can be added
later; personal email accounts remain accepted. This does not bypass ownership
review or turn a directory listing into proof of authority.

- Shared schema and mobile form now permit an omitted external link. Any supplied
  link still uses the same HTTPS/provider validation on both client and server.
  Invalid URL refinements now return validation failures instead of throwing.
- Existing directory search/manual fallback is retained. Six locales explicitly
  distinguish listed clubs from clubs already on Anstoss and explain the growing
  directory and optional link. No dataset was imported, scraped or invented.
- PostgreSQL name locks and normalized lookups prevent duplicate club creation
  through either setup or claim approval, and conflicting renames. Normalization
  covers Unicode compatibility, case and whitespace. Historical clubs without
  directory/search-index rows are included. Manual entries reuse existing names;
  a pending claim prevents a second applicant, while the original applicant can
  retry idempotently. No existing club or directory data is deleted/merged.
- Club names are checked globally as requested; generic team names are not
  reserved globally. The team-create service rejects the same normalized display
  name within one club. Different clubs can each have a “First team”.
- Duplicate registration offers prefilled club search and a localized support
  email draft requesting review/correction/deletion. It neither sends an email
  automatically nor grants authority, freezes a club, or deletes data. Mail-app
  failure shows the support address and explicitly says no report was sent.
- Verification: complete API regression **137 suites / 1,413 passed** (four
  opt-in DB suites skipped in this run); complete mobile **138 suites / 1,053
  passed**, one pre-existing skip; shared **9 suites / 166 passed**. Dedicated
  local PostgreSQL registration suite **6/6 passed**, including concurrent club
  creation, concurrent claims and concurrent same-club team creation. API/mobile
  typechecks, shared build, scoped ESLint and diff whitespace checks passed.
- No schema migration was needed: the existing transaction and directory schema
  support these guards. This is application-write-path enforcement, not a global
  unique DB constraint for arbitrary external SQL/imports. Future registration
  writers must use the shared guards. Existing ambiguous/duplicate records are
  not automatically removed.
- Native flow: `.maestro/connected-simple-registration.yaml` passed in German on
  the iOS simulator against the local API and PostgreSQL, with normal OTP login.
  Existing-club rejection, return to search, and a new application without a link
  or players were exercised. Database readback confirmed one SUBMITTED claim,
  null externalTeamUrl, team II and no membership granted to the applicant.
  Screenshots: `/private/tmp/anstoss-registration-duplicate.png` and
  `/private/tmp/anstoss-registration-submitted.png`; recording:
  `/tmp/anstoss-simple-registration.mov`. The captured confirmation exposed old
  copy promising a Fussball comparison/review deadline; those claims were removed
  in all six locales and preparation marked optional. After refreshing Metro,
  native assertions for the revised German confirmation and optional preparation
  also passed (`/private/tmp/anstoss-registration-confirmed.png`). Final focused
  onboarding/locale regression: 48/48 tests passed. These changes are local,
  not deployed. Bulk join approval, roster import and the broader four-role native
  synchronization sequence are not marked complete by these registration tests.

### Connected API evidence — 2026-11-14

Connected player approval follow-up (local, real API/PostgreSQL):

- Fixed searched-player onboarding: the existing team selector was coach-only,
  allowing club-only player requests. Players now select a squad too; a team
  invitation code keeps its preselected squad. Team lookup retry now actually
  retries. The shared team question is role-neutral in all six locales.
- German iOS flow passed: OTP login → club search → team selection → pending
  request. A separate QA admin session approved that exact team request through
  the HTTP endpoint. Without a tap, login or deep link, the waiting player
  advanced to Home showing `Anstoss QA Lokal · 1. Herren` on the next poll.
- Database readback confirmed PLAYER membership and ACTIVE/TRIAL team access.
  Approval is not a promotion to staff or full-player status. The earlier
  synthetic club application was withdrawn through its normal HTTP endpoint;
  no real registration was changed or deleted.
- Evidence: `/private/tmp/anstoss-connected-player-{team-choice,pending,approved}.png`
  and `/tmp/anstoss-player-approval-connected.mov`. The initial team-choice capture
  revealed coach-specific wording, subsequently replaced with role-neutral copy.
- Final mobile regression: **138 suites / 1,056 passed**, one pre-existing skip;
  typecheck and scoped ESLint passed. Seven HTTP/PostgreSQL journey tests passed,
  including rejection/reapplication, withdrawal, cross-club denial, coach RSVP
  synchronization and free-agent transition. Those last journeys are API tests,
  not complete native-device journeys.
- The separate fresh-login readback helper hit the QA account's five-OTP/hour
  limit. The already-authenticated native session and direct DB readback proved
  approval; auth limits were not weakened or reset. Reuse sessions for extended
  QA or wait for the limit; do not treat that helper attempt as passed.
- Admin approval was driven via HTTP, not the admin UI. Native rejection and
  the remaining coach/free-agent/UI acceptance sequence remain open. No release,
  production migration, deployment or paid build was performed.

Connected native QA follow-up (local only): full AppModule now has a dedicated
loopback API harness (`apps/api/scripts/mvp-simulator.ts`), an empty migrated
`anstoss_mvp_sim_test` database, four fictional accounts and normal OTP login.
No provider credentials, production writes or paid builds are involved. The
signed-out E2E link clears demo interception; other scenario links are not used.
Metro must use `NODE_OPTIONS=--dns-result-order=ipv4first` with `--localhost`:
otherwise its IPv6-only listener advertises an unreachable IPv4 bundle URL.

The connected simulator exposed a real route-order bug: `/clubs/:clubId`
swallowed `/clubs/search` and `/clubs/lookup`, returning empty HTTP 200 bodies
which the mobile search interpreted as no results. Reordered the controllers
in ClubsModule; the new HTTP regression uses production controller ordering
and reproduced both failures before the fix. The dedicated running API was
restarted; connected German simulator search and player approval/polling now
pass. The searched-player team-selection gap is fixed as described above.
Keep the remaining four-role acceptance sequence open; club membership alone
is not evidence of squad access.

Reproduction tools: `.maestro/connected-player-request.yaml`,
`.maestro/connected-player-approved.yaml` and the local-only
`apps/api/scripts/mvp-simulator-client.mjs`. The approval script must only run
after the native request exists. Its session tokens are never printed.

Added `apps/api/src/clubs/mvp-journeys.db.spec.ts`: **7 passing HTTP/PostgreSQL
integration tests**, with separate signed sessions, actual auth/role/age guards,
tenant middleware/interceptor, exception filter and domain services. The fixture
client only seeds accounts/clubs/teams; journey transitions use actual HTTP routes.

Verified:

- Player request → admin queue → approval → refreshed `/me`, decision polling and
  protected team access. Player/coach/foreign-admin approval attempts are denied;
  repeat approval does not duplicate membership, roster or audit entries.
- Rejection reason reaches the applicant. Reapplication increments the revision;
  a stale review cannot approve it. Withdrawal is owner-only and grants no access.
  A foreign-club team cannot be injected into a join request.
- Existing lifecycle distinction: normal club approval grants ACTIVE/TRIAL team
  access. Coach acceptance subsequently grants FULL squad access; trial players
  are intentionally excluded from squad-size/readiness counts. The test performs
  both steps rather than silently seeding FULL access.
- Coach creates a match → player sees it and responds → coach reads the response
  in summary/feed. Rescheduling marks the player's answer stale; reconfirmation
  clears that state. Repeated responses retain one RSVP row. A real chat system
  notice is persisted. Lineup drafts are hidden until squad publication.
- Free-agent PRIVATE/CLUB_ONLY visibility, postal-code redaction, authorised trial
  invitation, player acceptance, trial-session-only feed, offer, membership
  application validation and admin approval. Trial roster acceptance cannot bypass
  the application. Joining produces FULL access, marks the trial JOINED and takes
  the profile off the transfer list.

Full API regression with all three opt-in DB suites enabled: **139 suites / 1,429
tests passed**, including the existing 7 reminder and 7 Studio PostgreSQL tests.
API typecheck, scoped ESLint and whitespace checks pass. No schema migration was
needed for these exercised transitions; no production database was modified.

Boundaries: this uses the existing isolated local PostgreSQL 17 test cluster, not
production PostgreSQL 18. Outbound push and socket transports are stubbed (their
emit calls are checked, not delivery); OTP/email, Redis rate limits, platform
kill-switch wiring, live media storage and store billing are not exercised by the
new HTTP suite. The free-agent test establishes current visibility/recruitment
behaviour, **not premium-pool entitlement enforcement**. It does not establish that
every mobile screen refreshes correctly against a live API. No release claim.

Run the new suite with an explicitly supplied local `*_test` URL:

```sh
ANSTOSS_MVP_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:PORT/anstoss_test npm test --workspace=@anstoss/api -- --runTestsByPath src/clubs/mvp-journeys.db.spec.ts
```

It never falls back to `DATABASE_URL`; it rejects non-local/non-test targets and
removes only fixture IDs created by its own run. Without the opt-in URL it skips.
Remaining acceptance work: connected mobile refresh/reconnect and German/English
journeys; chat translation/delivery; free-agent media and premium gating; website
MVP/price claims and the release build checks. Family journeys remain deferred.

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

### Brand Kit and session-scoped plan checkpoint — 2026-11-14

- Added Brand Kit with real logo fallback, colour management, font selection and
  confirmed save/error/retry states; read-only roles remain read-only. Six locales
  are wired. No credit balance, connected social account or AI action is invented.
- Fixed a real role-switch bug in `useClubPlan`: a club-only global cache could
  reuse the player's read-only plan for an admin in the same club. Plan snapshots
  are now scoped to account/token/club/role/offices, with stale-request rejection,
  runtime validation and confirmed trial updates shared only within that scope.
  Abo shows loading/retry instead of a fabricated free-plan/read-only state.
- German Brand Kit Maestro passed sponsor/colour settings navigation, font
  changes and re-entry, including XL text. Dark screenshot inspected. Local mock
  trial only; no paid subscription or production plan was changed. Light mode,
  small-phone, Android and measured release-motion acceptance remain pending.
- Full mobile suite before the family-scope follow-up: 137 suites / 1,045 passing
  tests, one pre-existing skip. Focused plan-hook tests: 11; Abo tests: four.
- Source checkpoints are local/uncommitted; no production migration, deploy,
  store build, or push occurred during this review.

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
