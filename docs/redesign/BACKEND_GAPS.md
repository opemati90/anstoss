# Anstoss Redesign (2026-11) — backend gaps

The mobile app now follows the 34-screen Anstoss Redesign. Every screen is wired to
existing endpoints; elements whose data the API does not provide yet are hidden or
fall back to the previous behaviour. This list is what the API needs for the design to
be complete, grouped by priority. Suggested shapes are starting points, not contracts.

## Done

| Design | What shipped |
|---|---|
| 09 Mitteilungen | `InboxNotification` table; inbox-worthy pushes (events, Absagen, join requests, dues, trials, consent, moderation, fixture changes, full time) are stored per recipient even when the push is muted or in quiet hours; chat is excluded. `GET /me/notifications` (cursor), `GET /me/notifications/unread-count`, `POST /me/notifications/:id/read`, `POST /me/notifications/read-all`; 90-day retention worker. App: bell dot, `/notifications` screen with inline Annehmen/Ablehnen. |
| 14 Live-Spiel | `MatchLive` + `MatchLiveEvent` on MATCH events (any match, with or without fussball.de). `GET/PATCH /clubs/:c/events/:e/live` (kick-off → half time → second half → full time), `POST …/live/events` (GOAL, CONCEDED, YELLOW, RED, SUB), `DELETE …/live/events/:id` (undo, score recounted). Coaches only for writes; `live:match` socket broadcast in room `live-event:{eventId}`; goal and full-time pushes. App: Tor / Gegentor / Karte / Wechsel with player picker, clock button, long-press undo; event detail's Live button opens it for every match. |
| 29/31 Vorschau und Vertretung | `ActingSession { clubId, actorUserId, teamId, role: COACH, reason?, startedAt, expiresAt, endedAt? }` (tenant-scoped). Vorstand (OWNER/ADMIN) in any team, Teammanager (TEAM_COORDINATOR until per-team TEAM_MANAGER lands) in own team only; 15/30/60 min; starting replaces the actor's running session. While unexpired, `TeamsService.assertEventManagementAccess` / `assertManageAccess` / `assertReadableAccess` grant coach access for that team (membership still required). Audit `acting_session.started/ended` ("Yemi (Vorstand) als Trainer", `actingSessionId`); head coaches get `ACTING_SESSION_STARTED` push + inbox. App: ink card on Mehr, `PreviewCoverSheet`, `ActingAsBanner` on every tab; Vorschau (player/parent) is client-only with all writes blocked in the API client. Open: per-write `actingSessionId` attribution on Event/Message rows (today only the audit log records it). |

## P1 — visible gaps on core screens

| Design | Element | Missing | Suggested shape |
|---|---|---|---|
| 11 Termin anlegen | "Team benachrichtigen" (auto-reminder 24h before) | No flag on Event | `rsvpAutoReminder: boolean` (default true) on create/update + scheduled `remind-rsvp` job |
| 30 Mehrere Rollen | Combined multi-role home | Client only (data exists) | Frontend role resolution; no API change |

## P2 — onboarding and squad

| Design | Element | Missing | Suggested shape |
|---|---|---|---|
| 04 Beitreten | "Ich bin Kofi Osei, Nr. 9" — claim your roster slot while joining | Slots only visible to members | `GET /public/teams/by-code/:joinCode/roster-slots` (unclaimed only: `id, fullName, jerseyNumber`); optional `rosterSlotId` on join request, claimed on approval |
| 05 Rolle | Several roles in one request | Join request carries one role | `roles: ('PLAYER'\|'PARENT'\|'COACH')[]`, board confirms each |
| 06 Verein anlegen | Crest upload, DFB club number, second colour | Not on `submitFirstClubClaimSchema` | `secondaryColor`, `federationClubNumber?`, `badgeUploadId` |
| 07b Kader anlegen | Role chips, captain, invite by e-mail/phone, "Eingeladen" tag | Roster slot has name + number only | `role`, `isCaptain`, `email` on `rosterSlotInputSchema`; send invite when contact given; return invite status |
| 07 Team einladen | Short team code ("SVS-7K2Q") on the invite card | Campaign code used instead | Human-readable code per campaign |
| 17 Spielerprofil | Profile route with season stats, attendance, roles, dues, Spielerpass | None of these per member | `GET /clubs/:c/teams/:t/members/:u` bundling `{ appearances, goals, assists }`, `attendance { items, attended, total }`, `operationalRoles[]`, `contributionStatus`, `playerPass { number, validUntil }`. Needs product sign-off: rows currently open DM / edit sheet |
| 16 Kader | Attendance bars per row | No per-member attendance on roster-ops | `recentAttendance: { attended, total }` on `RosterOpsMemberSummary` |
| 15 Chat | "Gelesen von N" | No read count on channel messages | `readCount` on channel message DTO (receipts exist) |
| 08 Start Trainer | "Treffpunkt ankündigen" as a pinned message | No pinned flag on create | `pinned: boolean` on message create |
| 08 Start Trainer | Lineup row subtitle "Entwurf 4-2-3-1 · 9 von 11" | No draft summary on the feed | `lineupDraft: { formation, filled, slots }` on event feed / roster-ops |
| 25 Start Eltern | Photo-consent row per child | Not in children overview | `photoConsent: 'GRANTED'\|'PENDING'\|null` on `/me/children-overview` |

## P3 — money, league data, polish

| Design | Element | Missing | Suggested shape |
|---|---|---|---|
| 19 Kasse | Month chip | No period selector | `GET /clubs/:id/contributions?period=YYYY-MM` |
| 19 Kasse | "Kontoauszug" / "Bar beim Training" meta | Payment method not stored | `paymentMethod` on `ContributionMemberRecord` |
| 19 Kasse | "Gemeldet" status | Encoded as a magic `note` string | `paymentReported: boolean` on `ContributionMemberRecord` |
| 26 Meine Beiträge | Paid history by month | Only current period per plan | `history: { planId, period, amount, paidAt, method }[]` on `MyContributionSummary` |
| 18 Mehr | Row values: table position, new Wechselbörse candidates, invite code | No cheap summary | `GET /me/summary → { tablePosition, newFreeAgents, teamInviteCode }` |
| 20 Tabelle | Form column for every club | `TableSnapshotRow` has no form | `form: ('W'\|'D'\|'L')[]` (last 5) from the scraper |
| 20 Tabelle, 12 Termin | "Berlin · Staffel 3", "Kreisliga C · 11. Spieltag" | No region/division/matchday | `region`, `division` on `ImportedFixture`/`ExternalTeamLink`; `competition { name, matchday? }` on `EventDetail` |
| 14 Live-Spiel | Opponent crest colour | Not in feed | `homeColor`, `awayColor` on `ImportedFixture` |

## Client-only follow-ups (no API change)

- **Offline banner + queued RSVPs (28):** add `@react-native-community/netinfo` and a persisted RSVP outbox.
- **Languages (02):** the design lists de/en/tr/es/fr/pt/ar; the app ships de/en/fr/it/pt/tr. Spanish and Arabic (with RTL) are product decisions plus server-side e-mail/push templates.
- **Copy buttons (MyDues, Invite):** add `expo-clipboard`.
- **Sign in with Apple/Google (03):** not in scope of the email-OTP auth today.
- **Lineup drag-and-drop from the bench (13):** the tap-a-spot picker is kept.

## Contract for backend

| Endpoint | Request | Response | Schema (packages/shared) | Status |
|---|---|---|---|---|
| `GET /clubs/:clubId/plan` (35 Abo, 19 Mehr row) | — (any club member) | `ClubPlan { clubId, tier: FREE\|PRO\|SCALE, source: NONE\|TRIAL\|PAID\|COMPLIMENTARY\|MIGRATED, trialEndsAt, trialUsed, limits {teams, players}, usage {teams, players}, prices { monthly, yearly: { amountCents, currency } }, features: Record<PlanFeature, boolean>, canManage, salesEmail? }` | `clubPlanSchema` (schemas/plan.ts) | Built: `apps/api/src/billing/plan.controller.ts` |
| `POST /clubs/:clubId/plan/trial` (35 Abo) | `{}`; Vorstand (OWNER/ADMIN/BOARD_MEMBER) or Kassenwart (TREASURER) only, one trial per club | `ClubPlan` (PRO, source TRIAL, `trialEndsAt` = now + 30 days); 403 others, 409 used/already Verein | `startPlanTrialSchema` | Built: TRIAL `EntitlementGrant`, no card, expires to FREE |
| `GET /clubs/:clubId/acting-sessions/candidates` (29 Vertretung row) | — (Vorstand / Teammanager) | `{ items: { teamId, teamName, headCoachName, coachAway }[] }`, away coaches first, teams the caller coaches excluded | `actingCandidateSchema` (schemas/acting.ts) | Built: `apps/api/src/acting/` |
| `POST /clubs/:clubId/acting-sessions` (29/31) | `{ teamId, role: 'COACH', durationMin: 15\|30\|60, reason? }` | `ActingSessionDto { id, clubId, teamId, teamName, role, reason, startedAt, expiresAt, endedAt }`; 403 `ACTING_SESSION_FORBIDDEN`, 404 `ACTING_SESSION_TEAM_NOT_FOUND` | `startActingSessionSchema`, `actingSessionSchema` | Built |
| `DELETE /acting-sessions/:id` (31 Beenden) | — (actor only) | `ActingSessionDto` with `endedAt`; 404 `ACTING_SESSION_NOT_ACTIVE` | `actingSessionSchema` | Built |
| `GET /me/acting-session` (31 banner) | — | `{ session: ActingSessionDto \| null }` | `CurrentActingSessionResponse` | Built |
| `POST/PATCH /clubs/:c/events`, `POST …/events/series` (12 Termin anlegen) | `rsvpAutoReminder?: boolean` (default true): "Team benachrichtigen", remind open replies 24 h before | `EventDetail.rsvpAutoReminder` | `eventLogisticsShape.rsvpAutoReminder` (schemas/event.ts), `Event.rsvpAutoReminder` | Client sends it; server strips it today (no column, no job) |
| `GET /clubs/:c/events/:e` (13 Event hero) | — | `competition: { name, matchday \| null } \| null` ("Kreisliga C · 11. Spieltag") | `eventCompetitionSchema` (schemas/event.ts), `EventDetail.competition` | Mocked in e2e; absent → kind line "Spiel · Heim" |
| `GET /clubs/:c/events/:e/live` (15 Live-Spiel) | — | `opponentColor?: string \| null` (opponent crest fill) | `MatchLiveStateDto.opponentColor` (types/live.ts) | Mocked in e2e; absent → white crest |
| Push/inbox `target.actorName` (10 Mitteilungen) | — | `InboxNotification.target.actorName` for JOIN_REQUEST and RSVP_UPDATE (avatar initials + bold name) | `InboxNotification.target` | Built: join-requests + events services add it |
| `POST /auth/oauth/:provider` (03 Anmelden, Apple / Google) | `{ idToken, fullName? }`, provider `apple\|google` | Same session payload as `POST /auth/otp/verify` (30-day JWT, JIT user) | `oauthSignInSchema`, `oauthProviderSchema` (schemas/onboarding-redesign.ts) | Client stub `src/auth/oauth.ts` throws `OAuthNotAvailableYetError` → "Bald verfügbar" note |
| `GET /public/teams/by-code/:joinCode/roster-slots` (04 "Ich bin …, Nr. 9") | — | `{ slots: { id, fullName, jerseyNumber \| null }[] }` (unclaimed only); the app shows the slot matching the user's name | `publicRosterSlotsResponseSchema` | Mocked in e2e; 404 → row hidden |
| `rosterSlotId?`, `additionalRoles?` on `POST /clubs/:c/join-requests`, `…/staff-access-requests`, `/onboarding/join-team` (04/05) | slot claimed on approval; other ticked roles (`PLAYER\|COACH\|PARENT\|ADMIN`) for the board to confirm. `ADMIN` alone → `staff-access-requests { desiredRole: 'ADMIN' }` (exists) | unchanged | `joinRequestExtrasSchema` | Client sends them; server strips them today |
| `federationClubNumber?`, `secondaryColor?`, `badgeUploadId?` on `POST /club-claims/first` (06 Dein Verein) | DFB Vereinsnummer (4–10 digits, verified badge), Zweitfarbe hex, crest upload id | unchanged | `clubClaimExtrasSchema` | Client sends them; server strips them today |
| `POST /uploads/club-badge` (06 Wappen hochladen) | `{ contentType: 'image/png' }` | `{ uploadId, uploadUrl }` (presigned R2 PUT) | — | Client tries it on submit; failure → claim without badge |
| `GET /clubs/:c/teams/:t/join-code` (07 for coaches) | — (coaches of the team, admins) | `{ teamId, code, link, expiresAt \| null }` | `teamJoinCodeResponseSchema` | Mocked in e2e; admins use invite campaigns; failure → "nur Vorstand" card |
| `role?`, `isCaptain?`, `email?` per slot on `POST /clubs/:c/teams/:t/roster-slots`; `role`, `isCaptain`, `inviteStatus: NONE\|SENT` on `GET` (07b Kader anlegen); coaches of the team allowed (today OWNER/ADMIN only) | send invite when `email`/`phone` given | see request | `rosterSlotExtrasSchema`, `rosterSlotStatusSchema` | Mocked in e2e; server strips the keys today |
| `GET /clubs/:c/teams/:t/members/:u/profile` (17 Spielerprofil) | — (team members; dues block only for Vorstand, Kassenwart, the member) | `TeamMemberProfile { userId, roles: (PLAYER\|CAPTAIN\|COACH\|TEAM_MANAGER\|TREASURER\|BOARD)[], memberSince, season, stats {appearances, goals, assists} \| null, attendance {items: boolean[], attended, total} \| null, duesState: CURRENT\|OPEN\|OVERDUE \| null, playerPass {number, validUntil} \| null }` | `teamMemberProfileSchema` (schemas/team-boards.ts) | Mocked in e2e (`teamBoardMocks.ts`); missing → "–" values, attendance from past trainings |
| `PUT /clubs/:c/teams/:t/members/:u/roles` (17 Rollen chips) | `{ roles: MemberRoleKey[] }`; Vorstand (OWNER/ADMIN) only | `TeamMemberProfile` | `updateMemberRolesSchema` | Mocked in e2e; failure → chips roll back + alert |
| `GET /me/summary?clubId=&teamId=` (18 Mehr row values) | — | `MoreSummary { openDues, tablePosition, newFreeAgents, teamInviteCode }` (all nullable) | `moreSummarySchema` | Mocked in e2e; missing → rows without values |
| Kader attendance bars (16) | existing `GET /clubs/:c/events?teamId&scope=past&type=TRAINING&limit=4` + event details (YES = attended) | — | — | Works today (N+1); replace with `recentAttendance: boolean[]` on `RosterOpsMemberSummary` |
| `?period=YYYY-MM` on `GET /clubs/:c/contributions` (20 Kasse month chip) | period | `ContributionOverview.period`; records gain `paymentMethod` (`ContributionPaymentMethod`), `confirmedVia: STATEMENT_IMPORT\|TREASURER`, `paymentReported`, `reportedAt` | types/platform.ts | Client sends it; old servers ignore it (current period). `paymentReported` replaces the `PAYMENT_REPORTED_BY_MEMBER` note marker (both read) |
| `TableSnapshotRow.form?: ('W'\|'D'\|'L')[]`, `ImportedFixture.region?`, `.division?` (21 Tabelle) | scraper fills them | — | types/integrations.ts | Mocked in e2e; missing → no form column, header shows season only |
| `FreeAgentListItem.distanceKm?` + club-centred search when `radiusKm` is sent without `postalCode` (22 Wechselbörse "3 km", "in 10 km Umkreis") | `radiusKm=10` | `distanceKm` per item | types/models.ts | Mocked in e2e; missing → no distance |
| `EventFeedItem.matchKind?: LEAGUE\|CUP\|FRIENDLY\|TOURNAMENT` (08/22/23 "Ligaspiel · Heim") | — | on every events feed row | `matchKindSchema` (schemas/home.ts) | Mocked in e2e; missing → "Spiel" |
| `EventFeedItem.lineupDraft?: { formation, filled, slots, published?, mySlot? }` (08 "Entwurf 4-2-3-1 · 9 von 11", 28 "Du stehst selbst auf der 9") | — | coaches only; `mySlot` = the reader's own shirt in the draft | `lineupDraftSummarySchema` | Mocked in e2e; missing → lineup row without subtitle |
| `EventFeedItem.carpoolSummary?: { seeking, seatsFree, myRideSeats }` (25 Fahrgemeinschaft "2 Kinder suchen noch eine Mitfahrt") | — | on `/me/children-events` rows for away matches | `carpoolSummarySchema` | Mocked in e2e; missing → "Mitfahrten fürs Auswärtsspiel planen" |
| `ChildOverviewChild.photoConsent?: GRANTED\|PENDING\|DECLINED` on `GET /me/children-overview` (25 Fotoeinwilligung) | — | per child | `photoConsentStatusSchema` | Mocked in e2e; row always shown, "Prüfen" opens `/child-consent` |
| `GET /clubs/:clubId/teams/:teamId/my-season` (22 "Deine Saison: 9 Einsätze · 6 Tore · 7 von 8 Trainings") | — (the reader) | `MySeasonSummary { season, appearances, goals, trainingsAttended, trainingsTotal }` | `mySeasonSummarySchema` | Mocked in e2e (homeMocks.ts); missing → streak/team record or empty detail |
| `MyContributionSummary.history?: { planId, planName, period: YYYY-MM, amount, currency, paidAt, method }[]` (26 BEZAHLT "November · Bar beim Training · 03.11.") | — | newest first | `contributionHistoryEntrySchema` | Mocked in e2e; missing → paid plans list as before |

### Matchday Studio (boards 38–42, REVAMP_HANDOFF "Matchday Studio")

Mobile is built against these and mocked in `apps/mobile/src/e2e/studioMocks.ts`. Nothing below exists in `apps/api` yet except the two flags marked Built. All routes sit under the `matchdayStudio` plan feature (403 for free clubs) and need a Studio role: Vorstand (OWNER/ADMIN/BOARD_MEMBER), Teammanager (TEAM_COORDINATOR today), Kapitän, team coach, or Medienwart (`ClubOperationalRole.MEDIA_MANAGER`). Schemas: `packages/shared/src/schemas/studio.ts`.

| Endpoint | Request | Response | Schema (packages/shared) | Status |
|---|---|---|---|---|
| `PlanFeature.matchdayStudio` on `GET /clubs/:clubId/plan` | — | `features.matchdayStudio` true on PRO/SCALE only | `PLAN_FEATURES` (schemas/plan.ts) | Built: `ClubEntitlementsService.featureFlags`; routes must call `hasFeature(clubId, 'matchdayStudio')` |
| `ClubOperationalRole.MEDIA_MANAGER` (Medienwart) | set via the existing `operationalRoles` update; member profile chip sends `MEDIA_MANAGER` in `roles` | — | `ClubOperationalRole`, `MEMBER_ROLE_KEYS` | Built: enum + migration `20261113230000_media_manager_role`; role toggle on the member profile still needs the profile-roles endpoint |
| `GET /clubs/:clubId/studio/context?teamId=&eventId=` | optional `eventId` pins a match (Lineup / LiveMatch entry points) | `{ eventId \| null, consents: { userId, photoConsent, publicNaming, isMinor, parentalConsent: { photo, name } \| null, cutoutUrl? }[] }`. Without `eventId` the server picks the match that is "jetzt dran": running, else finished in the last 24 h, else next. Consents cover the team's players | `studioContextSchema`, `studioPlayerConsentSchema` | Mocked. Missing → client picks from the events feed and treats every player as "no consent" (no names, no photos) |
| `GET /clubs/:clubId/studio/brand-kit` | — | `StudioBrandKit { clubId, crestUrl, sponsors: { id, name, logoUrl }[], colors { primary, accent, dark, light }, fontPairing: CONDENSED\|CLASSIC\|MODERN, handle, hashtags[], accounts: { channel: INSTAGRAM\|FACEBOOK, connected, handle }[], templateSetAt }` | `studioBrandKitSchema` | Mocked. Missing → club colour, no sponsors, no handle |
| `PUT /clubs/:clubId/studio/brand-kit` | partial `{ fontPairing?, handle?, hashtags?, sponsors?: { id, name }[] }`; colours are read-only (club setup). Sponsor logo upload removes the background server-side (reuse the sponsors upload) | `StudioBrandKit` | `updateStudioBrandKitSchema` | Mocked |
| `POST /clubs/:clubId/studio/accounts/:channel/connect`, `DELETE …/accounts/:channel` | `channel` = `instagram` \| `facebook` | `{ url }` Meta OAuth URL the app opens in the browser | `studioAccountConnectResponseSchema` | Mocked. Missing → "Bald verfügbar" note |
| `GET /clubs/:clubId/studio/credits` | — | `StudioCredits { balance, monthlyAllowance: 100, monthlyRemaining, purchasedRemaining, resetsAt, costs { VARIANT: 1, CAPTION: 1, CUTOUT: 2, TEMPLATE_SET: 20 }, packs: { id, credits, amountCents, currency, savingsPercent }[], canBuy, ledger[] (newest 50) }` | `studioCreditsSchema`, `studioCreditLedgerEntrySchema` | Mocked (84 left). Missing → balance 0, AI buttons read "Credits holen" |
| `POST /clubs/:clubId/studio/credits/checkout` | `{ packId }`; Vorstand, Kassenwart, Medienwart only (403 others). Packs: 100 / 4,99 €, 300 / 11,99 €, 1.000 / 29,99 €, incl. VAT, one-off | `{ url }` Stripe Checkout on the website (existing Stripe integration). The apps never sell credits natively. The grant is written by the Stripe webhook, not by this call | `studioCreditCheckoutSchema`, `STUDIO_CREDIT_PACKS` | Mocked (grants at once for the preview) |
| `POST /clubs/:clubId/studio/ai/variants` (1 credit) | `{ template, style, format, eventId?, graphicId? }` | `{ variants: { id, style, accent \| null }[3], balance }` | `studioAiVariantsSchema` | Mocked |
| `POST /clubs/:clubId/studio/ai/caption` (1 credit) | `{ template, language, outcome?: WIN\|DRAW\|LOSS, facts?, previous?, eventId?, graphicId? }`; club language, handle and hashtags appended; loss = respectful, never mocks the opponent | `{ caption, balance }` | `studioAiCaptionSchema` | Mocked. Missing → free template caption, "Neu schreiben" rotates it |
| `POST /clubs/:clubId/studio/ai/cutout` (2 credits) | `{ playerUserId, graphicId? }`; 403 `studio_consent_missing` and no spend without photo consent (parental for minors) | `{ imageUrl, balance }` | `studioAiCutoutSchema` | Mocked; contract only, the boards show no cutout button |
| `POST /clubs/:clubId/studio/ai/template-set` (20 credits) | `{}` | `{ styles: { style, accent, template: JSON }[], templateSetAt, balance }`, stored as editable template JSON | `studioAiTemplateSetSchema` | Mocked |
| `GET /clubs/:clubId/studio/graphics` | cursor | `{ graphics: StudioGraphic[], nextCursor }`, each with `createdBy`, `postedBy`, `postedAt`, `channels`, `mediaUrl` | `studioGraphicsListSchema` | Mocked; no archive screen on the boards yet |
| `POST /clubs/:clubId/studio/graphics` | `{ eventId?, template, style, format, elements { sponsor, handle, competition }, data: template JSON, caption?, channels: INSTAGRAM_FEED\|INSTAGRAM_STORY\|FACEBOOK_PAGE\|WHATSAPP\|SHARE_SHEET[] }`. Server renders PNG (MP4 for clips), archives it, posts to connected Instagram / Facebook via the Meta Graph API, and re-checks consent (reject names or photos without it) | `StudioGraphic` | `createStudioGraphicSchema`, `studioGraphicSchema` | Mocked. Missing → the app still shares its own PNG through the native share sheet |
| `PUT /clubs/:clubId/events/:eventId/live/result` ("Ergebnis eintragen") | `{ goalsFor, goalsAgainst }`; coaches / recorders; marks the match FINISHED | `MatchLiveStateDto` | `setMatchLiveResultSchema` (schemas/live.ts) | Mocked for the Studio demo match. Missing → the score stays on the graphic only |
| `GET /clubs/:c/events/:e/live` additions | — | `halfTime?: { goalsFor, goalsAgainst }`, `shootout?: { goalsFor, goalsAgainst }` ("n.E."), `abandonedAt?`, per event `ownGoal?: boolean` ("Eigentor") | `MatchLiveStateDto`, `MatchLiveEventDto` (types/live.ts) | Proposed; absent → break score counted from events up to 45' |

Credit rules for the backend:

- **Ledger, never a counter.** One row per movement per club: `GRANT`, `SPEND`, `REFUND`, `EXPIRY`, each with `bucket` (`MONTHLY` or `PURCHASED`), `action`, `actor`, `graphicId`, `createdAt`. The balance is the sum.
- **Monthly allowance.** Verein includes 100 credits per club per month: on the 1st write an `EXPIRY` for what is left in `MONTHLY`, then a `GRANT` of 100. Nothing carries over. A trial counts as Verein.
- **Purchased credits** last 12 months from the grant and are spent only after the monthly allowance is used up; expire them with an `EXPIRY` row.
- **Spend** atomically before the generation starts (row lock or a serialisable transaction per club). Short balance → 402 `studio_insufficient_credits`, nothing written.
- **Refund on failure.** A failed or timed-out generation writes a `REFUND` that points at the spend (`reversesId`) into the same bucket.
- **Free:** templates, manual edits, rendering, archiving and posting never touch the ledger.
- Review the costs against real AI cost per action after the first month.
